"""Record Coach Rex's lines ahead of time.

Reads every line from src/voice/lines.ts (via node), speaks it with the
open-source Qwen3-TTS model (the built-in voice "Ryan", directed like a fun
kids' TV host, with a mood per kind of line), tightens the pauses, evens out
the loudness with ffmpeg and writes small MP3 clips to
src/voice/clips/<id>.mp3.

Every clip is checked before it's kept: Whisper transcribes it and it must say
its line, and (when the age/gender model is present) it must still sound like
a man. A clip that fails is re-recorded with another seed. Clips whose text and
voice settings haven't changed are skipped, so re-running is cheap, and clips
for lines that no longer exist are removed.

Setup (CPU is fine, a GPU is faster):
  pip install qwen-tts torch faster-whisper librosa soundfile
  <models>/Qwen3-TTS-12Hz-1.7B-CustomVoice   from huggingface.co/Qwen
  <models>/whisper-small.en                  from huggingface.co/Systran/faster-whisper-small.en
  <models>/agegender (optional)              from huggingface.co/audeering/wav2vec2-large-robust-24-ft-age-gender

Usage (from the repo root):
  python scripts/voice/generate.py --models <dir> [--only id,id] [--force]

The game never synthesises speech while it runs; it only plays these files.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
import librosa

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src', 'voice', 'clips')
VERSION = 2  # bump to re-record everything after changing the processing
SPEAKER = 'ryan'
STYLE = ("Speak like a fun, high-energy children's TV host: bright and warm, smiling while talking, "
         "with lively pitch swings and a quick, bouncy pace. Natural and human, never like an announcer.")
MOODS = [
    (r'^(wet-|meter-missed)', 'Gentle, warm and reassuring, still upbeat and smiling.'),
    (r'^(ask|ask-short|already)$', 'Curious and warm, asking a little kid a question.'),
    (r'^intro-(3|4|prizes|meter|meter-kind)$', 'Clear and upbeat, explaining a fun game to a little kid.'),
    (r'^peekaboo', 'Playful and giggly, playing hide and seek with a little kid.'),
    (r'^joke-time', 'Playful and a little mischievous, about to tell a silly joke.'),
    (r'^joke-.*-q$', 'Playful and mischievous, asking a silly riddle with a curious lilt.'),
    (r'^joke-.*-a$', 'Delivering the punchline of a silly joke with big comic energy, grinning.'),
    (r'^fact', 'Amazed and curious, sharing a cool dinosaur fact with a little kid, like a fun museum guide.'),
    (r'^tickle', 'Giggly and ticklish, laughing while talking.'),
    (r'^wardrobe-hint', 'Playful and a little secretive, like sharing a fun secret with a little kid.'),
    (r'^snack', 'Hungry and silly, then delighted.'),
    (r'^(moves|move-)', 'Energetic and rhythmic, like a fun gym coach for little kids.'),
    (r'^band', 'Cheerful and musical, grooving to the music.'),
    (r'^stars-', 'Bursting with joy and celebrating a huge milestone, big and bouncy.'),
    (r'^(balloons|fireworks)', 'Bursting with joy and celebrating, big and bouncy.'),
    (r'^(intro|greet|pick|picked|color)', 'Excited and warm, like telling a kid great news.'),
    (r'^(dry|first-star|hop|highfive|roar|dance|store)', 'Bursting with joy and celebrating, big and bouncy.'),
    (r'^(egg|acc-)', 'Amazed and excited, like opening a surprise.'),
    (r'^(meter|land)', 'Excited and encouraging.'),
    (r'^chest-more', 'Excited and encouraging, cheering a little kid on.'),
    (r'^(chest|prize)', 'Thrilled, with a little suspense before the big reveal.'),
    (r'^bye', 'Warm and cheerful, saying goodbye.'),
    (r'^tap', 'Playful and giggly.'),
]
MAX_GAP = 0.25  # longest pause kept between phrases, in seconds
FX = 'highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=80:makeup=1.5,loudnorm=I=-16:TP=-1.5:LRA=9'


def load_lines():
    js = "import('./src/voice/lines.ts').then(m => console.log(JSON.stringify(m.LINES)))"
    res = subprocess.run(['node', '--experimental-strip-types', '--no-warnings', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def direction(lid):
    base = lid.split('--')[0]
    mood = next((m for pat, m in MOODS if re.search(pat, base)), 'Excited and warm.')
    return f'{STYLE} {mood}'


def tighten(y, sr):
    """Trim the ends and shorten long pauses between phrases."""
    iv = librosa.effects.split(y, top_db=35, frame_length=1024, hop_length=256)
    if not len(iv):
        return y
    parts = []
    for k, (a, b) in enumerate(iv):
        if k:
            parts.append(np.zeros(int(sr * min((a - iv[k - 1][1]) / sr, MAX_GAP)), dtype=np.float32))
        parts.append(y[a:b])
    pad = np.zeros(int(sr * 0.03), dtype=np.float32)
    return np.concatenate([pad, *parts, pad])


ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = 'twenty thirty forty fifty sixty seventy eighty ninety'.split()


def number_words(n):
    """How a number is said, so a recognizer writing "40" still matches "forty"."""
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10 - 2] + ('' if n % 10 == 0 else ' ' + ONES[n % 10])
    if n == 100:
        return 'one hundred'
    return str(n)


def words(t):
    t = re.sub(r'\d+', lambda m: number_words(int(m.group())), t.lower())
    for a, b in [('woo-hoo', 'woohoo'), ('woo hoo', 'woohoo'), ('t. rex', 't rex'), ('t-rex', 't rex'), ("mcdonald's", 'mcdonalds'),
                 ('yee-haw', 'yeehaw'), ('ha ha', 'haha'), ('ha-ha', 'haha'), ('rooo', 'ro'), ('rawr', 'roar'), ('wheee', 'whee')]:
        t = t.replace(a, b)
    return re.findall(r"[a-z']+", t)


def wer(ref, hyp):
    r, h = words(ref), words(hyp)
    d = np.zeros((len(r) + 1, len(h) + 1), dtype=int)
    d[:, 0] = range(len(r) + 1)
    d[0, :] = range(len(h) + 1)
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (r[i - 1] != h[j - 1]))
    return d[len(r), len(h)] / max(1, len(r))


class MaleCheck:
    """Probability that a clip sounds like a man (audeering age/gender model)."""

    def __init__(self, path):
        import torch
        import torch.nn as nn
        from transformers import Wav2Vec2FeatureExtractor
        from transformers.models.wav2vec2.modeling_wav2vec2 import Wav2Vec2Model, Wav2Vec2PreTrainedModel

        class Head(nn.Module):
            def __init__(self, config, n):
                super().__init__()
                self.dense = nn.Linear(config.hidden_size, config.hidden_size)
                self.dropout = nn.Dropout(config.final_dropout)
                self.out_proj = nn.Linear(config.hidden_size, n)

            def forward(self, x):
                return self.out_proj(self.dropout(torch.tanh(self.dense(self.dropout(x)))))

        class AgeGender(Wav2Vec2PreTrainedModel):
            def __init__(self, config):
                super().__init__(config)
                self.wav2vec2 = Wav2Vec2Model(config)
                self.age = Head(config, 1)
                self.gender = Head(config, 3)
                self.init_weights()

            def forward(self, x):
                h = torch.mean(self.wav2vec2(x)[0], dim=1)
                return torch.softmax(self.gender(h), dim=1)  # female, male, child

        self.torch = torch
        self.fe = Wav2Vec2FeatureExtractor.from_pretrained(path)
        self.model = AgeGender.from_pretrained(path).eval()

    def __call__(self, y16):
        x = self.fe(y16, sampling_rate=16000, return_tensors='pt')['input_values']
        with self.torch.no_grad():
            return float(self.model(x)[0, 1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', required=True)
    ap.add_argument('--only', default='', help='comma-separated ids to (re)record')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--tries', type=int, default=4)
    a = ap.parse_args()

    import torch
    from qwen_tts import Qwen3TTSModel
    from faster_whisper import WhisperModel

    torch.set_num_threads(os.cpu_count() or 4)
    tts = Qwen3TTSModel.from_pretrained(os.path.join(a.models, 'Qwen3-TTS-12Hz-1.7B-CustomVoice'), device_map='cpu', dtype=torch.float32, attn_implementation='sdpa')
    asr = WhisperModel(os.path.join(a.models, 'whisper-small.en'), device='cpu', compute_type='int8')
    male = MaleCheck(os.path.join(a.models, 'agegender')) if os.path.isdir(os.path.join(a.models, 'agegender')) else None

    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    jobs = []
    for lid, line in load_lines().items():
        jobs.append((lid, line['text']))
        if line.get('nameless'):
            jobs.append((f'{lid}--nameless', line['nameless']))
        if line.get('anyGoal'):
            jobs.append((f'{lid}--anygoal', line['anyGoal']))
        for goal, text in sorted((line.get('goals') or {}).items(), key=lambda kv: int(kv[0])):
            jobs.append((f'{lid}--goal{goal}', text))
    only = set(x for x in a.only.split(',') if x)
    done, flagged = 0, []
    for lid, text in jobs:
        if only and lid not in only and lid.split('--')[0] not in only:
            continue
        key = hashlib.sha1(f'{VERSION}|{SPEAKER}|{direction(lid)}|{text}'.encode()).hexdigest()[:12]
        dst = os.path.join(OUT, f'{lid}.mp3')
        if not a.force and manifest.get(lid) == key and os.path.exists(dst):
            continue
        short = len(words(text)) <= 4
        best = None
        for t in range(a.tries):
            torch.manual_seed(7 + t * 101)
            w, sr = tts.generate_custom_voice(text=text, language='English', speaker=SPEAKER, instruct=direction(lid))
            y = tighten(np.asarray(w[0], dtype=np.float32), sr)
            y16 = librosa.resample(y, orig_sr=sr, target_sr=16000)
            heard = ' '.join(s.text.strip() for s in asr.transcribe(y16, beam_size=5, language='en', initial_prompt='Zef, Coach Rex, woo-hoo, underwear')[0])
            err = wer(text, heard)
            # too short to judge reliably
            m = male(y16) if male and len(y16) > 1.5 * 16000 else 1.0
            # score: wrong words count most, then a voice that drifts away from a man's
            score = err + (0.5 if m < 0.6 else 0.0)
            if best is None or score < best[0]:
                best = (score, err, m, y, sr, heard)
            if err <= (0.34 if short else 0.1) and m >= 0.6:
                break
        score, err, m, y, sr, heard = best
        if err > (0.34 if short else 0.1) or m < 0.6:
            flagged.append((lid, err, m, heard))
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            sf.write(tmp.name, y, sr)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp.name, '-af', FX, '-ar', '24000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '48k', dst], check=True)
        os.unlink(tmp.name)
        manifest[lid] = key
        json.dump(manifest, open(manifest_path, 'w'), indent=1, sort_keys=True)
        done += 1
        print(f'{lid} ({len(y) / sr:.1f}s, WER {err:.0%}, male {m:.2f}): {text}', flush=True)
    if not only:
        wanted = {lid for lid, _ in jobs}
        for f in os.listdir(OUT):
            if f.endswith('.mp3') and f[:-4] not in wanted:
                os.unlink(os.path.join(OUT, f))
                manifest.pop(f[:-4], None)
                print(f'removed {f} (no longer a line)')
        json.dump(manifest, open(manifest_path, 'w'), indent=1, sort_keys=True)
    clips = [f for f in os.listdir(OUT) if f.endswith('.mp3')]
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in clips)
    print(f'recorded {done} clips; {len(clips)} clips, {total / 1024:.0f} KB in total')
    for lid, err, m, heard in flagged:
        print(f'CHECK {lid}: WER {err:.0%}, male {m:.2f}, heard "{heard}"')


if __name__ == '__main__':
    sys.exit(main())

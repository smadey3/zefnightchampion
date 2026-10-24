// Grown-ups only: a hold-to-open button and a simple question guard the
// parent corner. In here: record or correct any morning, see stars and the
// underwear meter, set the underwear goal and the prize list, mark prizes
// as handed over, preview any moment, change the dino, back up progress, and
// start over from the very first screen.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGame, useSave } from '../state/store';
import {
  FINAL_RUN,
  GOAL_MAX,
  GOAL_MIN,
  addDays,
  computeQuest,
  daysBetween,
  finalStretch,
  formatKeyLong,
  formatKeyShort,
  missingSinceLatest,
  prizeThreshold,
  questIfRecorded,
  recentRate,
  sortedKeys,
  todayKey,
  type DateKey,
  type NightResult,
  type QuestRules,
} from '../state/progress';
import { lastDotsName, lastDotsSentence, skippedWords } from './meterWords';
import { exportBackup, parseBackup, type SaveData } from '../state/save';
import { removeCurrentChild, resetBoardView, showTitle, startOver, startPreview } from '../game/director';
import { childList, type CloudStatus } from '../state/store';
import { inViewer, retryCloud } from '../state/cloud';
import { GoalChips } from './GoalChips';
import { sfx } from '../audio/sfx';
import { setMusicOn, setSoundOn } from '../audio/core';
import { music } from '../audio/music';
import { CloseIcon, EyeIcon, HeartIcon, MoonLockIcon, SunIcon } from './icons';
import { viewerDownloads } from './viewerDownloads';
import { DINO_COLORS, PRIZE_ICONS, SPECIES, prizeAt, type Prize, type PrizeIcon } from '../game/rewards';
import { UNDERPANTS } from '../game/rewards';

// ------------------------------------------------------------ children, saving and sharing

function SaveStatus({ status }: { status: CloudStatus }) {
  if (status === 'on') {
    return (
      <>
        <p className="status-line ok">
          Saved online with this game, under your Claude account. Open this link on any phone or tablet where you're signed in to Claude and the
          adventures are there, up to date.
        </p>
        <details>
          <summary>Share with family or friends</summary>
          <p className="small">
            <strong>Family who join in</strong> (another parent, a grandparent): open this page's Share menu and invite them by email as an{' '}
            <strong>Editor</strong>. Once they're signed in to Claude, they see the same adventures and can press the morning button on their own phone.
          </p>
          <p className="small">
            <strong>Other families</strong>: invite them by email as a <strong>Viewer</strong>. They can start an adventure for their own child, saved on
            their own device, and they never see or change yours.
          </p>
          <p className="small muted">
            Leave the public link off: while it's on, family members invited by email lose access to the shared adventures.
          </p>
        </details>
      </>
    );
  }
  if (status === 'connecting') return <p className="status-line">Connecting to this game's online storage...</p>;
  if (status === 'guest')
    return (
      <p className="status-line">
        Saved on this device only. You can play here, but this game's online storage belongs to the family who shared it, so your adventures stay in
        this browser. Use Backup below to keep a copy.
      </p>
    );
  return (
    <>
      <p className="status-line">Saved in this browser on this device. Use Backup below to keep a copy.</p>
      {inViewer() && (
        <button className="btn small" onClick={() => void retryCloud()}>
          Turn on online saving
        </button>
      )}
    </>
  );
}

function ChildrenAndSaving({ name, onLeave }: { name: string; onLeave: () => void }) {
  const library = useSave((s) => s.library);
  const cloud = useSave((s) => s.cloud);
  const others = childList(library)
    .filter((c) => c.id !== library.current && c.data.profile.name.trim())
    .map((c) => c.data.profile.name);
  return (
    <section className="card">
      <h2>Children and saving</h2>
      <p>
        Playing now: <strong>{name}</strong>
        {others.length > 0 && <span className="muted"> · also in this game: {others.join(', ')}</span>}
      </p>
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            onLeave();
            showTitle();
          }}
        >
          Switch child or add a child
        </button>
        <button className="btn ghost" onClick={() => useGame.getState().set({ howItWorks: true })}>
          How this game works
        </button>
      </div>
      <SaveStatus status={cloud} />
    </section>
  );
}

// ------------------------------------------------------------ the button

export function ParentButton() {
  const [holding, setHolding] = useState(false);
  const [gate, setGate] = useState(false);
  const timer = useRef<number | null>(null);
  const parentOpen = useGame((s) => s.parentOpen);
  const phase = useGame((s) => s.phase);

  const start = () => {
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      setGate(true);
    }, 1200);
  };
  const stop = () => {
    setHolding(false);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  if (parentOpen || phase === 'title') return null;
  return (
    <>
      <button
        className={`corner-btn parent-btn${holding ? ' holding' : ''}`}
        aria-label="Parent corner — press and hold"
        title="Grown-ups: press and hold"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setGate(true);
          }
        }}
      >
        <MoonLockIcon />
        <svg className="hold-ring" viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="21" />
        </svg>
      </button>
      {gate &&
        createPortal(
          <Gate
            onPass={() => {
              setGate(false);
              useGame.getState().set({ parentOpen: true });
            }}
            onCancel={() => setGate(false)}
          />,
          document.body,
        )}
    </>
  );
}

function makeQuestion() {
  const a = 3 + Math.floor(Math.random() * 6);
  const b = 3 + Math.floor(Math.random() * 6);
  const answer = a * b;
  const opts = new Set<number>([answer]);
  while (opts.size < 4) opts.add(answer + (Math.floor(Math.random() * 9) - 4 || 5));
  return { a, b, answer, options: [...opts].sort((x, y) => x - y) };
}

function Gate({ onPass, onCancel }: { onPass: () => void; onCancel: () => void }) {
  const [q, setQ] = useState(makeQuestion);
  const [miss, setMiss] = useState(false);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="sheet gate">
        <h2 id="gate-title">Grown-ups only</h2>
        <p>
          To open the parent corner, tap the answer to <strong>{q.a} × {q.b}</strong>.
        </p>
        <div className="answer-grid">
          {q.options.map((o) => (
            <button
              key={o}
              className="btn big"
              onClick={() => {
                if (o === q.answer) onPass();
                else {
                  setMiss(true);
                  setQ(makeQuestion());
                }
              }}
            >
              {o}
            </button>
          ))}
        </div>
        {miss && <p className="muted">Here's a new one to try.</p>}
        <button className="btn ghost" onClick={onCancel}>
          Back to the game
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- confirm

interface ConfirmSpec {
  title: string;
  body: ReactNode;
  confirm: string;
  tone?: 'warm' | 'danger';
  onConfirm: () => void;
}

function Confirm({ spec, onClose }: { spec: ConfirmSpec; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="modal-backdrop top" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="sheet confirm">
        <h2 id="confirm-title">{spec.title}</h2>
        <div className="confirm-body">{spec.body}</div>
        <div className="row end">
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            ref={ref}
            className={`btn ${spec.tone === 'danger' ? 'danger' : 'primary'}`}
            disabled={busy}
            onClick={() => {
              if (busy) return;
              setBusy(true);
              spec.onConfirm();
              onClose();
            }}
          >
            {spec.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- helpers

function resultLabel(r: NightResult | undefined) {
  return r === 'dry' ? 'Dry' : r === 'wet' ? 'Not dry' : 'Not recorded';
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function consequence(data: SaveData, date: DateKey, result: NightResult | null): string {
  const name = data.profile.name || 'Zef';
  const goal = data.rules.goal;
  const before = computeQuest(data.records, data.rules);
  const after = questIfRecorded(data.records, date, result, data.rules);
  const parts: string[] = [];
  if (after.stars > before.stars) {
    parts.push(`${name} gets a star (${after.stars} in total).`);
    if (after.prizes > before.prizes) parts.push(`That opens a treasure chest: ${prizeAt(data.prizes, after.prizes - 1).label}!`);
  } else if (after.stars < before.stars) {
    parts.push(`Stars go from ${before.stars} to ${after.stars} (the board settles quietly, with no "taking away" on screen).`);
  }
  if (result === 'wet' && after.latest?.date === date) {
    // a dry night turned not-dry takes off its own dot too
    const from = Math.min(before.meter, goal);
    const to = Math.min(after.meter, goal);
    const meterNote =
      data.rules.meter === 'streak'
        ? 'The underwear meter starts fresh'
        : from === to
          ? `The underwear meter stays ${to >= goal ? 'full' : `at ${to}`}`
          : from - to === 1
            ? 'The underwear meter loses one dot'
            : `The underwear meter goes from ${from} to ${to} dots`;
    parts.push(`Coach Rex gives ${name} a big hug. ${meterNote}; all ${after.stars} stars stay.`);
  } else {
    // a dry morning after a gap in the last dots starts them over
    if (result === 'dry' && after.missedRestart?.on === date) {
      const skipped = skippedWords(after.missedRestart.after, date);
      parts.push(
        `This starts ${lastDotsName(data.rules)} over, because ${skipped.text}. If you know ${skipped.many ? 'they were' : 'it was'} dry, record ${skipped.many ? 'those mornings' : 'that morning'} first.`,
      );
    }
    if (after.meter !== before.meter) {
      if (after.goalReachedOn && !before.goalReachedOn && !data.underpants.earned) parts.push('The underwear meter fills up — the Underwear Store opens!');
      else parts.push(`The underwear meter becomes ${Math.min(after.meter, goal)} of ${goal}.`);
    }
  }
  if (!parts.length) parts.push('Nothing on the board changes.');
  return parts.join(' ');
}

/**
 * Average mornings to fill the meter at dry rate `p`: the goal's dry nights in
 * a row (classic), or, for the kinder meter, a dot up for each dry night and
 * one down for each wet one (never below zero), then the last dots in a row.
 */
function expectedWait(p: number, rules: QuestRules): number {
  if (p >= 0.999) return rules.goal;
  if (p <= 0.01) return Infinity;
  const inARow = (k: number) => (1 / Math.pow(p, k) - 1) / (1 - p);
  if (rules.meter === 'streak') return inARow(rules.goal);
  // mornings to climb from k to k+1: from 0 a wet night stays at 0
  const { size, floor } = finalStretch(rules);
  let step = 0;
  let total = 0;
  for (let k = 0; k < floor; k++) {
    step = k === 0 ? 1 / p : (1 + (1 - p) * step) / p;
    total += step;
  }
  // the last dots in a row (roughly: a wet night there starts them over)
  return total + (size > 0 ? inARow(size) : 0);
}

function friendlyDuration(days: number): string {
  if (!isFinite(days) || days > 730) return 'more than two years';
  if (days < 14) return `about ${Math.round(days)} days`;
  if (days < 70) return `about ${Math.round(days / 7)} weeks`;
  return `about ${Math.round(days / 30)} months`;
}

// ---------------------------------------------------------------- panel

export function ParentPanel() {
  const open = useGame((s) => s.parentOpen);
  const data = useSave((s) => s.data);
  const storageOk = useSave((s) => s.storageOk);
  const cloudStatus = useSave((s) => s.cloud);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [showDays, setShowDays] = useState(21);
  const [pastDate, setPastDate] = useState('');
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const today = todayKey();
  const q = useMemo(() => computeQuest(data.records, data.rules), [data.records, data.rules]);
  const missing = useMemo(() => missingSinceLatest(data.records, today), [data.records, today]);
  const keys = useMemo(() => sortedKeys(data.records), [data.records]);
  const rate = useMemo(() => recentRate(data.records, today, 28), [data.records, today]);

  useEffect(() => {
    if (open) {
      setMessage(null);
      setExportText(null);
      setTimeout(() => closeBtn.current?.focus(), 30);
      void viewerDownloads();
    }
  }, [open]);

  if (!open) return null;

  const name = data.profile.name || 'Zef';
  const close = () => useGame.getState().set({ parentOpen: false });

  const record = (date: DateKey, result: NightResult | null, closeAfter: boolean) => {
    const current = data.records[date];
    setConfirm({
      title:
        result === null
          ? `Clear ${formatKeyShort(date)}?`
          : current
            ? `Change ${formatKeyShort(date)} to "${resultLabel(result)}"?`
            : `Record the night before ${formatKeyShort(date)} as "${resultLabel(result)}"?`,
      body: <p>{consequence(data, date, result)}</p>,
      confirm: result === null ? 'Clear it' : current ? 'Change it' : 'Yes, record it',
      onConfirm: () => {
        useSave.getState().record(date, result);
        sfx.play('tap');
        if (closeAfter) close();
        else setMessage(`Saved ${formatKeyShort(date)}.`);
      },
    });
  };

  // history rows from today back to the earliest record (at least two weeks)
  const earliest = keys[0] ?? today;
  const span = Math.max(13, daysBetween(earliest, today));
  const rows: DateKey[] = [];
  for (let i = 0; i <= Math.min(span, showDays - 1); i++) rows.push(addDays(today, -i));

  const doExport = async () => {
    const text = exportBackup(data);
    const filename = `dino-underwear-quest-backup-${today}.json`;
    setExportText(text);
    const viewer = await viewerDownloads();
    if (viewer) {
      try {
        await viewer.save({ filename, data: text });
        setMessage('Backup file saved.');
      } catch (e) {
        const code = (e as { code?: string } | null)?.code;
        setMessage(
          code === 'declined'
            ? 'Backup not saved. You can copy the text below instead.'
            : code === 'rate_limited'
              ? 'A save prompt is already open.'
              : 'Saving a file is not available here. Copy the backup text below instead.',
        );
      }
      return;
    }
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMessage('Backup file created. If no download appeared, copy the text below instead.');
    } catch {
      setMessage('Copy the backup text below and keep it somewhere safe.');
    }
  };

  const doImport = (text: string) => {
    const res = parseBackup(text, data);
    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    setConfirm({
      title: 'Replace progress with this backup?',
      body: (
        <p>
          The backup has {res.recordCount} recorded {res.recordCount === 1 ? 'night' : 'nights'}
          {res.dropped ? ` (${res.dropped} unreadable or future entries were skipped)` : ''}.
          {res.fromOldVersion ? ' It comes from the candy-castle version, so only the nights are brought over.' : ''} Your current
          history on this device will be replaced.
        </p>
      ),
      confirm: 'Replace',
      tone: 'danger',
      onConfirm: () => {
        useSave.getState().replace(res.data);
        setImportText('');
        setMessage('Backup restored.');
      },
    });
  };

  const goal = data.rules.goal;
  const lastN = Math.min(FINAL_RUN, goal);
  const lastDots = lastDotsName(data.rules);
  // skipped mornings in the last dots: the next morning recorded would start them over
  const skipRisk = missing.length > 0 && questIfRecorded(data.records, today, 'dry', data.rules).missedRestart?.on === today;
  // a restart from a skipped morning that filling it in could still undo
  const skipRestart = q.missedRestart && (!q.lastWet || q.lastWet < q.missedRestart.on) && q.meter < goal ? q.missedRestart : null;
  const skipped = skipRestart ? skippedWords(skipRestart.after, skipRestart.on) : null;
  const recorded = rate.dry + rate.wet;
  const p = recorded ? rate.dry / recorded : 0;
  const nextPrize = prizeAt(data.prizes, q.prizes);
  const toNext = q.nextPrizeAt - q.stars;

  const setPrize = (i: number, patch: Partial<Prize>) => {
    const list = data.prizes.map((x, k) => (k === i ? { ...x, ...patch } : x));
    useSave.getState().setPrizes(list);
  };

  return (
    <div className="modal-backdrop panel-backdrop" role="dialog" aria-modal="true" aria-labelledby="panel-title">
      <div className="panel">
        <header className="panel-head">
          <h1 id="panel-title">Parent corner</h1>
          <button ref={closeBtn} className="icon-btn" aria-label="Close parent corner" onClick={close}>
            <CloseIcon />
          </button>
        </header>

        {!storageOk && cloudStatus !== 'on' && (
          <p className="note warn">
            This browser isn't letting the game save. Progress will last until the page closes — use Export backup to keep it.
          </p>
        )}

        <section className="card today">
          <h2>Last night</h2>
          <p className="muted">The night before {formatKeyLong(today)}</p>
          {data.records[today] ? (
            <p className="status">
              Recorded: <strong>{resultLabel(data.records[today])}</strong>. You can change it in the history below.
            </p>
          ) : (
            <>
              <p className="muted small">Usually {name} presses the big button. You can record it here instead.</p>
              <div className="row two">
                <button className="btn big dry" onClick={() => record(today, 'dry', true)}>
                  <SunIcon /> Dry
                </button>
                <button className="btn big wet" onClick={() => record(today, 'wet', true)}>
                  <HeartIcon /> Not dry
                </button>
              </div>
            </>
          )}
        </section>

        {missing.length > 0 && (
          <section className="card notice">
            <h2>Missing mornings</h2>
            <p>
              No record for {missing.length <= 3 ? missing.map((k) => formatKeyShort(k)).join(', ') : `${missing.length} mornings`} between the last
              record and today.{' '}
              {skipRisk
                ? `${lastDots === 'the meter' ? `Every dot of ${name}'s meter needs` : `${name}'s meter is in ${lastDots}, which need`} dry nights in a row, so if ${missing.length === 1 ? 'it stays' : 'they stay'} empty, the next morning recorded starts ${lastDots === 'the meter' ? 'the meter' : 'those dots'} over.`
                : `A missing morning doesn't add a star or change the meter${lastDotsSentence(data.rules) ? `, except in ${lastDots}, which need dry nights in a row with no morning skipped` : ''}.`}{' '}
              Fill {missing.length === 1 ? 'it' : 'them'} in below if you know.
            </p>
          </section>
        )}

        {skipRestart && skipped && (
          <section className="card notice">
            <h2>A skipped morning</h2>
            <p>
              {lastDots === 'the meter' ? `${name}'s meter` : `${name}'s ${lastDots.replace('the ', '')}`} started over on {formatKeyShort(skipRestart.on)}, because {skipped.text}. If
              you know {skipped.many ? 'they were' : 'it was'} dry, fill {skipped.many ? 'them' : 'it'} in below and the dots come back.
            </p>
          </section>
        )}

        <section className="card summary">
          <h2>{name}'s quest</h2>
          <dl>
            <div>
              <dt>Stars</dt>
              <dd>{q.stars}</dd>
            </div>
            <div>
              <dt>Underwear meter</dt>
              <dd>
                {Math.min(q.meter, goal)} of {goal}
              </dd>
            </div>
            <div>
              <dt>Best run</dt>
              <dd>{q.best} in a row</dd>
            </div>
            <div>
              <dt>Next prize</dt>
              <dd>
                {nextPrize.label} in {toNext} {toNext === 1 ? 'star' : 'stars'}
              </dd>
            </div>
            <div>
              <dt>Underwear</dt>
              <dd>{data.underpants.earned ? `Earned ${data.underpants.on ? formatKeyShort(data.underpants.on) : ''}${data.underpants.pick !== null ? ` (${UNDERPANTS[data.underpants.pick].name})` : ''}` : 'Not yet'}</dd>
            </div>
            <div>
              <dt>Last 4 weeks</dt>
              <dd>
                {rate.dry} dry · {rate.wet} not dry
              </dd>
            </div>
          </dl>
          <p className="muted small">
            {data.rules.meter === 'streak'
              ? 'The meter counts dry mornings since the last not-dry one. Stars never go away.'
              : `A dry morning adds a dot to the meter and a not-dry one takes a dot away. ${lastDotsSentence(data.rules)} Stars never go away.`.replace('  ', ' ')}
          </p>
        </section>

        <section className="card">
          <h2>Underwear goal</h2>
          <p className="muted small">
            {data.rules.meter === 'streak'
              ? 'Dry nights in a row needed to fill the meter and open the Underwear Store.'
              : 'Dots needed to fill the meter and open the Underwear Store. Each dry night adds a dot.'}
          </p>
          <GoalChips label="Quick picks" />
          <p className="muted small">Coach Rex says the number out loud in his intro for 3, 5, 10, 15 or 20 nights. For any other number, pick it here:</p>
          <div className="row stepper">
            <button className="btn" aria-label="Fewer nights" disabled={goal <= GOAL_MIN} onClick={() => useSave.getState().setGoal(goal - 1)}>
              −
            </button>
            <strong className="stepper-value">
              {goal} {data.rules.meter === 'streak' ? 'nights' : 'dots'}
            </strong>
            <button className="btn" aria-label="More nights" disabled={goal >= GOAL_MAX} onClick={() => useSave.getState().setGoal(goal + 1)}>
              +
            </button>
          </div>
          {recorded >= 7 ? (
            <p className="note">
              Lately {name} has been dry {rate.dry} of {recorded} recorded nights. At that rate,{' '}
              {data.rules.meter === 'streak' ? `${goal} in a row takes` : `filling all ${goal} dots takes`}{' '}
              {friendlyDuration(expectedWait(p, data.rules))} on average
              {p < 0.85 && goal > 10 ? ' — a smaller goal might feel more reachable for now; you can raise it later' : ''}.
            </p>
          ) : (
            <p className="muted small">After a week of mornings, this shows how long the goal is likely to take.</p>
          )}
          <fieldset className="meter-mode">
            <legend>When a night isn't dry</legend>
            <label>
              <input type="radio" name="meter-mode" checked={data.rules.meter !== 'streak'} onChange={() => useSave.getState().setMeterMode('kind')} />
              <span>
                Take one dot off the meter <span className="muted">(kinder: a few accidents don't undo all the hard work)</span>
              </span>
            </label>
            {data.rules.meter !== 'streak' && (
              <label className="final-run">
                <input type="checkbox" checked={data.rules.finalRun > 0} onChange={(e) => useSave.getState().setFinalRun(e.target.checked)} />
                <span>
                  {lastN === goal ? `All ${lastN}` : `The last ${lastN}`} dots need dry nights in a row{' '}
                  <span className="muted">
                    (a not-dry night or a skipped morning there starts {lastN === goal ? 'the meter' : `those ${lastN}`} over, so the meter only fills after {lastN}{' '}
                    dry nights in a row)
                  </span>
                </span>
              </label>
            )}
            <label>
              <input type="radio" name="meter-mode" checked={data.rules.meter === 'streak'} onChange={() => useSave.getState().setMeterMode('streak')} />
              <span>
                Start the meter over <span className="muted">(the classic way: dry nights in a row)</span>
              </span>
            </label>
            {data.rules.meter !== 'streak' && data.rules.finalRun > 0 && data.rules.finalFrom && sortedKeys(data.records)[0] < data.rules.finalFrom && (
              <p className="muted small">
                The last-{lastN} rule counts from {formatKeyShort(data.rules.finalFrom)} on, so nothing {name} had already recorded changed.
              </p>
            )}
            {data.rules.meter !== 'streak' && data.rules.kindFrom && sortedKeys(data.records)[0] < data.rules.kindFrom && (
              <p className="muted small">
                {name}'s adventure began before the kinder meter, so it counts this way from {formatKeyShort(data.rules.kindFrom)} on. Earlier nights stay as they
                were counted, so the meter didn't jump.
              </p>
            )}
          </fieldset>
          {data.underpants.earned && !q.goalReachedOn && (
            <button
              className="btn small ghost"
              onClick={() =>
                setConfirm({
                  title: 'Undo the underwear?',
                  body: <p>The records no longer reach the goal (maybe a button was pressed by mistake). This puts the Underwear Store back to "not yet".</p>,
                  confirm: 'Undo',
                  onConfirm: () => useSave.getState().undoUnderpants(),
                })
              }
            >
              Undo underwear
            </button>
          )}
        </section>

        <section className="card">
          <h2>Prizes</h2>
          <p className="muted small">
            Treasure chests open at {[0, 1, 2, 3].map((i) => prizeThreshold(i, data.rules)).join(', ')} stars, then every {data.rules.prizeEvery} stars after
            that. When the list runs out it starts over.
          </p>
          <ol className="prize-list">
            {data.prizes.map((pz, i) => (
              <li key={i} className="prize-row">
                <span className="prize-at">{prizeThreshold(i, data.rules)}★</span>
                <input aria-label={`${ordinal(i + 1)} prize`} value={pz.label} maxLength={40} onChange={(e) => setPrize(i, { label: e.target.value })} onBlur={(e) => !e.target.value.trim() && setPrize(i, { label: 'Prize' })} />
                <select aria-label={`${ordinal(i + 1)} prize picture`} value={pz.icon} onChange={(e) => setPrize(i, { icon: e.target.value as PrizeIcon })}>
                  {PRIZE_ICONS.map((ic) => (
                    <option key={ic.id} value={ic.id}>
                      {ic.label}
                    </option>
                  ))}
                </select>
                <button className="btn small ghost" aria-label={`Remove ${pz.label}`} disabled={data.prizes.length <= 1} onClick={() => useSave.getState().setPrizes(data.prizes.filter((_, k) => k !== i))}>
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ol>
          <button className="btn small" onClick={() => useSave.getState().setPrizes([...data.prizes, { label: 'Surprise', icon: 'gift' }])}>
            Add a prize
          </button>
          {q.prizes > 0 && (
            <>
              <h3>Earned</h3>
              <ul className="earned-list">
                {Array.from({ length: q.prizes }, (_, i) => (
                  <li key={i}>
                    <label className="toggle">
                      <input type="checkbox" checked={data.prizesGiven.includes(i)} onChange={(e) => useSave.getState().setPrizeGiven(i, e.target.checked)} />
                      <span>
                        {prizeAt(data.prizes, i).label} <span className="muted small">({prizeThreshold(i, data.rules)} stars) — handed over</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <h2>History</h2>
          <p className="muted small">One result per morning. Tap to correct any day; everything is recalculated.</p>
          <ul className="history">
            {rows.map((k) => {
              const r = data.records[k];
              return (
                <li key={k} className={`hist-row ${r ?? 'unknown'}`}>
                  <span className="hist-date">
                    {formatKeyShort(k)}
                    {k === today && <em> (last night)</em>}
                  </span>
                  <span className={`chip ${r ?? 'unknown'}`}>{resultLabel(r)}</span>
                  <span className="hist-actions">
                    <button className="btn small" disabled={r === 'dry'} onClick={() => record(k, 'dry', false)}>
                      Dry
                    </button>
                    <button className="btn small" disabled={r === 'wet'} onClick={() => record(k, 'wet', false)}>
                      Not dry
                    </button>
                    {r && (
                      <button className="btn small ghost" onClick={() => record(k, null, false)}>
                        Clear
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {span >= showDays && (
            <button className="btn ghost" onClick={() => setShowDays((d) => d + 30)}>
              Show older days
            </button>
          )}
          <div className="row add-past">
            <label>
              Another morning
              <input type="date" max={today} value={pastDate} onChange={(e) => setPastDate(e.target.value)} />
            </label>
            <button className="btn small" disabled={!pastDate || pastDate > today} onClick={() => record(pastDate, 'dry', false)}>
              Dry
            </button>
            <button className="btn small" disabled={!pastDate || pastDate > today} onClick={() => record(pastDate, 'wet', false)}>
              Not dry
            </button>
          </div>
        </section>

        <section className="card">
          <h2>
            <EyeIcon /> Preview
          </h2>
          <p className="muted small">Play any moment without changing real progress.</p>
          <div className="row">
            <button className="btn small" onClick={() => startPreview('dry')}>
              A dry morning
            </button>
            <button className="btn small" onClick={() => startPreview('wet')}>
              The hug
            </button>
            <button className="btn small" onClick={() => startPreview('surprise')}>
              A surprise (a new one each tap)
            </button>
            <button className="btn small" onClick={() => startPreview('prize')}>
              A prize chest
            </button>
            <button className="btn small" onClick={() => startPreview('store')}>
              The Underwear Store
            </button>
            <button className="btn small" onClick={() => startPreview('intro')}>
              Coach Rex's intro
            </button>
          </div>
        </section>

        <section className="card">
          <h2>{name}'s dino</h2>
          <label className="field">
            <span>Name</span>
            <input
              value={data.profile.name}
              maxLength={24}
              onChange={(e) => useSave.getState().setProfile({ name: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && useSave.getState().setProfile({ name: 'Zef' })}
            />
          </label>
          <p className="muted small">Coach Rex's recorded voice says "Zef"; with another name he says "buddy" instead.</p>
          <div className="row">
            {SPECIES.map((s) => (
              <button key={s.id} className={`btn small${data.profile.species === s.id ? ' primary' : ''}`} onClick={() => useSave.getState().setProfile({ species: s.id })}>
                {s.name}
              </button>
            ))}
          </div>
          <div className="swatches small-swatches">
            {DINO_COLORS.map((c, i) => (
              <button key={c.name} className={`swatch${i === data.profile.color ? ' on' : ''}`} style={{ background: c.body }} aria-label={c.name} onClick={() => useSave.getState().setProfile({ color: i })} />
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Settings</h2>
          <label className="toggle">
            <input
              type="checkbox"
              checked={data.settings.sound}
              onChange={(e) => {
                useSave.getState().setSettings({ sound: e.target.checked });
                setSoundOn(e.target.checked);
              }}
            />
            <span>Sound and Coach Rex's voice</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={data.settings.music}
              onChange={(e) => {
                useSave.getState().setSettings({ music: e.target.checked });
                setMusicOn(e.target.checked);
                if (e.target.checked) music.start();
              }}
            />
            <span>Background music</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={data.settings.reducedMotion} onChange={(e) => useSave.getState().setSettings({ reducedMotion: e.target.checked })} />
            <span>Reduced motion (gentler camera, fewer particles)</span>
          </label>
        </section>

        <ChildrenAndSaving name={name} onLeave={close} />

        <section className="card">
          <h2>Backup</h2>
          <p className="muted small">A copy of {name}'s adventure as a file, to keep safe or to bring into another copy of the game.</p>
          <div className="row">
            <button className="btn" onClick={doExport}>
              Export backup
            </button>
            <label className="btn file-btn">
              Import backup file
              <input
                type="file"
                accept="application/json,.json,text/plain"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) doImport(await f.text());
                }}
              />
            </label>
          </div>
          {exportText && (
            <>
              <textarea id="backup-text" className="code" readOnly value={exportText} rows={5} aria-label="Backup text" onFocus={(e) => e.currentTarget.select()} />
              <button
                className="btn small"
                onClick={() => {
                  const select = () => {
                    const el = document.getElementById('backup-text') as HTMLTextAreaElement | null;
                    el?.focus();
                    el?.select();
                  };
                  try {
                    navigator.clipboard
                      .writeText(exportText)
                      .then(() => setMessage('Backup text copied.'))
                      .catch(() => {
                        select();
                        setMessage('Select the text above and copy it.');
                      });
                  } catch {
                    select();
                    setMessage('Select the text above and copy it.');
                  }
                }}
              >
                Copy backup text
              </button>
            </>
          )}
          <details>
            <summary>Paste backup text instead</summary>
            <textarea className="code" value={importText} rows={4} onChange={(e) => setImportText(e.target.value)} aria-label="Paste backup text" />
            <button className="btn small" disabled={!importText.trim()} onClick={() => doImport(importText)}>
              Import pasted text
            </button>
          </details>
        </section>

        <section className="card danger-zone">
          <h2>Start a new quest</h2>
          <p className="muted small">Clears {name}'s recorded nights, stars, prizes and underwear. Keeps the dino, the prize list and the goal.</p>
          <button
            className="btn danger"
            onClick={() =>
              setConfirm({
                title: 'Start a brand-new quest?',
                body: <p>All recorded nights, stars, opened chests and the underwear will be cleared. This can't be undone (unless you exported a backup).</p>,
                confirm: 'Start new quest',
                tone: 'danger',
                onConfirm: () => {
                  useSave.getState().startNewQuest();
                  useGame.getState().set({ shownStars: 0, shownMeter: 0, shownAccessories: 0, openedChests: 0, land: 0, showUnderpants: false });
                  resetBoardView();
                  setMessage('A new quest is ready.');
                },
              })
            }
          >
            Start new quest
          </button>
          <h2 className="spaced">Start {name}'s adventure over</h2>
          <p className="muted small">
            Back to the very beginning for {name}: the name, picking a dino and a color, and Coach Rex's intro. Clears every recorded night, the stars,
            the prizes and the underwear. Keeps the prize list and the goal. Other children's adventures aren't touched.
          </p>
          <button
            className="btn danger"
            onClick={() =>
              setConfirm({
                title: `Start ${name}'s adventure over?`,
                body: <p>{name}'s dino, every recorded night, the stars, opened chests and the underwear will be cleared, and the game goes back to the name screen. This can't be undone (unless you exported a backup).</p>,
                confirm: 'Start over',
                tone: 'danger',
                onConfirm: () => startOver(),
              })
            }
          >
            Start over
          </button>
          <h2 className="spaced">Remove {name} from the game</h2>
          <p className="muted small">Takes {name}'s adventure out of the game, on every device it's shared with. Other children's adventures aren't touched.</p>
          <button
            className="btn danger"
            onClick={() =>
              setConfirm({
                title: `Remove ${name}'s adventure?`,
                body: <p>{name}'s recorded nights, stars, prizes and dino will be removed everywhere this game is shared. This can't be undone (unless you exported a backup).</p>,
                confirm: 'Remove',
                tone: 'danger',
                onConfirm: () => removeCurrentChild(),
              })
            }
          >
            Remove {name}
          </button>
        </section>

        {message && (
          <p className="toast" role="status">
            {message}
          </p>
        )}
        <footer className="panel-foot">
          <button className="btn primary" onClick={close}>
            Back to the game
          </button>
        </footer>
      </div>
      {confirm && <Confirm spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

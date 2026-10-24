import { describe, expect, it } from 'vitest';
import director from '../src/game/director.ts?raw';
import { LINES, MAX_CHEST_GAP, SPOKEN_GOALS, clipId, lineText } from '../src/voice/lines';
import { ACCESSORIES } from '../src/game/rewards';
import { DEFAULT_RULES } from '../src/state/progress';

const clips = new Set(Object.keys(import.meta.glob('../src/voice/clips/*.mp3')).map((k) => k.replace(/^.*\/(.*)\.mp3$/, '$1')));

describe('Coach Rex lines', () => {
  it('has a recorded clip for every line (and every twin)', () => {
    const missing: string[] = [];
    for (const [id, line] of Object.entries(LINES)) {
      if (!clips.has(id)) missing.push(id);
      if (line.nameless && !clips.has(`${id}--nameless`)) missing.push(`${id}--nameless`);
      if (line.anyGoal && !clips.has(`${id}--anygoal`)) missing.push(`${id}--anygoal`);
      for (const g of Object.keys(line.goals ?? {})) if (!clips.has(`${id}--goal${g}`)) missing.push(`${id}--goal${g}`);
    }
    expect(missing).toEqual([]);
  });

  it('has no clips left over from old lines', () => {
    const wanted = new Set(
      Object.entries(LINES).flatMap(([id, l]) => [
        id,
        ...(l.nameless ? [`${id}--nameless`] : []),
        ...(l.anyGoal ? [`${id}--anygoal`] : []),
        ...Object.keys(l.goals ?? {}).map((g) => `${id}--goal${g}`),
      ]),
    );
    expect([...clips].filter((c) => !wanted.has(c))).toEqual([]);
  });

  it('calls it underwear', () => {
    for (const [id, l] of Object.entries(LINES)) expect(`${l.text} ${l.nameless ?? ''} ${l.anyGoal ?? ''}`, id).not.toMatch(/underpants/i);
  });

  it('only says lines that exist', () => {
    const used = [...director.matchAll(/say(?:Async)?\((?:ctx, )?'([a-z0-9-]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(20);
    for (const id of used) expect(LINES[id], id).toBeDefined();
    for (const a of ACCESSORIES) expect(LINES[`acc-${a.id}`], a.id).toBeDefined();
    for (let i = 0; i < 7; i++) expect(LINES[`land-${i}`]).toBeDefined();
    for (const n of [1, 2, 3]) expect(LINES[`meter-${n}`]).toBeDefined();
    for (const id of ['meter-missed', 'meter-missed-all', 'wet-3-final', 'wet-3-kind']) expect(LINES[id], id).toBeDefined();
    // lines picked by number: milestone cheers, jokes and dino facts, Coach Rex's taps, the dino moves
    for (let n = 10; n <= 100; n += 10) expect(LINES[`stars-${n}`], `stars-${n}`).toBeDefined();
    for (let n = 1; n <= 12; n++) for (const id of [`joke-${n}-q`, `joke-${n}-a`, `fact-${n}`]) expect(LINES[id], id).toBeDefined();
    for (const id of ['joke-time-1', 'joke-time-2', 'fact-time-1', 'fact-time-2']) expect(LINES[id], id).toBeDefined();
    for (let n = 1; n <= 10; n++) expect(LINES[`tap-${n}`], `tap-${n}`).toBeDefined();
    // the longest way to a chest is the gap between later chests
    expect(MAX_CHEST_GAP).toBeGreaterThanOrEqual(DEFAULT_RULES.prizeEvery);
    for (let n = 1; n <= MAX_CHEST_GAP; n++) expect(LINES[`chest-more-${n}`], `chest-more-${n}`).toBeDefined();
    for (const id of director.match(/'move-[a-z]+'/g) ?? []) expect(LINES[id.slice(1, -1)], id).toBeDefined();
  });

  it('swaps in name-free lines for another name', () => {
    expect(lineText('greet-1', 'Zef')).toBe('Good morning, Zef!');
    expect(lineText('greet-1', 'Milo')).toBe('Good morning, superstar!');
    expect(clipId('greet-1', 'zef')).toBe('greet-1');
    expect(clipId('greet-1', 'Milo')).toBe('greet-1--nameless');
    expect(clipId('dry-1', 'Milo')).toBe('dry-1');
  });

  it("calls only Zef \"big guy\" or a king (any other child might be a girl)", () => {
    for (const id of Object.keys(LINES)) expect(lineText(id, 'Mia'), id).not.toMatch(/\bbig guy\b|\bking\b/i);
  });

  it('says the goal out loud for 3, 5, 10, 15 and 20 nights, and leaves the number out otherwise', () => {
    const words: Record<number, string> = { 3: 'three', 5: 'five', 10: 'ten', 15: 'fifteen', 20: 'twenty' };
    for (const g of SPOKEN_GOALS) {
      expect(lineText('intro-meter', 'Zef', g)).toMatch(new RegExp(`Stay dry ${words[g]} nights`));
      expect(clipId('intro-meter', 'Mia', g)).toBe(g === 20 ? 'intro-meter' : `intro-meter--goal${g}`);
    }
    expect(lineText('intro-meter', 'Zef', 14)).not.toMatch(/nights in a row, and/);
    expect(clipId('intro-meter', 'Zef', 14)).toBe('intro-meter--anygoal');
    expect(clipId('store-open', 'Milo', 14)).toBe('store-open--nameless');
  });
});

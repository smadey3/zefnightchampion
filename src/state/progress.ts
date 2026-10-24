// Pure progress logic: local morning dates, stars, the underpants meter and
// prizes.
//
// A record is keyed by the *local date of the morning* after the night
// (YYYY-MM-DD), at most one per morning.
//
// - Every dry morning is a star. Stars never go away: the board only ever
//   moves forward.
// - The underwear meter: every dry morning adds a dot. In the kinder mode (the
//   default) a wet morning takes one dot away, except in the meter's last five
//   dots, which need dry mornings in a row: a wet morning there starts those
//   five over. In the classic mode a wet morning starts the whole meter over,
//   so it counts dry mornings in a row. A morning with no record is unknown:
//   it neither adds nor takes away, except in those last five dots, where a
//   gap means the nights weren't in a row, so the next dry morning starts
//   them over (filling the gap in later puts the dots back).
// - Prizes come from total stars: an early one at `earlyPrize` stars, then at
//   `firstPrize` stars, then one every `prizeEvery` stars after that (5, 10,
//   25, 40, ... by default).

export type NightResult = 'dry' | 'wet';
export type DateKey = string;
export type Records = Record<DateKey, NightResult>;

/** What a wet morning does to the meter: take one dot off, or start it over. */
export type MeterMode = 'kind' | 'streak';

export interface QuestRules {
  /** Dots on the meter that earn underwear. */
  goal: number;
  /** Stars for an extra, early prize before `firstPrize` (0 = none). */
  earlyPrize: number;
  /** Stars for the first regular prize. */
  firstPrize: number;
  /** Stars between later prizes. */
  prizeEvery: number;
  meter: MeterMode;
  /**
   * The kinder meter's first morning, for an adventure that began before it
   * existed: wet mornings before this date still started the meter over, so
   * switching never makes the meter jump. Null: kinder from the start.
   */
  kindFrom: DateKey | null;
  /** Kinder meter: the last this-many dots need dry nights in a row (a wet night or a skipped morning there starts them over); 0 = off. */
  finalRun: number;
  /** The first morning the last-dots rule applies, for an adventure that began before it existed (null: from the start). */
  finalFrom: DateKey | null;
}

/** How many of the meter's last dots need dry nights in a row. */
export const FINAL_RUN = 5;

export const DEFAULT_RULES: QuestRules = {
  goal: 20,
  earlyPrize: 5,
  firstPrize: 10,
  prizeEvery: 15,
  meter: 'kind',
  kindFrom: null,
  finalRun: FINAL_RUN,
  finalFrom: null,
};

/** The meter's last stretch: how many dots need dry nights in a row, and the dot it starts after. */
export function finalStretch(rules: QuestRules): { size: number; floor: number } {
  const size = rules.meter === 'kind' ? Math.max(0, Math.min(rules.finalRun, rules.goal)) : 0;
  return { size, floor: rules.goal - size };
}

/** A key for caches that depend on where the chests are. */
export function scheduleKey(rules: QuestRules): string {
  return `${rules.earlyPrize}:${rules.firstPrize}:${rules.prizeEvery}`;
}
export const GOAL_MIN = 3;
export const GOAL_MAX = 60;

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateKey(key: unknown): key is DateKey {
  if (typeof key !== 'string') return false;
  const m = KEY_RE.exec(key);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar date of `d` as a key. */
export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

function parts(key: DateKey): [number, number, number] {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`Bad date key: ${key}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Day number that is immune to DST and time zones. */
function dayNumber(key: DateKey): number {
  const [y, m, d] = parts(key);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = parts(key);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** b - a in whole days. */
export function daysBetween(a: DateKey, b: DateKey): number {
  return dayNumber(b) - dayNumber(a);
}

export function compareKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A Date at local noon for display purposes. */
export function keyToLocalDate(key: DateKey): Date {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function sortedKeys(records: Records): DateKey[] {
  return Object.keys(records).filter(isValidDateKey).sort(compareKeys);
}

// ---------------------------------------------------------------- prizes

function hasEarly(rules: QuestRules): boolean {
  return rules.earlyPrize > 0 && rules.earlyPrize < rules.firstPrize;
}

/** Stars needed for prize number `i` (0-based). */
export function prizeThreshold(i: number, rules: QuestRules = DEFAULT_RULES): number {
  if (hasEarly(rules)) {
    if (i <= 0) return rules.earlyPrize;
    return rules.firstPrize + (i - 1) * rules.prizeEvery;
  }
  return rules.firstPrize + i * rules.prizeEvery;
}

/** How many prizes `stars` stars have earned. */
export function prizesEarned(stars: number, rules: QuestRules = DEFAULT_RULES): number {
  const early = hasEarly(rules) && stars >= rules.earlyPrize ? 1 : 0;
  if (stars < rules.firstPrize) return early;
  return early + 1 + Math.floor((stars - rules.firstPrize) / rules.prizeEvery);
}

/**
 * The board is split into lands, each ending at a prize chest. Land 0 holds
 * spaces 1 up to the first prize; land i holds the spaces after prize i-1 up
 * to prize i. `start` is the space the land begins from (0 = the nest).
 */
export function landRange(land: number, rules: QuestRules = DEFAULT_RULES): { start: number; end: number } {
  if (land <= 0) return { start: 0, end: prizeThreshold(0, rules) };
  return { start: prizeThreshold(land - 1, rules), end: prizeThreshold(land, rules) };
}

/** The land that board position `stars` is shown in (a finished land moves on to the next). */
export function landOf(stars: number, rules: QuestRules = DEFAULT_RULES): number {
  return prizesEarned(stars, rules);
}

// ---------------------------------------------------------------- quest

export interface QuestState {
  /** Every dry morning ever recorded. */
  stars: number;
  wets: number;
  /** Dots on the meter: dry mornings in a row (classic), or dry minus wet, never below 0 (kinder). */
  meter: number;
  /** Longest run of dry mornings in a row ever. */
  best: number;
  latest: { date: DateKey; result: NightResult } | null;
  lastWet: DateKey | null;
  /** First morning the meter reached the goal, if it ever has. */
  goalReachedOn: DateKey | null;
  /**
   * The latest dry morning that started the last dots over because the morning
   * before it wasn't recorded (`after` is the morning recorded before the gap).
   */
  missedRestart: { on: DateKey; after: DateKey } | null;
  prizes: number;
  nextPrizeAt: number;
}

export function computeQuest(records: Records, rules: QuestRules = DEFAULT_RULES): QuestState {
  let stars = 0;
  let wets = 0;
  let run = 0;
  let best = 0;
  let meter = 0;
  const { size: stretch, floor } = finalStretch(rules);
  let lastWet: DateKey | null = null;
  let goalReachedOn: DateKey | null = null;
  let missedRestart: QuestState['missedRestart'] = null;
  let prev: DateKey | null = null;
  const keys = sortedKeys(records);
  for (const k of keys) {
    const kind = rules.meter === 'kind' && (!rules.kindFrom || k >= rules.kindFrom);
    const inStretch = kind && stretch > 0 && meter > floor && (!rules.finalFrom || k >= rules.finalFrom);
    if (records[k] === 'dry') {
      // the last stretch needs nights in a row, so a morning nobody recorded
      // (since the rule began) starts it over too
      if (inStretch && prev && daysBetween(prev, k) > 1 && (!rules.finalFrom || k > rules.finalFrom)) {
        meter = floor;
        missedRestart = { on: k, after: prev };
      }
      stars++;
      run++;
      meter++;
      if (run > best) best = run;
      if (meter >= rules.goal && !goalReachedOn) goalReachedOn = k;
    } else {
      wets++;
      run = 0;
      // in the last stretch a wet morning starts the stretch over
      meter = !kind ? 0 : inStretch ? floor : Math.max(0, meter - 1);
      lastWet = k;
    }
    prev = k;
  }
  const last = keys[keys.length - 1];
  const prizes = prizesEarned(stars, rules);
  return {
    stars,
    wets,
    meter,
    best,
    latest: last ? { date: last, result: records[last] } : null,
    lastWet,
    goalReachedOn,
    missedRestart,
    prizes,
    nextPrizeAt: prizeThreshold(prizes, rules),
  };
}

/** What the quest would look like if `date` were recorded as `result` (parent previews). */
export function questIfRecorded(
  records: Records,
  date: DateKey,
  result: NightResult | null,
  rules: QuestRules = DEFAULT_RULES,
): QuestState {
  const next: Records = { ...records };
  if (result) next[date] = result;
  else delete next[date];
  return computeQuest(next, rules);
}

/** Recorded mornings in the `days` mornings ending today, for the grown-ups' stats. */
export function recentRate(records: Records, today: DateKey, days = 14): { dry: number; wet: number; unknown: number } {
  let dry = 0;
  let wet = 0;
  let unknown = 0;
  for (let i = 0; i < days; i++) {
    const r = records[addDays(today, -i)];
    if (r === 'dry') dry++;
    else if (r === 'wet') wet++;
    else unknown++;
  }
  return { dry, wet, unknown };
}

/** Unrecorded mornings strictly between the latest record and `today`. */
export function missingSinceLatest(records: Records, today: DateKey): DateKey[] {
  const keys = sortedKeys(records);
  if (keys.length === 0) return [];
  const last = keys[keys.length - 1];
  const out: DateKey[] = [];
  const span = daysBetween(last, today);
  // Cap the list so a long break doesn't produce hundreds of rows.
  for (let i = 1; i < span && out.length < 60; i++) out.push(addDays(last, i));
  return out;
}

export function formatKeyLong(key: DateKey, locale?: string): string {
  return keyToLocalDate(key).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatKeyShort(key: DateKey, locale?: string): string {
  return keyToLocalDate(key).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

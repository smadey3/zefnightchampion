// Saved quest data, local persistence, and backup import/export.

import {
  DEFAULT_RULES,
  GOAL_MAX,
  GOAL_MIN,
  addDays,
  computeQuest,
  isValidDateKey,
  sortedKeys,
  todayKey,
  type DateKey,
  type NightResult,
  type QuestRules,
  type Records,
} from './progress';
import {
  ACCESSORIES,
  DEFAULT_PRIZES,
  DINO_COLORS,
  PRIZE_ICONS,
  SPECIES,
  UNDERPANTS,
  type Prize,
  type PrizeIcon,
  type Slot,
  type Species,
} from '../game/rewards';

export const APP_ID = 'zefs-dino-underpants-quest';
export const STORAGE_KEY = 'zefs-dino-underpants-quest:v1';
const BACKUP_KEY = 'zefs-dino-underpants-quest:v1:previous';
/** Backups from the earlier candy-castle version still carry their nights over. */
const OLD_APP_ID = 'zefs-dry-night-quest';

export interface Settings {
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
}

export interface Profile {
  name: string;
  species: Species;
  color: number;
  /** The first-time setup (name, dino, mission) has been done. */
  setupDone: boolean;
}

/** What the child has already been shown, so refreshes never replay or double-count. */
export interface Seen {
  /** Board position (stars) last celebrated. */
  stars: number;
  /** Prize chests already opened. */
  prizes: number;
  /** The wet morning whose hug has played. */
  hugDate: DateKey | null;
  /** The underpants store visit has played. */
  underpants: boolean;
  /** Meter value last shown, so changes can animate. */
  meter: number;
}

export interface UnderpantsState {
  earned: boolean;
  on: DateKey | null;
  /** The design picked in the store. */
  pick: number | null;
}

export interface SaveData {
  app: typeof APP_ID;
  version: 1;
  questId: string;
  createdAt: string;
  updatedAt: string;
  records: Records;
  rules: QuestRules;
  prizes: Prize[];
  /** Prize numbers the grown-ups have handed over. */
  prizesGiven: number[];
  underpants: UnderpantsState;
  profile: Profile;
  /** Accessory chosen per slot (-1 = nothing), overriding the default outfit. */
  outfit: Partial<Record<Slot, number>>;
  seen: Seen;
  settings: Settings;
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `quest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function defaultSave(now: Date = new Date()): SaveData {
  const iso = now.toISOString();
  return {
    app: APP_ID,
    version: 1,
    questId: newId(),
    createdAt: iso,
    updatedAt: iso,
    records: {},
    rules: { ...DEFAULT_RULES },
    prizes: DEFAULT_PRIZES.map((p) => ({ ...p })),
    prizesGiven: [],
    underpants: { earned: false, on: null, pick: null },
    profile: { name: 'Zef', species: 'trex', color: 0, setupDone: false },
    outfit: {},
    seen: { stars: 0, prizes: 0, hugDate: null, underpants: false, meter: 0 },
    settings: { sound: true, music: true, reducedMotion: prefersReducedMotion() },
  };
}

function cleanRecords(input: unknown, today: DateKey): { records: Records; dropped: number } {
  const records: Records = {};
  let dropped = 0;
  if (!input || typeof input !== 'object') return { records, dropped };
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (isValidDateKey(k) && (v === 'dry' || v === 'wet') && k <= today) records[k] = v;
    else dropped += 1;
  }
  return { records, dropped };
}

function int(v: unknown, lo: number, hi: number, fallback: number): number {
  return Number.isInteger(v) ? Math.max(lo, Math.min(hi, v as number)) : fallback;
}

export function clampGoal(n: number): number {
  return Math.max(GOAL_MIN, Math.min(GOAL_MAX, Math.round(n)));
}

function cleanPrizes(input: unknown): Prize[] {
  if (!Array.isArray(input)) return DEFAULT_PRIZES.map((p) => ({ ...p }));
  const icons = new Set(PRIZE_ICONS.map((p) => p.id));
  const out: Prize[] = [];
  for (const p of input.slice(0, 40)) {
    if (!p || typeof p !== 'object') continue;
    const label = typeof p.label === 'string' ? p.label.trim().slice(0, 40) : '';
    const icon = icons.has(p.icon) ? (p.icon as PrizeIcon) : 'gift';
    if (label) out.push({ label, icon });
  }
  return out.length ? out : DEFAULT_PRIZES.map((p) => ({ ...p }));
}

function cleanOutfit(input: unknown): Partial<Record<Slot, number>> {
  const out: Partial<Record<Slot, number>> = {};
  if (!input || typeof input !== 'object') return out;
  for (const slot of ['head', 'face', 'neck', 'body', 'feet', 'prop'] as Slot[]) {
    const v = (input as Record<string, unknown>)[slot];
    if (v === -1) out[slot] = -1;
    else if (Number.isInteger(v) && (v as number) >= 0 && (v as number) < ACCESSORIES.length && ACCESSORIES[v as number].slot === slot)
      out[slot] = v as number;
  }
  return out;
}

/** Recompute everything that follows from the records. Underpants, once earned, stay earned. */
export function applyDerived(data: SaveData): SaveData {
  const q = computeQuest(data.records, data.rules);
  if (data.underpants.earned || !q.goalReachedOn) return data;
  return { ...data, underpants: { ...data.underpants, earned: true, on: q.goalReachedOn } };
}

/** The first morning after the latest recorded one (null when nothing is recorded). */
function morningAfterLatest(records: Records): DateKey | null {
  const keys = sortedKeys(records);
  return keys.length ? addDays(keys[keys.length - 1], 1) : null;
}

/** Normalise anything that looks like our save data. Returns null when it clearly isn't ours. */
export function normalizeSave(raw: unknown, now: Date = new Date()): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.app !== APP_ID) return null;
  if (r.version !== undefined && r.version !== 1) return null;
  if (!('records' in r)) return null;
  const base = defaultSave(now);
  const { records } = cleanRecords(r.records, todayKey(now));
  const rulesRaw = (r.rules ?? {}) as Record<string, unknown>;
  const seenRaw = (r.seen ?? {}) as Record<string, unknown>;
  const settingsRaw = (r.settings ?? {}) as Record<string, unknown>;
  const profileRaw = (r.profile ?? {}) as Record<string, unknown>;
  const upRaw = (r.underpants ?? {}) as Record<string, unknown>;
  const species = SPECIES.some((s) => s.id === profileRaw.species) ? (profileRaw.species as Species) : base.profile.species;
  const data: SaveData = {
    ...base,
    questId: typeof r.questId === 'string' && r.questId ? r.questId : base.questId,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : base.createdAt,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : base.updatedAt,
    records,
    rules: {
      goal: clampGoal(int(rulesRaw.goal, GOAL_MIN, GOAL_MAX, DEFAULT_RULES.goal)),
      earlyPrize: DEFAULT_RULES.earlyPrize,
      firstPrize: DEFAULT_RULES.firstPrize,
      prizeEvery: DEFAULT_RULES.prizeEvery,
      meter: rulesRaw.meter === 'streak' ? 'streak' : 'kind',
      // an adventure from before the kinder meter gets it from its next morning on
      kindFrom: isValidDateKey(rulesRaw.kindFrom) ? rulesRaw.kindFrom : rulesRaw.meter === undefined ? morningAfterLatest(records) : null,
      // the last dots in a row: an adventure from before this rule gets it from its next morning on
      finalRun: rulesRaw.finalRun === 0 ? 0 : DEFAULT_RULES.finalRun,
      finalFrom: isValidDateKey(rulesRaw.finalFrom) ? rulesRaw.finalFrom : rulesRaw.finalRun === undefined ? morningAfterLatest(records) : null,
    },
    prizes: cleanPrizes(r.prizes),
    prizesGiven: Array.isArray(r.prizesGiven)
      ? [...new Set((r.prizesGiven as unknown[]).filter((v): v is number => Number.isInteger(v) && (v as number) >= 0))].sort((a, b) => a - b)
      : [],
    underpants: {
      earned: upRaw.earned === true,
      on: isValidDateKey(upRaw.on) ? (upRaw.on as string) : null,
      pick: Number.isInteger(upRaw.pick) && (upRaw.pick as number) >= 0 && (upRaw.pick as number) < UNDERPANTS.length ? (upRaw.pick as number) : null,
    },
    profile: {
      name:
        typeof profileRaw.name === 'string' && (profileRaw.name.trim() || profileRaw.setupDone !== true)
          ? profileRaw.name.trim().slice(0, 24)
          : base.profile.name,
      species,
      color: int(profileRaw.color, 0, DINO_COLORS.length - 1, 0),
      setupDone: profileRaw.setupDone === true,
    },
    outfit: cleanOutfit(r.outfit),
    seen: {
      stars: int(seenRaw.stars, 0, 100000, 0),
      prizes: int(seenRaw.prizes, 0, 100000, 0),
      hugDate: isValidDateKey(seenRaw.hugDate) ? (seenRaw.hugDate as string) : null,
      underpants: seenRaw.underpants === true,
      meter: int(seenRaw.meter, 0, 100000, 0),
    },
    settings: {
      sound: settingsRaw.sound !== false,
      music: settingsRaw.music !== false,
      reducedMotion:
        typeof settingsRaw.reducedMotion === 'boolean' ? settingsRaw.reducedMotion : base.settings.reducedMotion,
    },
  };
  return applyDerived(data);
}

export function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSave(now: Date = new Date()): SaveData {
  return readLegacySave(now) ?? defaultSave(now);
}

/** The one-child save the game kept before it had room for several children, if any. */
export function readLegacySave(now: Date = new Date()): SaveData | null {
  const s = storage();
  if (!s) return null;
  for (const key of [STORAGE_KEY, BACKUP_KEY]) {
    try {
      const text = s.getItem(key);
      if (!text) continue;
      const data = normalizeSave(JSON.parse(text), now);
      if (data) return data;
    } catch {
      /* try the next copy */
    }
  }
  return null;
}

export function persistSave(data: SaveData): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const prev = s.getItem(STORAGE_KEY);
    if (prev) s.setItem(BACKUP_KEY, prev);
    s.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Set (or clear, with null) the result for one morning. Idempotent per date. */
export function withRecord(data: SaveData, date: DateKey, result: NightResult | null, now: Date = new Date()): SaveData {
  if (!isValidDateKey(date)) throw new Error('Invalid date');
  if (date > todayKey(now)) throw new Error('Cannot record a future morning');
  const current = data.records[date] ?? null;
  if (current === result) return data;
  const records: Records = { ...data.records };
  if (result) records[date] = result;
  else delete records[date];
  return applyDerived({ ...data, records, updatedAt: now.toISOString() });
}

/** Mark everything in the records as already shown (after imports and goal changes, so nothing replays). */
export function seenFromRecords(data: SaveData): Seen {
  const q = computeQuest(data.records, data.rules);
  return {
    stars: q.stars,
    prizes: q.prizes,
    hugDate: q.latest && q.latest.result === 'wet' ? q.latest.date : data.seen.hugDate,
    underpants: data.underpants.earned,
    meter: q.meter,
  };
}

/** A fresh quest that keeps who the child is and how the game sounds. */
export function newQuest(data: SaveData, now: Date = new Date()): SaveData {
  const fresh = defaultSave(now);
  return { ...fresh, profile: { ...data.profile }, settings: data.settings, prizes: data.prizes, rules: { ...data.rules, kindFrom: null, finalFrom: null } };
}

/**
 * Back to the very first screen: the name (filled in, ready to change), a
 * new dino and the intro, with nothing recorded. Only the grown-up's own
 * choices stay: the prize list, the goal and the sound settings.
 */
export function startOver(data: SaveData, now: Date = new Date()): SaveData {
  const fresh = defaultSave(now);
  return { ...fresh, profile: { ...fresh.profile, name: data.profile.name }, settings: data.settings, prizes: data.prizes, rules: { ...data.rules, kindFrom: null, finalFrom: null } };
}

export function exportBackup(data: SaveData, now: Date = new Date()): string {
  const { settings: _settings, ...rest } = data;
  void _settings;
  return JSON.stringify({ ...rest, exportedAt: now.toISOString() }, null, 2);
}

export type ImportResult =
  | { ok: true; data: SaveData; recordCount: number; dropped: number; fromOldVersion: boolean }
  | { ok: false; error: string };

export function parseBackup(text: string, current: SaveData, now: Date = new Date()): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a readable backup (it isn't valid JSON)." };
  }
  const app = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).app : undefined;
  if (app === OLD_APP_ID) {
    // the candy-castle version: bring its nights into a fresh quest
    const { records, dropped } = cleanRecords((raw as Record<string, unknown>).records, todayKey(now));
    const data = applyDerived({ ...newQuest(current, now), records, profile: { ...current.profile } });
    data.seen = seenFromRecords(data);
    return { ok: true, data, recordCount: Object.keys(records).length, dropped, fromOldVersion: true };
  }
  if (app !== APP_ID) return { ok: false, error: "That file doesn't look like a Dino Underwear Quest backup." };
  const { dropped } = cleanRecords((raw as Record<string, unknown>).records, todayKey(now));
  const normalized = normalizeSave(raw, now);
  if (!normalized) return { ok: false, error: 'That backup is from an unknown version.' };
  const data: SaveData = { ...normalized, settings: current.settings };
  data.seen = seenFromRecords(data);
  return { ok: true, data, recordCount: Object.keys(data.records).length, dropped, fromOldVersion: false };
}

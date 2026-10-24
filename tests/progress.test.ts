import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  addDays,
  computeQuest,
  daysBetween,
  isValidDateKey,
  landOf,
  landRange,
  missingSinceLatest,
  prizeThreshold,
  prizesEarned,
  questIfRecorded,
  recentRate,
  type Records,
} from '../src/state/progress';
import {
  APP_ID,
  applyDerived,
  defaultSave,
  exportBackup,
  newQuest,
  normalizeSave,
  parseBackup,
  seenFromRecords,
  startOver,
  withRecord,
} from '../src/state/save';
import {
  ACCESSORIES,
  accessoriesUnlocked,
  accessoryForStar,
  defaultOutfit,
  prizeAt,
  surpriseFor,
  DEFAULT_PRIZES,
} from '../src/game/rewards';
import { rainbowDay, seasonFor } from '../src/board/Weather';
import { lastDotsName, lastDotsSentence, skippedWords } from '../src/ui/meterWords';

const NOW = new Date(2026, 9, 13, 8, 0, 0); // Oct 13 2026, local morning
const TODAY = '2026-10-13';

function dryRun(end: string, n: number): Records {
  const r: Records = {};
  for (let i = 0; i < n; i++) r[addDays(end, -i)] = 'dry';
  return r;
}

describe('date keys', () => {
  it('validates real calendar dates only', () => {
    expect(isValidDateKey('2026-10-13')).toBe(true);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('20261013')).toBe(false);
    expect(isValidDateKey(42)).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});

describe('prizes and lands', () => {
  it('gives prizes at 5 and 10 stars, then every 15', () => {
    expect([0, 1, 2, 3, 4].map((i) => prizeThreshold(i))).toEqual([5, 10, 25, 40, 55]);
    expect(prizesEarned(4)).toBe(0);
    expect(prizesEarned(5)).toBe(1);
    expect(prizesEarned(9)).toBe(1);
    expect(prizesEarned(10)).toBe(2);
    expect(prizesEarned(24)).toBe(2);
    expect(prizesEarned(25)).toBe(3);
    expect(prizesEarned(100)).toBe(8);
    // without the early prize: 10, 25, 40, ...
    const classic = { ...DEFAULT_RULES, earlyPrize: 0 };
    expect([0, 1, 2].map((i) => prizeThreshold(i, classic))).toEqual([10, 25, 40]);
    expect(prizesEarned(25, classic)).toBe(2);
  });

  it('splits the board into two 5-space lands and then 15-space lands', () => {
    expect(landRange(0)).toEqual({ start: 0, end: 5 });
    expect(landRange(1)).toEqual({ start: 5, end: 10 });
    expect(landRange(2)).toEqual({ start: 10, end: 25 });
    expect(landRange(3)).toEqual({ start: 25, end: 40 });
    expect(landOf(0)).toBe(0);
    expect(landOf(4)).toBe(0);
    // reaching the chest finishes the land and the board moves on
    expect(landOf(5)).toBe(1);
    expect(landOf(10)).toBe(2);
    expect(landOf(26)).toBe(3);
  });

  it('cycles through the prize list', () => {
    expect(prizeAt(DEFAULT_PRIZES, 0).label).toBe('Candy');
    expect(prizeAt(DEFAULT_PRIZES, 2).label).toBe("McDonald's");
    expect(prizeAt(DEFAULT_PRIZES, 5).label).toBe('Pizza party');
    expect(prizeAt(DEFAULT_PRIZES, 6).label).toBe('Candy');
    expect(prizeAt([], 0).label).toBe('Candy');
  });
});

describe('quest', () => {
  it('counts every dry morning as a star and keeps stars after a wet night', () => {
    const r: Records = { ...dryRun('2026-10-05', 5), '2026-10-06': 'wet', ...dryRun('2026-10-09', 3) };
    const q = computeQuest(r);
    expect(q.stars).toBe(8);
    expect(q.wets).toBe(1);
    // the kinder meter: 5 dots, one taken away, 3 more
    expect(q.meter).toBe(7);
    expect(q.best).toBe(5);
    expect(q.lastWet).toBe('2026-10-06');
  });

  it('takes one dot off the meter for a wet morning (never below zero)', () => {
    const q = computeQuest({ ...dryRun('2026-10-12', 6), [TODAY]: 'wet' });
    expect(q.meter).toBe(5);
    expect(q.stars).toBe(6);
    expect(q.latest).toEqual({ date: TODAY, result: 'wet' });
    expect(computeQuest({ '2026-10-11': 'wet', '2026-10-12': 'wet', [TODAY]: 'dry' }).meter).toBe(1);
  });

  it('starts the meter fresh on a wet morning in the classic mode', () => {
    const classic = { ...DEFAULT_RULES, meter: 'streak' as const };
    const q = computeQuest({ ...dryRun('2026-10-12', 6), [TODAY]: 'wet' }, classic);
    expect(q.meter).toBe(0);
    expect(computeQuest({ ...dryRun('2026-10-05', 5), '2026-10-06': 'wet', ...dryRun('2026-10-09', 3) }, classic).meter).toBe(3);
  });

  it('gives an older adventure the kinder meter from its next morning, so the meter never jumps', () => {
    // recorded before the kinder meter: 8 dry, a wet night, 3 dry (a classic meter of 3)
    const r: Records = { ...dryRun('2026-10-05', 8), '2026-10-06': 'wet', ...dryRun('2026-10-09', 3) };
    const old = normalizeSave({ app: APP_ID, version: 1, records: r, rules: { goal: 10 } }, NOW)!;
    expect(old.rules.meter).toBe('kind');
    expect(old.rules.kindFrom).toBe('2026-10-10');
    expect(computeQuest(old.records, old.rules).meter).toBe(3);
    expect(old.underpants.earned).toBe(false);
    // from then on a wet morning takes only one dot off
    expect(computeQuest({ ...r, '2026-10-10': 'wet' }, old.rules).meter).toBe(2);
    // the same nights in an adventure that had the kinder meter from the start
    expect(computeQuest(r, { ...DEFAULT_RULES, goal: 10, finalRun: 0 }).meter).toBe(10);
    expect(normalizeSave({ ...old }, NOW)!.rules.kindFrom).toBe('2026-10-10');
    expect(defaultSave(NOW).rules.kindFrom).toBeNull();
  });

  it('only fills the kinder meter when dry nights clearly win', () => {
    // dry, dry, wet, over and over: two steps forward, one back
    const r: Records = {};
    for (let i = 0; i < 30; i++) r[addDays('2026-09-01', i)] = i % 3 === 2 ? 'wet' : 'dry';
    expect(computeQuest(r, { ...DEFAULT_RULES, goal: 10, finalRun: 0 }).goalReachedOn).not.toBeNull();
    // ...but never five in a row, so with the last-five rule it never quite fills
    expect(computeQuest(r, { ...DEFAULT_RULES, goal: 10 }).goalReachedOn).toBeNull();
    // dry, wet, dry, wet: never gets anywhere
    const half: Records = {};
    for (let i = 0; i < 40; i++) half[addDays('2026-09-01', i)] = i % 2 ? 'wet' : 'dry';
    expect(computeQuest(half, { ...DEFAULT_RULES, goal: 5, finalRun: 0 }).goalReachedOn).toBeNull();
  });

  it('needs the last five dots in a row: a not-dry night there starts those five over', () => {
    const rules = { ...DEFAULT_RULES, goal: 10 };
    // seven dry nights reach into the last five; a not-dry night goes back to 5, not 6
    let r: Records = dryRun('2026-09-07', 7);
    r = { ...r, '2026-09-08': 'wet' };
    expect(computeQuest(r, rules).meter).toBe(5);
    // at exactly 5 (not into the last five yet) a not-dry night takes just one dot
    expect(computeQuest({ ...r, '2026-09-09': 'wet' }, rules).meter).toBe(4);
    // five dry nights in a row then fill it
    r = { ...r, ...dryRun('2026-09-13', 5) };
    const q = computeQuest(r, rules);
    expect(q.meter).toBe(10);
    expect(q.goalReachedOn).toBe('2026-09-13');
    // the classic meter is all in a row anyway; turned off, the kinder meter just loses one
    expect(computeQuest({ ...dryRun('2026-09-07', 7), '2026-09-08': 'wet' }, { ...rules, finalRun: 0 }).meter).toBe(6);
  });

  it('asks for every dot in a row when the goal is five or less', () => {
    const rules = { ...DEFAULT_RULES, goal: 3 };
    expect(computeQuest({ ...dryRun('2026-09-02', 2), '2026-09-03': 'wet' }, rules).meter).toBe(0);
    expect(computeQuest({ ...dryRun('2026-09-02', 2), '2026-09-03': 'wet', ...dryRun('2026-09-06', 3) }, rules).goalReachedOn).toBe('2026-09-06');
  });

  it('starts the last-five rule with the next morning for an adventure already under way, changing nothing recorded', () => {
    // an adventure from before the rule: kinder meter, no last-five setting yet
    const r: Records = { ...dryRun('2026-10-05', 12), '2026-10-06': 'wet', ...dryRun('2026-10-09', 3) };
    const raw = { app: APP_ID, version: 1, records: r, rules: { goal: 15, meter: 'kind', kindFrom: null } };
    const before = computeQuest(r, { ...DEFAULT_RULES, goal: 15, finalRun: 0 });
    const d = normalizeSave(raw, NOW)!;
    expect(d.rules.finalRun).toBe(5);
    expect(d.rules.finalFrom).toBe('2026-10-10');
    expect(d.records).toEqual(r);
    // the wet night at 12 dots happened before the rule: it still only took one dot
    expect(computeQuest(d.records, d.rules).meter).toBe(before.meter);
    expect(before.meter).toBe(14);
    // from now on, a not-dry night in the last five starts them over
    expect(computeQuest({ ...r, '2026-10-10': 'wet' }, d.rules).meter).toBe(10);
    // a new adventure has the rule from the start, and it can be turned off
    expect(defaultSave(NOW).rules.finalRun).toBe(5);
    expect(normalizeSave({ ...raw, rules: { ...raw.rules, finalRun: 0 } }, NOW)!.rules.finalRun).toBe(0);
  });

  it('needs the last five on mornings in a row: a skipped morning there starts those five over', () => {
    const rules = { ...DEFAULT_RULES, goal: 10 };
    // seven dry nights reach two dots into the last five
    const r: Records = dryRun('2026-09-07', 7);
    // nobody recorded Sep 8; a dry Sep 9 starts the last five over, as their first dot
    const gap: Records = { ...r, '2026-09-09': 'dry' };
    let q = computeQuest(gap, rules);
    expect(q.meter).toBe(6);
    expect(q.stars).toBe(8);
    expect(q.missedRestart).toEqual({ on: '2026-09-09', after: '2026-09-07' });
    // filling the skipped morning in as dry puts the dots back
    q = computeQuest({ ...gap, '2026-09-08': 'dry' }, rules);
    expect(q.meter).toBe(9);
    expect(q.missedRestart).toBeNull();
    // the meter fills only after five dry nights on five mornings in a row (Sep 9 to 13)
    expect(computeQuest({ ...gap, ...dryRun('2026-09-12', 3) }, rules).goalReachedOn).toBeNull();
    expect(computeQuest({ ...gap, ...dryRun('2026-09-13', 4) }, rules).goalReachedOn).toBe('2026-09-13');
    // below the last five, or right at their start, a skipped morning changes nothing
    expect(computeQuest({ ...dryRun('2026-09-03', 3), ...dryRun('2026-09-06', 2) }, rules).meter).toBe(5);
    expect(computeQuest({ ...dryRun('2026-09-05', 5), '2026-09-07': 'dry' }, rules).meter).toBe(6);
    // every dot needs mornings in a row when the goal is five or less
    expect(computeQuest({ ...dryRun('2026-09-02', 2), '2026-09-04': 'dry' }, { ...DEFAULT_RULES, goal: 3 }).meter).toBe(1);
    // with the rule off, and in the classic mode, skipped mornings are ignored as before
    expect(computeQuest(gap, { ...rules, finalRun: 0 }).meter).toBe(8);
    expect(computeQuest(gap, { ...rules, meter: 'streak' }).meter).toBe(8);
  });

  it('counts skipped mornings only from when the last-five rule began, so nothing recorded before changes', () => {
    // recorded before the rule: 17 dry nights, two mornings nobody recorded, two more dry
    const r: Records = { ...dryRun('2026-10-05', 17), ...dryRun('2026-10-09', 2) };
    const d = normalizeSave({ app: APP_ID, version: 1, records: r, rules: { goal: 20, meter: 'kind', kindFrom: null } }, NOW)!;
    expect(d.rules.finalFrom).toBe('2026-10-10');
    const q = computeQuest(d.records, d.rules);
    expect(q.meter).toBe(19);
    expect(q.missedRestart).toBeNull();
    // from then on a skipped morning in the last five starts them over
    expect(computeQuest({ ...r, '2026-10-11': 'dry' }, d.rules).meter).toBe(16);
    // ...but mornings skipped before the rule began never do
    expect(computeQuest({ ...dryRun('2026-10-05', 17), '2026-10-10': 'dry' }, d.rules).meter).toBe(18);
  });

  it('names the skipped mornings for grown-ups', () => {
    expect(skippedWords('2026-10-09', '2026-10-11').many).toBe(false);
    expect(skippedWords('2026-10-05', '2026-10-10')).toMatchObject({ many: true, text: expect.stringMatching(/^the 4 mornings from .+ weren't recorded$/) });
    expect(lastDotsSentence(DEFAULT_RULES)).toBe('The last five dots need five dry nights in a row, with no morning skipped.');
    expect(lastDotsName({ ...DEFAULT_RULES, goal: 4 })).toBe('the meter');
  });

  it('treats unrecorded mornings below the last five as unknown: they neither add nor reset', () => {
    const r: Records = { ...dryRun('2026-10-05', 4), ...dryRun('2026-10-12', 3) };
    const q = computeQuest(r);
    expect(q.meter).toBe(7);
    expect(q.stars).toBe(7);
    expect(missingSinceLatest({ '2026-10-10': 'dry' }, TODAY)).toEqual(['2026-10-11', '2026-10-12']);
  });

  it('reaches the underpants goal after N dry mornings in a row', () => {
    expect(computeQuest(dryRun(TODAY, 19)).goalReachedOn).toBeNull();
    expect(computeQuest(dryRun(TODAY, 20)).goalReachedOn).toBe(TODAY);
    expect(computeQuest(dryRun(TODAY, 5), { ...DEFAULT_RULES, goal: 5 }).goalReachedOn).toBe(TODAY);
  });

  it('previews a correction without changing the records', () => {
    const r = dryRun('2026-10-12', 3);
    expect(questIfRecorded(r, TODAY, 'wet').meter).toBe(2);
    expect(questIfRecorded(r, TODAY, 'wet', { ...DEFAULT_RULES, meter: 'streak' }).meter).toBe(0);
    expect(questIfRecorded(r, '2026-10-12', null).stars).toBe(2);
    expect(Object.keys(r)).toHaveLength(3);
  });

  it('summarises the last two weeks for grown-ups', () => {
    const r: Records = { ...dryRun(TODAY, 10), '2026-10-02': 'wet' };
    expect(recentRate(r, TODAY, 14)).toEqual({ dry: 10, wet: 1, unknown: 3 });
  });
});

describe('weather', () => {
  it('picks the season by month, the other way round south of the equator', () => {
    expect(seasonFor(new Date(2026, 9, 16), 'America/Los_Angeles')).toBe('fall');
    expect(seasonFor(new Date(2026, 9, 16), 'Australia/Sydney')).toBe('spring');
    expect(seasonFor(new Date(2027, 0, 5), 'Europe/London')).toBe('winter');
    expect(seasonFor(new Date(2027, 6, 5), 'America/New_York')).toBe('summer');
    expect(seasonFor(new Date(2027, 6, 5), 'America/Argentina/Buenos_Aires')).toBe('winter');
  });

  it('has a rainbow every fourth morning, but not in the snow', () => {
    const days = Array.from({ length: 8 }, (_, i) => rainbowDay(new Date(2026, 9, 14 + i, 8), 'America/Los_Angeles'));
    expect(days.filter(Boolean)).toHaveLength(2);
    expect(Array.from({ length: 8 }, (_, i) => rainbowDay(new Date(2027, 0, 4 + i, 8), 'America/Los_Angeles')).some(Boolean)).toBe(false);
  });
});

describe('surprises and accessories', () => {
  it('hatches an egg on odd stars until every accessory is out', () => {
    expect(surpriseFor(1)).toBe('egg');
    expect(surpriseFor(2)).toBe('highfive');
    expect(surpriseFor(3)).toBe('egg');
    // the ten games take turns between eggs
    expect([4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map(surpriseFor)).toEqual(['balloons', 'snack', 'dance', 'peekaboo', 'tickle', 'roar', 'band', 'fireworks', 'moves', 'highfive']);
    expect(accessoryForStar(1)).toBe(0);
    expect(accessoryForStar(5)).toBe(2);
    expect(accessoryForStar(4)).toBeNull();
    const last = ACCESSORIES.length * 2;
    expect(accessoryForStar(last - 1)).toBe(ACCESSORIES.length - 1);
    expect(surpriseFor(last + 1)).not.toBe('egg');
  });

  it('plays every game once in ten turns, with no game twice in a row', () => {
    const after = Array.from({ length: 20 }, (_, i) => surpriseFor(ACCESSORIES.length * 2 + 1 + i));
    expect(new Set(after.slice(0, 10)).size).toBe(10);
    for (let i = 1; i < after.length; i++) expect(after[i]).not.toBe(after[i - 1]);
  });

  it('unlocks accessories in order and dresses the dino in the newest per slot', () => {
    expect(accessoriesUnlocked(0)).toBe(0);
    expect(accessoriesUnlocked(1)).toBe(1);
    expect(accessoriesUnlocked(2)).toBe(1);
    expect(accessoriesUnlocked(1000)).toBe(ACCESSORIES.length);
    const outfit = defaultOutfit(5);
    expect(outfit.head).toBe(4); // party hat replaced the cap
    expect(outfit.face).toBe(1);
  });
});

describe('save data', () => {
  it('starts with sound on and setup to do', () => {
    const d = defaultSave(NOW);
    expect(d.settings.sound).toBe(true);
    expect(d.profile.setupDone).toBe(false);
    expect(d.rules.goal).toBe(20);
  });

  it('records idempotently, one result per morning, never in the future', () => {
    const d = defaultSave(NOW);
    const a = withRecord(d, TODAY, 'dry', NOW);
    expect(withRecord(a, TODAY, 'dry', NOW)).toBe(a);
    const b = withRecord(a, TODAY, 'wet', NOW);
    expect(Object.keys(b.records)).toEqual([TODAY]);
    expect(b.records[TODAY]).toBe('wet');
    expect(() => withRecord(d, '2026-10-14', 'dry', NOW)).toThrow();
  });

  it('earns underpants at the goal and keeps them through later wet nights', () => {
    let d = defaultSave(NOW);
    d = { ...d, records: dryRun('2026-10-12', 20) };
    d = applyDerived(d);
    expect(d.underpants.earned).toBe(true);
    expect(d.underpants.on).toBe('2026-10-12');
    d = withRecord(d, TODAY, 'wet', NOW);
    expect(d.underpants.earned).toBe(true);
    // (a not-dry night in the last five starts those five over)
    expect(computeQuest(d.records, d.rules).meter).toBe(15);
  });

  it('earns underpants when a grown-up lowers the goal below the current run', () => {
    let d = { ...defaultSave(NOW), records: dryRun(TODAY, 8) };
    d = applyDerived(d);
    expect(d.underpants.earned).toBe(false);
    d = applyDerived({ ...d, rules: { ...d.rules, goal: 7 } });
    expect(d.underpants.earned).toBe(true);
  });

  it('rejects data that is not ours', () => {
    expect(normalizeSave({ app: 'other', records: {} }, NOW)).toBeNull();
    expect(normalizeSave(null, NOW)).toBeNull();
    const ok = normalizeSave({ app: APP_ID, version: 1, records: { [TODAY]: 'dry', '2030-01-01': 'dry', bad: 'dry' } }, NOW);
    expect(ok?.records).toEqual({ [TODAY]: 'dry' });
  });

  it('round-trips a backup and marks everything as already seen', () => {
    let d = defaultSave(NOW);
    d = { ...d, records: { ...dryRun('2026-10-12', 12), [TODAY]: 'wet' }, profile: { ...d.profile, species: 'stego', setupDone: true } };
    const text = exportBackup(d, NOW);
    const res = parseBackup(text, defaultSave(NOW), NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.recordCount).toBe(13);
    expect(res.data.profile.species).toBe('stego');
    expect(res.data.seen).toEqual({ stars: 12, prizes: 2, hugDate: TODAY, underpants: false, meter: 11 });
  });

  it('imports the nights from an old candy-castle backup', () => {
    const old = JSON.stringify({ app: 'zefs-dry-night-quest', version: 1, records: dryRun(TODAY, 4) });
    const res = parseBackup(old, defaultSave(NOW), NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fromOldVersion).toBe(true);
    expect(computeQuest(res.data.records).stars).toBe(4);
    expect(res.data.seen.stars).toBe(4);
  });

  it('refuses unreadable or foreign backups', () => {
    expect(parseBackup('not json', defaultSave(NOW), NOW).ok).toBe(false);
    expect(parseBackup('{"hello":1}', defaultSave(NOW), NOW).ok).toBe(false);
  });

  it('starts a new quest but keeps the dino, prizes and settings', () => {
    let d = defaultSave(NOW);
    d = { ...d, records: dryRun(TODAY, 30), profile: { ...d.profile, name: 'Zef', species: 'trike', setupDone: true } };
    d = applyDerived(d);
    const n = newQuest(d, NOW);
    expect(n.records).toEqual({});
    expect(n.underpants.earned).toBe(false);
    expect(n.profile.species).toBe('trike');
    expect(n.prizes).toEqual(d.prizes);
    expect(seenFromRecords(n).stars).toBe(0);
  });

  it('starts over from the very first screen, keeping only the grown-up settings', () => {
    let d = defaultSave(NOW);
    d = {
      ...d,
      records: dryRun(TODAY, 30),
      profile: { ...d.profile, name: 'Milo', species: 'stego', color: 3, setupDone: true },
      rules: { ...d.rules, goal: 14 },
      prizes: [{ label: 'Zoo trip', icon: 'gift' }],
      outfit: { head: 2 },
      settings: { ...d.settings, music: false },
    };
    d = applyDerived(d);
    const n = startOver(d, NOW);
    expect(n.records).toEqual({});
    expect(n.profile).toEqual({ ...defaultSave(NOW).profile, name: 'Milo' });
    expect(n.profile.setupDone).toBe(false);
    expect(n.outfit).toEqual({});
    expect(n.underpants.earned).toBe(false);
    expect(n.seen.stars).toBe(0);
    expect(n.rules.goal).toBe(14);
    expect(n.prizes).toEqual(d.prizes);
    expect(n.settings.music).toBe(false);
  });
});

// How the meter's last dots are described to grown-ups, in one place.

import { addDays, daysBetween, finalStretch, formatKeyShort, type DateKey, type QuestRules } from '../state/progress';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "The last five dots need five dry nights in a row, with no morning skipped." (empty when that rule is off) */
export function lastDotsSentence(rules: QuestRules): string {
  const { size, floor } = finalStretch(rules);
  if (size === 0) return '';
  const n = WORDS[size] ?? String(size);
  return `${floor === 0 ? `All ${n}` : `The last ${n}`} dots need ${n} dry nights in a row, with no morning skipped.`;
}

/** "the last five dots", or "the meter" when every dot needs nights in a row. */
export function lastDotsName(rules: QuestRules): string {
  const { size, floor } = finalStretch(rules);
  return floor === 0 ? 'the meter' : `the last ${WORDS[size] ?? size} dots`;
}

/** The mornings nobody recorded before a restart on `on`: "Sat, Oct 25 wasn't recorded". */
export function skippedWords(after: DateKey, on: DateKey): { text: string; many: boolean } {
  const n = daysBetween(after, on) - 1;
  const last = formatKeyShort(addDays(on, -1));
  return n <= 1
    ? { text: `${last} wasn't recorded`, many: false }
    : { text: `the ${n} mornings from ${formatKeyShort(addDays(after, 1))} to ${last} weren't recorded`, many: true };
}

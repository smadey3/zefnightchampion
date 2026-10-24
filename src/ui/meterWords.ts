// How the meter's last dots are described to grown-ups, in one place.

import { finalStretch, type QuestRules } from '../state/progress';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "The last five dots need five dry nights in a row." (empty when that rule is off) */
export function lastDotsSentence(rules: QuestRules): string {
  const { size, floor } = finalStretch(rules);
  if (size === 0) return '';
  const n = WORDS[size] ?? String(size);
  return floor === 0 ? `All ${n} dots need ${n} dry nights in a row.` : `The last ${n} dots need ${n} dry nights in a row.`;
}

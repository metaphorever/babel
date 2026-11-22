import { log } from './actions';
import { hasWriteLine, scribeLoop } from './carriers';
import { PATRON } from './tuning';
import type { SimState } from './types';

// The patron's charter is a standing order nailed to the board:
//
//   IF no one is writing THEN post the scribe loop for Anyone
//
// It's the one conditional order in P0, a preview of what players will be
// able to write later. It means firing your scribe (or losing them) can
// never leave you with no way to write a new one.

export const CHARTER_TEXT = 'IF no one is writing, THEN post [write] [deliver] [repeat] for Anyone';

/** Is anyone writing, or about to be? */
export function someoneIsWriting(s: SimState): boolean {
  for (const w of s.workers) {
    if (w.held.some(hasWriteLine)) return true;
    // a scribe loop in the bag of someone who will deliver it
    const delivers = w.held.some((c) => c.orders.some((o) => o[0].t === 'DELIVER'));
    if (delivers && w.bag.some(hasWriteLine)) return true;
  }
  return s.boardScrolls.some(hasWriteLine);
}

export function checkCharter(s: SimState): void {
  if (s.tick % PATRON.charterCheckTicks !== 0) return;
  if (someoneIsWriting(s)) return;
  s.boardScrolls.push(scribeLoop(s, { kind: 'board', addressee: null }, true));
  log(s, "No one is writing. The patron's charter posts a scribe loop on the board for Anyone.");
}

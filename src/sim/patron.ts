import { log } from './actions';
import { hasWriteLine, scribeLoop } from './carriers';
import { addWorker } from './sim';
import { ARRIVALS, PATRON, POPULATION } from './tuning';
import { siteOf } from './world';
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

// ----------------------------------------------------------- the stipend

/**
 * The patron starts generous and loses patience steadily. Every finished
 * floor wins some back, along with a bonus. The stipend shrinks with
 * patience; at zero it stops. Difficulty is how fast patience drains.
 */
export function updatePatron(s: SimState): void {
  const before = s.patience;
  s.patience = Math.max(0, s.patience - PATRON.patienceDrain[s.difficulty]);
  if (before > 0 && s.patience === 0) log(s, 'The patron has run out of patience. No more stipend until the tower grows again.');
  else if (before >= 25 && s.patience < 25) log(s, 'The patron is growing impatient. Finish a floor soon.');

  if (s.tick >= s.nextStipend) {
    s.nextStipend = s.tick + PATRON.stipendEvery;
    const pay = Math.round((PATRON.stipendBase * s.patience) / 100);
    if (pay > 0) {
      s.gold += pay;
      s.income += pay;
    }
  }

  if (s.tick >= s.nextArrival) {
    s.nextArrival = s.tick + ARRIVALS.every;
    const target = Math.min(POPULATION.cap, POPULATION.start + s.floors * ARRIVALS.perFloor);
    const staying = s.workers.filter((w) => !w.leaving).length;
    if (s.patience >= PATRON.recruitAbove && staying < target) {
      const w = addWorker(s);
      const road = siteOf(s, 'home');
      w.x = road.x0;
      w.y = road.y;
      log(s, `${w.name} arrived on the road, sent by the patron to work on the tower.`, w.id);
    }
  }
}

/** A floor is done: the patron is pleased. */
export function patronFloorDone(s: SimState, level: number): void {
  s.patience = Math.min(100, s.patience + PATRON.floorPatience);
  const bonus = PATRON.floorBonusBase + PATRON.floorBonusPerLevel * level;
  s.gold += bonus;
  s.income += bonus;
  log(s, `The patron is pleased with floor ${level} and sends ${bonus} gold.`);
}

/** Gold per stipend at the current patience. */
export function currentStipend(s: SimState): number {
  return Math.round((PATRON.stipendBase * s.patience) / 100);
}

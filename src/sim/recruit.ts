import { log } from './actions';
import { addWorker } from './sim';
import { socialArrival } from './social';
import { POPULATION, RECRUIT } from './tuning';
import { siteOf } from './world';
import type { SimState, Worker } from './types';

// Recruiting (§16.9 step 4): hiring a worker yourself, outside the order
// system. No scribe, no courier: the fee leaves the treasury at once and the
// recruit walks in from the road, like one of the patron's newcomers. The fee
// grows with the square of the headcount, so it's cheap when few are left and
// dear when the camp is busy. It's also what the "everyone gone" alert offers.

/** 1215 → "1,215", the same in every browser. */
export function goldText(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Workers who are staying (not on their way home). */
export function headcount(s: SimState): number {
  return s.workers.filter((w) => !w.leaving).length;
}

/** What the next recruit costs: perSquare × the headcount you'd have with them (the 9th worker costs 15 × 81). */
export function recruitFee(s: SimState): number {
  const n = headcount(s) + 1;
  return RECRUIT.perSquare * n * n;
}

/** Why you can't recruit right now, or null if you can. */
export function recruitError(s: SimState): string | null {
  if (headcount(s) >= POPULATION.cap) return `The camp is full: ${POPULATION.cap} workers is as many as it can hold.`;
  const fee = recruitFee(s);
  const free = s.gold - s.reserved;
  if (fee > free) return `A recruit costs ${goldText(fee)} gold; only ${goldText(free)} is free in the treasury.`;
  return null;
}

/** A new worker on the road at the left edge, about to walk into camp. */
export function arriveOnRoad(s: SimState): Worker {
  const w = addWorker(s);
  socialArrival(s, w);
  const road = siteOf(s, 'home');
  w.x = road.x0;
  w.y = road.y;
  return w;
}

/** Hire one worker now. Assumes recruitError(s) is null. */
export function recruitWorker(s: SimState): Worker {
  const fee = recruitFee(s);
  s.gold -= fee;
  const w = arriveOnRoad(s);
  log(s, `${w.name} arrived on the road, recruited for ${goldText(fee)} gold.`, w.id);
  return w;
}

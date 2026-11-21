import { addMoodlet, log, moveTo } from './actions';
import { startActivity, train, workOrder, type Result } from './activities';
import { carrierText, destText, pinNotice } from './carriers';
import { orderText, type Verb } from './lang';
import { skillLevel } from './skills';
import { MOOD, SCRIBE } from './tuning';
import type { Carrier, SimState, Worker } from './types';
import { siteOf, spotFor } from './world';

// A worker holding a scroll carries it out line by line. Needs can still
// pull them away, but the scroll stays in hand and they pick up where they
// left off. REPEAT loops back to the top, which is the only way to keep a
// worker on a job without sending them back to the board each time.

export function activeCarrier(w: Worker): Carrier | null {
  return w.held[0] ?? null;
}

export function runScroll(s: SimState, w: Worker): Result {
  const c = activeCarrier(w);
  if (!c) return 'failed';
  if (c.pc >= c.orders.length) return endCarrier(s, w, c);
  const line = c.orders[c.pc];
  const verb = line[0].t as Verb;
  switch (verb) {
    case 'REPEAT':
      // a scroll that is only REPEAT would spin forever
      if (c.pc === 0) return endCarrier(s, w, c);
      c.pc = 0;
      c.loops++;
      startActivity(w, 'scroll');
      return 'running';
    case 'CHECK':
      // done with this scroll: head to the board for the next job
      w.thought = 'Off to check the board.';
      removeCarrier(s, w, c, 'used up');
      startActivity(w, 'readBoard');
      return 'running';
    case 'WRITE':
      return writeLine(s, w, c);
    case 'DELIVER':
      return deliverLine(s, w);
    default:
      return workOrder(s, w, line);
  }
}

/** A line was carried out: pay for it and move on to the next. */
export function scrollLineDone(s: SimState, w: Worker, units: number): Result {
  const c = activeCarrier(w)!;
  const pay = c.wage * units;
  if (pay > 0) {
    if (s.gold - s.reserved >= pay) {
      s.gold -= pay;
      w.purse += pay;
      addMoodlet(s, w, 'paid', `Paid ${pay} gold`, MOOD.gotPaid.value, MOOD.gotPaid.ticks);
    } else {
      addMoodlet(s, w, 'unpaid', 'Treasury was empty', -6, MOOD.missedJobTicks);
      log(s, `No gold to pay ${w.name} for "${orderText(c.orders[c.pc])}".`, w.id);
    }
  }
  w.jobsDone++;
  c.pc++;
  if (c.pc >= c.orders.length) return endCarrier(s, w, c);
  startActivity(w, 'scroll');
  return 'running';
}

/** A line couldn't be done: skip it, take a breather, carry on later. */
export function scrollLineFailed(s: SimState, w: Worker, why: string): Result {
  const c = activeCarrier(w)!;
  w.thought = why;
  log(s, `${w.name} skipped "${orderText(c.orders[c.pc])}": ${why}`, w.id);
  addMoodlet(s, w, 'failed', "Couldn't do a line on my scroll", MOOD.failedJob.value, MOOD.failedJob.ticks);
  c.pc++;
  c.waitUntil = s.tick + SCRIBE.lineRetryTicks;
  if (c.pc >= c.orders.length) return endCarrier(s, w, c);
  return 'failed';
}

function endCarrier(s: SimState, w: Worker, c: Carrier): Result {
  removeCarrier(s, w, c, 'used up');
  return 'done';
}

function removeCarrier(s: SimState, w: Worker, c: Carrier, why: string): void {
  w.held = w.held.filter((x) => x !== c);
  log(s, `${w.name} finished a ${c.kind} (${why}): ${carrierText(c)}.`, w.id);
}

// ------------------------------------------------------------------ WRITE

function writeSpeed(w: Worker): number {
  return 1 + skillLevel(w, 'writing') * SCRIBE.speedPerLevel;
}

/**
 * Sit at the scriptorium desk and write out the next design in the queue.
 * With nothing queued, the scribe waits at the desk.
 */
function writeLine(s: SimState, w: Worker, _c: Carrier): Result {
  const a = w.activity;
  const desk = siteOf(s, 'scriptorium');
  if (a.stage === 0) {
    w.thought = 'Off to the scriptorium.';
    const m = moveTo(s, w, spotFor(desk, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return scrollLineFailed(s, w, "Can't reach the scriptorium.");
    a.stage = 1;
  }
  let d = s.designs.find((x) => x.claimedBy === w.id);
  if (!d) {
    if (w.bag.length >= SCRIBE.bagSize) return scrollLineFailed(s, w, 'My bag is full.');
    d = s.designs.find((x) => x.claimedBy === null);
    if (!d) {
      w.thought = 'Nothing to write. Waiting at the desk.';
      return 'running';
    }
    d.claimedBy = w.id;
  }
  w.thought = `Writing: ${carrierText(d.carrier)}.`;
  d.progress += writeSpeed(w);
  if (d.progress < d.cost) return 'running';
  s.designs = s.designs.filter((x) => x !== d);
  w.bag.push(d.carrier);
  train(s, w, 'writing');
  return scrollLineDone(s, w, 1);
}

// ---------------------------------------------------------------- DELIVER

/**
 * Carry everything in the bag to where it's going: pin notices on the
 * board, hand scrolls to workers by name. activity.timer counts deliveries
 * this time round, which is what the line pays for.
 */
function deliverLine(s: SimState, w: Worker): Result {
  const a = w.activity;
  const c = w.bag.find((b) => b.retryAfter <= s.tick);
  if (!c) {
    if (a.timer === 0) w.thought = w.bag.length ? 'Nobody can take these yet.' : 'Nothing to deliver.';
    return scrollLineDone(s, w, a.timer);
  }
  if (c.dest.kind === 'board') {
    w.thought = 'Taking a notice to the board.';
    const m = moveTo(s, w, spotFor(siteOf(s, 'board'), w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') {
      c.retryAfter = s.tick + SCRIBE.retryTicks;
      return 'running';
    }
    const dest = c.dest;
    pinNotice(s, c.orders[0], dest.count, c.wage, dest.addressee);
    w.bag = w.bag.filter((x) => x !== c);
    a.timer++;
    log(s, `${w.name} pinned up: ${carrierText(c)} (×${dest.count}).`, w.id);
    return 'running';
  }
  const to = s.workers.find((x) => x.id === (c.dest.kind === 'worker' ? c.dest.workerId : -1));
  if (!to) {
    w.bag = w.bag.filter((x) => x !== c);
    log(s, `${w.name} threw away a ${c.kind}: its reader is gone.`, w.id);
    return 'running';
  }
  const close = to === w || (to.y === w.y && Math.abs(to.x - w.x) <= SCRIBE.handRange);
  if (!close) {
    // everyone recognizes their own name, so the courier just has to get near
    w.thought = `Looking for ${to.name}.`;
    const m = moveTo(s, w, { x: to.x, y: to.y });
    if (m === 'unreachable') c.retryAfter = s.tick + SCRIBE.retryTicks;
    return 'running';
  }
  if (to.held.length >= SCRIBE.holdSize) {
    c.retryAfter = s.tick + SCRIBE.retryTicks;
    w.thought = `${to.name}'s hands are full.`;
    log(s, `${w.name} couldn't hand ${to.name} a ${c.kind}: their hands are full.`, w.id);
    return 'running';
  }
  w.bag = w.bag.filter((x) => x !== c);
  c.pc = 0;
  c.waitUntil = 0;
  to.held.push(c);
  a.timer++;
  log(s, to === w ? `${w.name} kept a ${c.kind} for themself: ${carrierText(c)}.` : `${w.name} handed ${destText(s, c.dest)} a ${c.kind}: ${carrierText(c)}.`, w.id);
  return 'running';
}

import { log } from './actions';
import { isWorkVerb, makeOrder, orderText, type Order } from './lang';
import { SCRIBE } from './tuning';
import type { Carrier, Design, Dest, Notice, SimState } from './types';

// Orders are physical. The player composes a carrier; it waits in the
// scriptorium's queue until a scribe writes it out; then someone has to
// carry it to the board or into a worker's hands before it does anything.

export interface Line {
  order: Order;
  count: number;
}

export function newCarrier(s: SimState, lines: Line[], wage: number, dest: Dest, patron = false): Carrier {
  return {
    id: s.nextId++,
    kind: lines.length > 1 ? 'scroll' : 'card',
    orders: lines.map((l) => l.order.map((t) => ({ ...t }))),
    counts: lines.map((l) => Math.max(1, l.count)),
    wage,
    dest,
    pc: 0,
    lineDone: 0,
    loops: 0,
    patron,
    waitUntil: 0,
    retryAfter: 0,
  };
}

/** The scribe loop: write, deliver, repeat. */
export function scribeLoop(s: SimState, dest: Dest, patron: boolean): Carrier {
  return newCarrier(
    s,
    [
      { order: makeOrder('WRITE'), count: 1 },
      { order: makeOrder('DELIVER'), count: 1 },
      { order: makeOrder('REPEAT'), count: 1 },
    ],
    1,
    dest,
    patron,
  );
}

/**
 * A one-line work card pinned on the board is a notice: it stays up, and
 * each reader takes one job from it until its count runs out.
 */
export function isNoticeCard(c: Carrier): boolean {
  return c.dest.kind === 'board' && c.orders.length === 1 && isWorkVerb(c.orders[0][0].t);
}

export function writingCost(c: Carrier): number {
  const tokens = c.orders.reduce((n, o) => n + o.length, 0);
  return SCRIBE.baseCost + tokens * SCRIBE.perToken;
}

export function queueDesign(s: SimState, carrier: Carrier): Design {
  const d: Design = {
    id: s.nextId++,
    carrier,
    cost: writingCost(carrier),
    progress: 0,
    claimedBy: null,
    postedTick: s.tick,
  };
  s.designs.push(d);
  return d;
}

/** Put a notice up on the board. */
export function pinNotice(s: SimState, order: Order, count: number, wage: number, addressee: number | null): Notice {
  const n: Notice = {
    id: s.nextId++,
    order: order.map((t) => ({ ...t })),
    remaining: count,
    wage,
    addressee,
    postedTick: s.tick,
  };
  s.notices.push(n);
  return n;
}

/** A courier arrives at the board: notices go up as notices, anything else hangs there to be taken. */
export function pinCarrier(s: SimState, c: Carrier): void {
  if (c.dest.kind !== 'board') return;
  if (isNoticeCard(c)) pinNotice(s, c.orders[0], c.counts[0], c.wage, c.dest.addressee);
  else {
    c.pc = 0;
    c.lineDone = 0;
    s.boardScrolls.push(c);
  }
}

export function lineText(c: Carrier, i: number): string {
  const text = orderText(c.orders[i]);
  return c.counts[i] > 1 ? `${text} ×${c.counts[i]}` : text;
}

export function carrierText(c: Carrier): string {
  return c.orders.map((_, i) => lineText(c, i)).join(' → ');
}

export function workerName(s: SimState, id: number | null): string {
  if (id === null) return 'Anyone';
  return s.workers.find((w) => w.id === id)?.name ?? 'someone who left';
}

export function destText(s: SimState, d: Dest): string {
  return d.kind === 'board' ? `the board, for ${workerName(s, d.addressee)}` : workerName(s, d.workerId);
}

/** Gold to set aside when this is composed: notices promise their whole count up front. */
export function boardReserve(c: Carrier): number {
  return isNoticeCard(c) ? c.counts[0] * c.wage : 0;
}

/** Take back a design that hasn't been written yet, refunding any promised gold. */
export function cancelDesign(s: SimState, designId: number): void {
  const d = s.designs.find((x) => x.id === designId);
  if (!d) return;
  s.reserved -= boardReserve(d.carrier);
  s.designs = s.designs.filter((x) => x.id !== designId);
  log(s, `Scrapped before writing: ${carrierText(d.carrier)}.`);
}

/** Does this carrier keep someone writing? */
export function hasWriteLine(c: Carrier): boolean {
  return c.orders.some((o) => o[0].t === 'WRITE');
}

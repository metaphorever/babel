import { log } from './actions';
import { countText, isSpecialCount, isWorkVerb, makeOrder, orderText, type LangId, type Order } from './lang';
import { SCRIBE, TOWER } from './tuning';
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
    counts: lines.map((l) => (isSpecialCount(l.count) ? l.count : Math.max(1, l.count))),
    wage,
    dest,
    pc: 0,
    lineDone: 0,
    loops: 0,
    patron,
    strikes: 0,
    waitUntil: 0,
    retryAfter: 0,
  };
}

/** The scribe loop: write, deliver, repeat. */
export function scribeLoop(s: SimState, dest: Dest, patron: boolean, lang: LangId = 'en'): Carrier {
  return newCarrier(
    s,
    [
      { order: makeOrder('WRITE', null, {}, lang), count: 1 },
      { order: makeOrder('DELIVER', null, {}, lang), count: 1 },
      { order: makeOrder('REPEAT', null, {}, lang), count: 1 },
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
  if (c.kind === 'blueprint') return TOWER.blueprintCost;
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
  const n = c.counts[i];
  return isSpecialCount(n) || n > 1 ? `${text} ×${countText(n)}` : text;
}

export function carrierText(c: Carrier): string {
  if (c.kind === 'blueprint') return 'blueprint for the next floor';
  return c.orders.map((_, i) => lineText(c, i)).join(' → ');
}

export function workerName(s: SimState, id: number | null): string {
  if (id === null) return 'Anyone';
  return s.workers.find((w) => w.id === id)?.name ?? 'someone who left';
}

export function destText(s: SimState, d: Dest): string {
  if (d.kind === 'board') return `the board, for ${workerName(s, d.addressee)}`;
  if (d.kind === 'tower') return 'the top of the tower';
  return workerName(s, d.workerId);
}

/** Gold to set aside when this is composed: notices promise their whole count up front. */
export function boardReserve(c: Carrier): number {
  // "all" and "forever" can't promise a total; they pay as they go
  return isNoticeCard(c) && !isSpecialCount(c.counts[0]) ? c.counts[0] * c.wage : 0;
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

/** A blueprint for the next floor: no orders on it, just a drawing to carry up the tower. */
export function newBlueprint(s: SimState): Carrier {
  const c = newCarrier(s, [], 0, { kind: 'tower' });
  c.kind = 'blueprint';
  return c;
}

import { log } from './actions';
import { orderText, type Order } from './lang';
import { SCRIBE } from './tuning';
import type { Carrier, Design, Dest, Notice, SimState } from './types';

// Orders are physical. The player composes a carrier; it waits in the
// scriptorium's queue until a scribe writes it out; then someone has to
// carry it to the board or into a worker's hands before it does anything.

export function newCarrier(s: SimState, orders: Order[], wage: number, dest: Dest): Carrier {
  return {
    id: s.nextId++,
    kind: orders.length > 1 ? 'scroll' : 'card',
    orders: orders.map((o) => o.map((t) => ({ ...t }))),
    wage,
    dest,
    pc: 0,
    loops: 0,
    waitUntil: 0,
    retryAfter: 0,
  };
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

/** Put a notice up on the board (a scribe pinning a written card, or the patron's starters). */
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

export function carrierText(c: Carrier): string {
  return c.orders.map((o) => orderText(o)).join(' → ');
}

export function destText(s: SimState, d: Dest): string {
  if (d.kind === 'board') {
    const to = d.addressee === null ? 'Anyone' : s.workers.find((w) => w.id === d.addressee)?.name ?? '?';
    return `the board (×${d.count}, for ${to})`;
  }
  return s.workers.find((w) => w.id === d.workerId)?.name ?? 'someone who left';
}

/** Gold still promised by a board-bound carrier that hasn't been pinned yet. */
export function boardReserve(c: Carrier): number {
  return c.dest.kind === 'board' ? c.dest.count * c.wage : 0;
}

/** Take back a design that hasn't been written yet, refunding any promised gold. */
export function cancelDesign(s: SimState, designId: number): void {
  const d = s.designs.find((x) => x.id === designId);
  if (!d) return;
  s.reserved -= boardReserve(d.carrier);
  s.designs = s.designs.filter((x) => x.id !== designId);
  log(s, `Scrapped before writing: ${carrierText(d.carrier)}.`);
}

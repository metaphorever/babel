import { findPath } from './path';
import { ALERTS, MOOD, MOVE, PAY } from './tuning';
import { Tile, isVehicleKind, type AlertKind, type Pt, type SimState, type Site, type Worker } from './types';
import { tileAt } from './world';

export type MoveResult = 'arrived' | 'moving' | 'unreachable';

/**
 * Walk one tick toward a target. A step that's under way always finishes
 * before the worker re-plans, so they never teleport between tiles.
 */
export function moveTo(s: SimState, w: Worker, to: Pt): MoveResult {
  if (w.stepProgress > 0) {
    advance(s, w);
    return 'moving';
  }
  if (w.x === to.x && w.y === to.y) {
    w.path = [];
    w.pathGoal = null;
    return 'arrived';
  }
  if (!w.pathGoal || w.pathGoal.x !== to.x || w.pathGoal.y !== to.y || w.path.length === 0) {
    const p = findPath(s, { x: w.x, y: w.y }, to);
    if (!p) {
      w.path = [];
      w.pathGoal = null;
      return 'unreachable';
    }
    w.path = p;
    w.pathGoal = { x: to.x, y: to.y };
  }
  advance(s, w);
  return 'moving';
}

/** Finish any step in progress. Returns true while still mid-step. */
export function settle(s: SimState, w: Worker): boolean {
  if (w.stepProgress > 0) {
    advance(s, w);
    return true;
  }
  return false;
}

function advance(s: SimState, w: Worker): void {
  if (w.path.length === 0) {
    w.stepProgress = 0;
    return;
  }
  const next = w.path[0];
  if (w.stepProgress === 0) {
    const climbing = next.x === w.x;
    let cost = climbing || tileAt(s, w.x, w.y) === Tile.Ladder ? MOVE.ladderTicksPerTile : MOVE.walkTicksPerTile;
    const cart = pushed(s, w);
    // a wheelbarrow or cart stays on the ground: one that would have to climb is let go of
    if (cart && next.y !== w.y) letGo(w);
    if (cart && next.y === w.y) cost += MOVE.pushSlowdown[cart.kind as keyof typeof MOVE.pushSlowdown];
    else if (w.carrying) cost += MOVE.carryingSlowdown;
    w.stepCost = cost;
    if (next.x !== w.x) w.facing = next.x > w.x ? 1 : -1;
  }
  w.stepProgress++;
  if (w.stepProgress >= w.stepCost) {
    w.x = next.x;
    w.y = next.y;
    w.path.shift();
    w.stepProgress = 0;
    const cart = pushed(s, w);
    if (cart) rollTo(s, w, cart);
  }
}

/** The wheelbarrow or cart this worker is pushing, if it's still there. */
export function pushed(s: SimState, w: Worker): Site | null {
  if (w.pushing === undefined || w.pushing === null) return null;
  const c = s.sites.find((x) => x.id === w.pushing);
  if (!c || !isVehicleKind(c.kind) || c.build || c.demolish) {
    w.pushing = null;
    return null;
  }
  return c;
}

/** Take hold of a wheelbarrow or cart: it rolls just ahead of them from now on. */
export function takeHold(s: SimState, w: Worker, cart: Site): void {
  w.pushing = cart.id;
  w.facing = cart.x0 > w.x ? 1 : cart.x1 < w.x ? -1 : w.facing;
  rollTo(s, w, cart);
}

/** Let go: it stays where it is, loaded or not, for anyone to use. */
export function letGo(w: Worker): void {
  w.pushing = null;
}

/** Put a pushed wheelbarrow or cart just ahead of whoever's pushing it, on the ground. */
function rollTo(s: SimState, w: Worker, cart: Site): void {
  const width = cart.x1 - cart.x0;
  let x0 = w.facing > 0 ? w.x + 1 : w.x - 1 - width;
  x0 = Math.max(0, Math.min(s.width - 1 - width, x0));
  cart.x0 = x0;
  cart.x1 = x0 + width;
  cart.y = w.y;
}

export function addMoodlet(
  s: SimState,
  w: Worker,
  kind: string,
  label: string,
  value: number,
  ticks: number,
): void {
  // same kind refreshes instead of stacking
  w.moodlets = w.moodlets.filter((m) => m.kind !== kind);
  w.moodlets.push({ kind, label, value, until: s.tick + ticks });
}

/** Paid for work: a little lift for any pay, more (and longer) for more. */
export function gotPaid(s: SimState, w: Worker, pay: number): void {
  const p = MOOD.gotPaid;
  addMoodlet(s, w, 'paid', `Paid ${pay} gold`, Math.min(p.max, Math.round(p.value + pay * p.perGold)), Math.min(p.maxTicks, p.ticks + pay * p.ticksPerGold));
}

/** A unit of work done at this wage: less than they think it's worth, and they feel it (greedier workers expect more). */
export function judgeWage(s: SimState, w: Worker, wage: number): void {
  const fair = PAY.fair * w.p.greed;
  if (wage >= fair) return;
  const value = -Math.min(PAY.lowMax, Math.round((fair - wage) * PAY.perGoldShort));
  if (value < 0) addMoodlet(s, w, 'lowpay', wage === 0 ? 'Working for nothing' : `Only ${wage} gold for that`, value, PAY.lowTicks);
}

/** Something the player should know about now. The UI shows it once, unless they've muted its kind. */
export function alert(s: SimState, kind: AlertKind, title: string, text: string, workerId: number | null = null): void {
  s.alerts.push({ id: s.nextId++, tick: s.tick, kind, title, text, workerId });
  if (s.alerts.length > 50) s.alerts.splice(0, s.alerts.length - 50);
}

/** The treasury couldn't pay a wage. Once, then quiet for ALERTS.wagesQuietTicks, so a run of failed payments is one alert. */
export function unpaidAlert(s: SimState, w: Worker, what: string): void {
  if (s.tick < s.wagesQuietUntil) return;
  s.wagesQuietUntil = s.tick + ALERTS.wagesQuietTicks;
  alert(s, 'wages', 'The treasury can’t pay wages', `There wasn't the gold to pay ${w.name} for ${what}. Workers who go unpaid soon grow fed up. Take down notices that pay from the treasury as they go, or finish a level of the tower for the patron's bonus.`, w.id);
}

export function log(s: SimState, text: string, workerId: number | null = null): void {
  s.events.push({ tick: s.tick, text, workerId });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
}

/** Drop whatever the worker is holding as a loose item where they stand. */
export function dropCarried(s: SimState, w: Worker): void {
  if (!w.carrying) return;
  for (let i = 0; i < w.carryCount; i++) s.items.push({ id: s.nextId++, type: w.carrying, x: w.x, y: w.y, reservedBy: null });
  w.carrying = null;
  w.carryCount = 0;
}

export function releaseReservations(s: SimState, w: Worker): void {
  // anyone stopping for something else lets go of their cart: it stays put, never stuck to someone
  letGo(w);
  for (const it of s.items) if (it.reservedBy === w.id) it.reservedBy = null;
  // a half-written design stays half-written for whoever picks it up next
  for (const d of s.designs) if (d.claimedBy === w.id) d.claimedBy = null;
}

import { findPath } from './path';
import { MOVE } from './tuning';
import { Tile, type Pt, type SimState, type Worker } from './types';
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
    if (w.carrying) cost += MOVE.carryingSlowdown;
    w.stepCost = cost;
    if (next.x !== w.x) w.facing = next.x > w.x ? 1 : -1;
  }
  w.stepProgress++;
  if (w.stepProgress >= w.stepCost) {
    w.x = next.x;
    w.y = next.y;
    w.path.shift();
    w.stepProgress = 0;
  }
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

export function log(s: SimState, text: string, workerId: number | null = null): void {
  s.events.push({ tick: s.tick, text, workerId });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
}

/** Drop whatever the worker is holding as a loose item where they stand. */
export function dropCarried(s: SimState, w: Worker): void {
  if (!w.carrying) return;
  s.items.push({ id: s.nextId++, type: w.carrying, x: w.x, y: w.y, reservedBy: null });
  w.carrying = null;
}

export function releaseReservations(s: SimState, w: Worker): void {
  for (const it of s.items) if (it.reservedBy === w.id) it.reservedBy = null;
}

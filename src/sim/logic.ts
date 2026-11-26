import { moveTo } from './actions';
import { knows, levelOfRow } from './drift';
import { parseCondition, placeName, type Condition, type Order, type StateWord } from './lang';
import { hourOf } from './time';
import { LOGIC } from './tuning';
import type { ItemType, SimState, Site, Worker } from './types';
import { nearest, spotFor, storesAt } from './world';

// Conditions: what a worker can find out. The rule that keeps this a game
// rather than a programming language: state lives in the world. There are
// no variables. A store's contents have to be seen, which can mean a walk;
// a worker always knows how they feel and can always see the sky.

export interface CondReading {
  /** What they take the condition to be. Null: they couldn't make it out, which counts as met. */
  cond: Condition | null;
  guesses: number;
}

/**
 * How a worker reads a condition's words. A NOT they can't read is simply
 * dropped, so they do the opposite. Any other word they can't read and they
 * can't tell what's being asked: it counts as met (do the IF line, stop the
 * UNTIL). Numbers and names are the same in every language.
 */
export function readCondition(w: Worker, toks: Order): CondReading {
  let guesses = 0;
  let words = toks;
  if (words[0]?.t === 'NOT' && !knows(w, words[0])) {
    words = words.slice(1);
    guesses++;
  }
  if (words.some((t) => !knows(w, t))) return { cond: null, guesses: guesses + 1 };
  return { cond: parseCondition(words), guesses };
}

/** Can this worker read a store from where they stand? */
function canSee(w: Worker, site: Site): boolean {
  if (levelOfRow(w.y) !== site.level || Math.abs(w.y - site.y) > 1) return false;
  const dx = w.x < site.x0 ? site.x0 - w.x : w.x > site.x1 ? w.x - site.x1 : 0;
  return dx <= LOGIC.lookRange;
}

export type CondResult = boolean | 'looking' | 'unreachable';

/**
 * Does the condition hold? Yes/no things answer at once. A store has to be
 * in sight: if it isn't, the worker walks over to look ('looking' while on
 * the way). A store that doesn't exist holds nothing.
 */
export function evalCondition(s: SimState, w: Worker, c: Condition): CondResult {
  if (c.kind === 'state') {
    const v = stateHolds(s, w, c.state);
    return c.not ? !v : v;
  }
  const type = c.noun.toLowerCase() as ItemType;
  const sites = storesAt(s, c.place, type);
  const near = nearest(sites, w);
  if (near && !canSee(w, near)) {
    w.thought = `Going to look at ${placeName(c.place)}.`;
    const m = moveTo(s, w, spotFor(near, w.id));
    if (m === 'unreachable') return 'unreachable';
    if (m === 'moving') return 'looking';
  }
  let n = 0;
  for (const x of sites) n += x.store[type];
  if (c.cmp === 'none') return n === 0;
  if (c.cmp === 'fewer') return n < c.n;
  return n >= c.n;
}

function stateHolds(s: SimState, w: Worker, state: StateWord): boolean {
  switch (state) {
    case 'HUNGRY':
      return w.hunger >= LOGIC.hungryAt;
    case 'TIRED':
      return w.fatigue >= LOGIC.tiredAt;
    case 'CARRYING':
      return w.carrying !== null;
    default: {
      // the quarter of the day that starts at this time
      const start = LOGIC.timeOfDay[state];
      const into = (hourOf(s.tick) - start + 24) % 24;
      return into < 6;
    }
  }
}

/**
 * The line a run of IFs governs: skip any further IFs (a run of IFs is an
 * AND) and land on the line they all guard. Returns its index.
 */
export function statementEnd(orders: readonly Order[], i: number): number {
  while (i < orders.length && orders[i][0].t === 'IF') i++;
  return i;
}

/**
 * What's wrong with how a scroll's IF and OTHERWISE lines are laid out, if
 * anything. An IF needs a line after it to guard; an OTHERWISE has to come
 * straight after the line an IF guarded, and needs a line of its own.
 */
export function branchError(verbs: readonly string[]): string | null {
  for (let i = 0; i < verbs.length; i++) {
    const v = verbs[i];
    if (v === 'IF') {
      const next = verbs[i + 1];
      if (next === undefined) return '"If" needs a line after it: the line it decides.';
      if (next === 'OTHERWISE') return '"If" needs a line of its own before "otherwise".';
    }
    if (v === 'OTHERWISE') {
      if (i < 2 || verbs[i - 2] !== 'IF' || verbs[i - 1] === 'IF' || verbs[i - 1] === 'OTHERWISE') return '"Otherwise" goes right after the line an "if" decides.';
      const next = verbs[i + 1];
      if (next === undefined || next === 'OTHERWISE') return '"Otherwise" needs a line after it.';
    }
  }
  return null;
}

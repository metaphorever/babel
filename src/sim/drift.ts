import { log } from './actions';
import {
  DRIFTABLE,
  LANGS,
  isPrep,
  langName,
  makeOrder,
  parseOrder,
  word,
  type LangId,
  type Noun,
  type Order,
  type Token,
  type TokenId,
  type Verb,
} from './lang';
import { pick, rand } from './rng';
import { CONFUSION, DRIFT, TOWER, WORLD } from './tuning';
import type { SimState, Worker } from './types';

// Language drift. The higher a worker spends their time, the more their
// words slip into another tongue, one word at a time. Names never drift.
// Drift itself doesn't upset anyone: a worker hungry for "pain" still knows
// what they want. What upsets them is an order they can't fully read.

export function allWords(): TokenId[] {
  return [...DRIFTABLE];
}

/** Which tower level a row is on (0 = the ground). Between floors counts as the lower one. */
export function levelOfRow(y: number): number {
  return Math.max(0, Math.floor((WORLD.groundRow - 1 - y) / TOWER.floorHeight));
}

export function knows(w: Worker, tok: Token): boolean {
  if (tok.t === 'WHO' || tok.t === 'NAMED') return true; // everyone recognizes a name
  return w.vocab[tok.lang]?.includes(tok.t) ?? false;
}

export function knowsWord(w: Worker, t: TokenId, lang: LangId): boolean {
  return w.vocab[lang]?.includes(t) ?? false;
}

/** Languages a worker can drift into, given how tall the tower is. */
export function driftPool(s: SimState): LangId[] {
  return LANGS.filter((l) => l.id !== 'en' && l.fromFloor <= s.floors).map((l) => l.id);
}

/** Per tick: build exposure high up, let it fade on the ground, drift a word when it fills. */
export function updateDrift(s: SimState, w: Worker): void {
  const level = levelOfRow(w.y);
  if (level >= DRIFT.lineFloor && driftPool(s).length > 0) {
    w.exposure += DRIFT.rate + (level - DRIFT.lineFloor) * DRIFT.ratePerFloor;
    if (w.exposure >= DRIFT.threshold) {
      w.exposure -= DRIFT.threshold;
      driftWord(s, w);
    }
  } else if (level === 0 && w.exposure > 0) {
    w.exposure = Math.max(0, w.exposure - DRIFT.decay);
  }
  if (w.confusion > 0) w.confusion = Math.max(0, w.confusion - CONFUSION.decay);
}

/**
 * One word slips: it's lost from the language they knew it in and turns up
 * in their drift tongue instead. The first time, the drift tongue is chosen
 * from the languages the tower's height has unlocked; it's random but then
 * fixed for that worker.
 */
export function driftWord(s: SimState, w: Worker): void {
  const pool = driftPool(s);
  if (pool.length === 0) return;
  if (!w.driftTongue) w.driftTongue = pick(s.rng, pool);
  const tongue = w.driftTongue;
  const candidates: { t: TokenId; lang: LangId }[] = [];
  for (const lang of Object.keys(w.vocab) as LangId[]) {
    if (lang === tongue) continue;
    for (const t of w.vocab[lang] ?? []) if (!knowsWord(w, t, tongue)) candidates.push({ t, lang });
  }
  if (candidates.length === 0) return;
  const c = candidates[Math.floor(rand(s.rng) * candidates.length)];
  w.vocab[c.lang] = (w.vocab[c.lang] ?? []).filter((t) => t !== c.t);
  w.vocab[tongue] = [...(w.vocab[tongue] ?? []), c.t];
  const before = word({ t: c.t, lang: c.lang });
  const after = word({ t: c.t, lang: tongue });
  if (after !== before) log(s, `${w.name} has started saying «${after}» instead of «${before}».`, w.id);
  if ((w.vocab[tongue] ?? []).length === 1) log(s, `${w.name}'s words are drifting into ${langName(tongue)}.`, w.id);
}

export interface Reading {
  /** What the worker takes the order to mean (null: couldn't read it at all). */
  order: Order | null;
  /** How many words they had to guess or skip. */
  guesses: number;
}

const HAULABLE: Noun[] = ['STONE', 'WOOD', 'GRAIN', 'BREAD', 'BEER'];

/**
 * How a worker reads an order. An unknown verb means they can't read it at
 * all. An unknown object gets a guess (a hauler hauls whatever; a miner can
 * only mine stone anyway). An unknown place, or the little word in front of
 * it, gets dropped, so they fall back on the usual place. Misreads are meant
 * to be funny and usually recoverable.
 */
export function readOrder(s: SimState, w: Worker, order: Order): Reading {
  if (!knows(w, order[0])) return { order: null, guesses: 0 };
  const parsed = parseOrder(order);
  let guesses = 0;
  let noun = parsed.noun;
  // object
  const nounTok = order.find((t, i) => i > 0 && t.t === noun);
  if (noun && nounTok && !knows(w, nounTok)) {
    guesses++;
    noun = parsed.verb === 'HAUL' ? pick(s.rng, HAULABLE) : noun;
  }
  // places: both the little word and the place have to be readable
  let from = parsed.from;
  let to = parsed.to;
  for (let i = 1; i < order.length - 1; i++) {
    const tok = order[i];
    if (!isPrep(tok.t)) continue;
    const readable = knows(w, tok) && knows(w, order[i + 1]);
    if (!readable) {
      guesses++;
      if (tok.t === 'FROM') from = null;
      else to = null;
    }
  }
  // what to build: a planned build they can't make out means building whatever's planned
  let target = parsed.target;
  if (target !== null && order[1] && !knows(w, order[1])) {
    guesses++;
    target = null;
    noun = 'CAMP';
  }
  const who = parsed.who !== null ? { id: parsed.who, name: order.find((t) => t.t === 'WHO')?.name ?? '?' } : null;
  return { order: makeOrder(parsed.verb as Verb, noun, { from, to, who, target }), guesses };
}

/** Reading something unreadable, or guessing at words, is confusing. */
export function addConfusion(w: Worker, r: Reading): void {
  const add = r.order === null ? CONFUSION.unreadable : r.guesses * CONFUSION.perGuess;
  w.confusion = Math.min(100, w.confusion + add);
}

/** The language a worker would use for a word: English if they still have it, else wherever it drifted. */
export function speakingLang(w: Worker, t: TokenId): LangId | null {
  if (knowsWord(w, t, 'en')) return 'en';
  for (const l of LANGS) if (knowsWord(w, t, l.id)) return l.id;
  return null;
}

/**
 * What a worker is saying, as words. Wants come first (body language shows
 * that they want something; the words say what), then their current job.
 */
export function sayingFor(w: Worker): TokenId[] {
  if (w.confusion > CONFUSION.moodAbove) return ['WHAT'];
  if (w.hunger >= 55) return ['WANT', 'BREAD'];
  if (w.thirst >= 55) return ['WANT', 'WATER'];
  if (w.fatigue >= 65) return ['WANT', 'SLEEP'];
  const c = w.held[0];
  const order = c && c.pc < c.orders.length ? c.orders[c.pc] : w.memory?.order;
  if (order) return order.filter((t) => t.t !== 'WHO' && t.t !== 'FLOOR' && t.t !== 'BASE' && !isPrep(t.t)).map((t) => t.t);
  return [];
}

/** How many words a worker knows in each language. */
export function vocabSummary(w: Worker): { lang: LangId; count: number }[] {
  return LANGS.map((l) => ({ lang: l.id, count: w.vocab[l.id]?.length ?? 0 })).filter((x) => x.count > 0);
}

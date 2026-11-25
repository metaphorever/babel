import { addMoodlet, log } from './actions';
import { rand, seedRng } from './rng';
import { SOCIAL, TIME } from './tuning';
import type { HabitId, PairLabel, SimState, SocialState, Tie, Worker } from './types';

// Relationships. Every worker feels something about every other worker:
// a number from 0 to 1, rolled when they're created and nudged by what
// happens. The feelings name themselves (likes, hates...), each pair gets a
// label read from both sides (friends, enemies, frenemies...), and on top
// of that sit ties: couples (lovers, spouses) and families (parents and
// children; siblings are read off shared parents).
//
// Families by birth are only rolled when a worker is created: at world
// generation, or when a newcomer arrives (who may turn out to be the grown
// child of a couple already here). Everything else is checked each dawn:
// pairs can become lovers or marry, couples who fall out split up after a
// day's grace, secret lovers get found out, and labels change.
//
// The social web has its own dice (s.social.rng), so rolling relationships
// never shifts the rest of the sim's rolls.

export function newSocial(seed: number): SocialState {
  return { rng: seedRng((seed ^ 0x50c1a15e) >>> 0), ties: [], labels: {}, estranged: [], nextDawn: TIME.dayTicks, takers: [], today: {} };
}

export function rollMonogamy(s: SimState): number {
  return rand(s.social.rng) ** SOCIAL.monogamySkew;
}

export const HABITS: HabitId[] = ['whistles', 'sings', 'stories', 'snores'];
export const HABIT_LABEL: Record<HabitId, string> = {
  whistles: 'Whistles at work',
  sings: 'Sings over a drink',
  stories: 'Tells stories over a drink',
  snores: 'Snores',
};

/** A worker's habits (none to two), and their taste for each habit in others. */
export function rollHabits(s: SimState): { habits: HabitId[]; tastes: Record<HabitId, number> } {
  const r = s.social.rng;
  const [none, one] = SOCIAL.habits.count;
  const roll = rand(r);
  const n = roll < none ? 0 : roll < none + one ? 1 : 2;
  const habits: HabitId[] = [];
  while (habits.length < n) {
    const h = HABITS[Math.floor(rand(r) * HABITS.length)];
    if (!habits.includes(h)) habits.push(h);
  }
  const tastes = {} as Record<HabitId, number>;
  for (const h of HABITS) tastes[h] = Math.max(-1, Math.min(1, SOCIAL.habits.lean[h] + (rand(r) * 2 - 1) * SOCIAL.habits.spread));
  return { habits, tastes };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** How a feels about b (0..1). Someone they've never rolled a feeling for is neutral. */
export function feelOf(a: Worker, b: Worker): number {
  return a.feel[b.id] ?? 0.4;
}

/**
 * For tuning tools (npm run sim:month): told about every change to a
 * feeling and what caused it, and about shared time the daily cap held
 * back. Never set in the game, and it changes nothing in the sim.
 */
export const feelingWatch: {
  moved: ((from: number, to: number, why: string, by: number) => void) | null;
  capped: ((why: string, amount: number) => void) | null;
} = { moved: null, capped: null };

/** Nudge how a feels about b; why is what caused it (for the tuning tools). */
export function nudge(a: Worker, b: Worker, by: number, why = 'other'): void {
  const before = feelOf(a, b);
  a.feel[b.id] = clamp01(before + by);
  if (feelingWatch.moved && a.feel[b.id] !== before) feelingWatch.moved(a.id, b.id, why, a.feel[b.id] - before);
}

/** Move how a first felt about b too: for things that change a relationship for good. */
function nudgeBase(a: Worker, b: Worker, by: number): void {
  a.feelBase[b.id] = clamp01((a.feelBase[b.id] ?? feelOf(a, b)) + by);
}

/** Shared time (drinks, meals, songs, snoring, help): capped per pair per day, either way. */
function timeNudge(s: SimState, a: Worker, b: Worker, by: number, why: string): void {
  const key = `${a.id}>${b.id}`;
  const used = s.social.today[key] ?? 0;
  const room = Math.max(0, SOCIAL.event.dailyCap - used);
  if (by === 0) return;
  const amount = Math.min(Math.abs(by), room);
  if (feelingWatch.capped && amount < Math.abs(by)) feelingWatch.capped(why, Math.abs(by) - amount);
  if (amount === 0) return;
  nudge(a, b, Math.sign(by) * amount, why);
  s.social.today[key] = used + amount;
}

/** The word for a feeling, or '' in the neutral gap. */
export function feelWord(v: number): '' | 'hates' | 'dislikes' | 'likes' | 'is fond of' | 'adores' {
  if (v < SOCIAL.hates) return 'hates';
  if (v < SOCIAL.dislikes) return 'dislikes';
  if (v >= SOCIAL.adores) return 'adores';
  if (v >= SOCIAL.fond) return 'is fond of';
  if (v >= SOCIAL.likes) return 'likes';
  return '';
}

/**
 * A pair's label, read from both sides. Every label but frenemies goes by
 * the weaker side: friends need both to like, enemies both to hate.
 * Frenemies are the mixed pair: one likes, the other dislikes.
 */
export function pairLabel(x: number, y: number): PairLabel {
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  if (hi < SOCIAL.hates) return 'enemies';
  if (lo >= SOCIAL.adores) return 'best friends';
  if (lo >= SOCIAL.fond) return 'good friends';
  if (lo >= SOCIAL.likes) return 'friends';
  if (hi >= SOCIAL.likes && lo < SOCIAL.dislikes) return 'frenemies';
  return '';
}

function labelOf(a: Worker, b: Worker): PairLabel {
  return pairLabel(feelOf(a, b), feelOf(b, a));
}

/** Roll how two workers feel about each other: partly shared, partly their own. */
function rollFeel(s: SimState, a: Worker, b: Worker): void {
  const r = s.social.rng;
  // roughly a standard bell curve: three dice, centered and scaled
  const bell = () => (rand(r) + rand(r) + rand(r) - 1.5) * 2;
  const shared = bell();
  const pull = (w: Worker) => w.traits.reduce((n, t) => n + (SOCIAL.traitPull[t] ?? 0), 0);
  const roll = (to: Worker) => clamp01(SOCIAL.feelMean + SOCIAL.feelSpread * (SOCIAL.shared * shared + (1 - SOCIAL.shared) * bell()) + pull(to));
  a.feel[b.id] = a.feelBase[b.id] = roll(b);
  b.feel[a.id] = b.feelBase[a.id] = roll(a);
}

// ------------------------------------------------------------- the web

const isCouple = (t: Tie) => t.kind === 'spouse' || t.kind === 'lover';

function tieBetween(s: SimState, kind: Tie['kind'], a: number, b: number): Tie | undefined {
  return s.social.ties.find((t) => t.kind === kind && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
}

/** Everyone this worker is a spouse or lover of. */
export function partnersOf(s: SimState, id: number): number[] {
  const out: number[] = [];
  for (const t of s.social.ties) {
    if (!isCouple(t)) continue;
    const other = t.a === id ? t.b : t.b === id ? t.a : null;
    if (other !== null && !out.includes(other)) out.push(other);
  }
  return out;
}

export function parentsOf(s: SimState, id: number, bioOnly = false): number[] {
  return s.social.ties.filter((t) => t.kind === 'parent' && t.b === id && (!bioOnly || t.bio)).map((t) => t.a);
}

export function childrenOf(s: SimState, id: number): number[] {
  return s.social.ties.filter((t) => t.kind === 'parent' && t.a === id).map((t) => t.b);
}

/** Parents and grandparents. */
function elders(s: SimState, id: number): number[] {
  const p = parentsOf(s, id);
  return [...p, ...p.flatMap((x) => parentsOf(s, x))];
}

/** Every ancestor, however far back (to stop a worker becoming their own ancestor). */
function ancestors(s: SimState, id: number, seen = new Set<number>()): Set<number> {
  for (const p of parentsOf(s, id)) {
    if (seen.has(p)) continue;
    seen.add(p);
    ancestors(s, p, seen);
  }
  return seen;
}

/**
 * Family, for the incest guard: parents and children, grandparents and
 * grandchildren, siblings, cousins, aunts, uncles, nieces and nephews,
 * by birth or by marriage alike. Two people are family if they share
 * someone within two generations up (counting themselves).
 */
export function related(s: SimState, a: number, b: number): boolean {
  if (a === b) return true;
  const up = new Set([a, ...elders(s, a)]);
  return [b, ...elders(s, b)].some((x) => up.has(x));
}

/** Would any couple end up family if these parent ties went in? */
function wouldBeIncest(s: SimState, add: Tie[]): boolean {
  s.social.ties.push(...add);
  const bad = s.social.ties.some((t) => isCouple(t) && related(s, t.a, t.b));
  s.social.ties.splice(s.social.ties.length - add.length, add.length);
  return bad;
}

/** Can these workers become c's parents (by birth or marriage)? */
function canAdopt(s: SimState, c: number, parents: number[], bio: boolean): boolean {
  if (parents.includes(c)) return false;
  if (bio && parentsOf(s, c, true).length + parents.length > 2) return false;
  if (parents.some((p) => parentsOf(s, c).includes(p))) return false;
  const anc = ancestors(s, c);
  if (parents.some((p) => anc.has(p))) return false;
  // nobody becomes their own ancestor
  if (parents.some((p) => ancestors(s, p).has(c))) return false;
  return !wouldBeIncest(s, parents.map((p) => ({ kind: 'parent', a: p, b: c, bio })));
}

/** Add parent ties; a parent's spouses become parents too, by marriage. */
function addParents(s: SimState, c: number, parents: number[], bio: boolean): void {
  for (const p of parents) s.social.ties.push({ kind: 'parent', a: p, b: c, bio });
  for (const p of parents) for (const sp of spousesOf(s, p)) if (canAdopt(s, c, [sp], false)) s.social.ties.push({ kind: 'parent', a: sp, b: c, bio: false });
}

function spousesOf(s: SimState, id: number): number[] {
  return s.social.ties.filter((t) => t.kind === 'spouse' && (t.a === id || t.b === id)).map((t) => (t.a === id ? t.b : t.a));
}

/** Every partner either of them already has would be fine with it. */
function aboveBoard(s: SimState, a: Worker, b: Worker): boolean {
  const others = [...partnersOf(s, a.id), ...partnersOf(s, b.id)].filter((id) => id !== a.id && id !== b.id);
  return others.every((id) => {
    const p = byId(s, id);
    return !p || p.monogamy < SOCIAL.openBelow;
  });
}

function byId(s: SimState, id: number): Worker | undefined {
  return s.workers.find((w) => w.id === id);
}

/** How likely a romance is between two people: warmer is likelier, more partners and monogamy make it rarer. */
function romanceOdds(s: SimState, a: Worker, b: Worker, base: number): number {
  const lo = Math.min(feelOf(a, b), feelOf(b, a));
  if (lo < SOCIAL.likes) return 0;
  const x = (lo - SOCIAL.likes) / (1 - SOCIAL.likes);
  const reluctance = (w: Worker) => {
    const n = partnersOf(s, w.id).filter((id) => id !== a.id && id !== b.id).length;
    return n === 0 ? 1 : SOCIAL.gen.morePartners ** n * Math.max(SOCIAL.gen.monogamousFloor, 1 - w.monogamy);
  };
  return base * (1 + 3 * x) * reluctance(a) * reluctance(b);
}

function becomeLovers(s: SimState, a: Worker, b: Worker, quiet: boolean): void {
  const secret = !aboveBoard(s, a, b);
  s.social.ties.push({ kind: 'lover', a: a.id, b: b.id, secret, strained: null });
  for (const [x, y] of [[a, b], [b, a]] as const) {
    nudge(x, y, SOCIAL.gen.loverWarmth, 'became lovers');
    nudgeBase(x, y, SOCIAL.gen.loverWarmth);
  }
  if (!quiet) log(s, secret ? `${a.name} and ${b.name} are secretly seeing each other.` : `${a.name} and ${b.name} have become lovers.`, a.id);
}

/** Marry, if nobody already in the picture would object. A spouse's children become theirs too. */
function marry(s: SimState, a: Worker, b: Worker, quiet: boolean): boolean {
  if (!aboveBoard(s, a, b)) return false;
  s.social.ties.push({ kind: 'spouse', a: a.id, b: b.id, strained: null });
  for (const [x, y] of [[a, b], [b, a]] as const) {
    for (const c of childrenOf(s, x.id)) if (canAdopt(s, c, [y.id], false)) s.social.ties.push({ kind: 'parent', a: y.id, b: c, bio: false });
  }
  if (!quiet) log(s, `${a.name} and ${b.name} have married.`, a.id);
  return true;
}

function shuffled<T>(s: SimState, arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s.social.rng) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pairs(ws: Worker[]): [Worker, Worker][] {
  const out: [Worker, Worker][] = [];
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) out.push([ws[i], ws[j]]);
  return out;
}

/** One round of romance: lovers may marry, warm pairs may become lovers (or, rarely, marry without). */
function romanceRound(s: SimState, ws: Worker[], odds: { lover: number; marryLovers: number; marryFriends: number }, quiet: boolean): void {
  const r = s.social.rng;
  for (const [a, b] of shuffled(s, pairs(ws))) {
    if (related(s, a.id, b.id)) continue;
    const lovers = tieBetween(s, 'lover', a.id, b.id);
    const married = tieBetween(s, 'spouse', a.id, b.id);
    if (married) continue;
    if (lovers) {
      if (!lovers.secret && rand(r) < romanceOdds(s, a, b, odds.marryLovers)) marry(s, a, b, quiet);
      continue;
    }
    if (rand(r) < romanceOdds(s, a, b, odds.lover)) becomeLovers(s, a, b, quiet);
    else if (rand(r) < romanceOdds(s, a, b, odds.marryFriends)) marry(s, a, b, quiet);
  }
}

/** Pick someone who can be the grown child of these parents, if anyone can. */
function findChild(s: SimState, candidates: Worker[], parents: number[]): Worker | null {
  for (const c of shuffled(s, candidates)) if (canAdopt(s, c.id, parents, true)) return c;
  return null;
}

/** Set every pair's label (and estrangements) without logging: for relationships rolled at creation. */
function settleLabels(s: SimState, ws: Worker[]): void {
  for (const [a, b] of pairs(ws)) s.social.labels[pairKey(a.id, b.id)] = labelOf(a, b);
  s.social.estranged = estrangedNow(s, ws);
}

/** The relationships the colony starts with. Nothing here is logged. */
export function generateSocial(s: SimState): void {
  const ws = s.workers;
  const r = s.social.rng;
  for (const [a, b] of pairs(ws)) rollFeel(s, a, b);
  for (let i = 0; i < SOCIAL.gen.rounds; i++) romanceRound(s, ws, SOCIAL.gen, true);
  // grown children of couples, then of one parent alone
  for (const t of s.social.ties.filter((x) => x.kind === 'lover')) {
    for (const chance of [SOCIAL.gen.childOfCouple, SOCIAL.gen.childOfCouple / 2]) {
      if (rand(r) >= chance) break;
      const c = findChild(s, ws, [t.a, t.b]);
      if (c) addParents(s, c.id, [t.a, t.b], true);
    }
  }
  for (const c of ws) {
    if (parentsOf(s, c.id, true).length > 0 || rand(r) >= SOCIAL.gen.childOfOne) continue;
    for (const p of shuffled(s, ws)) {
      if (canAdopt(s, c.id, [p.id], true)) {
        addParents(s, c.id, [p.id], true);
        break;
      }
    }
  }
  settleLabels(s, ws);
}

/** A newcomer: how they and everyone here feel about each other, and maybe whose grown child they are. */
export function socialArrival(s: SimState, w: Worker): void {
  const here = s.workers.filter((o) => o !== w && !o.leaving);
  const r = s.social.rng;
  for (const o of here) rollFeel(s, o, w);
  const couples = shuffled(
    s,
    s.social.ties.filter((t) => t.kind === 'lover' && here.some((o) => o.id === t.a) && here.some((o) => o.id === t.b)),
  );
  let placed = false;
  for (const t of couples) {
    if (rand(r) >= SOCIAL.arrival.childOfCouple) continue;
    if (canAdopt(s, w.id, [t.a, t.b], true)) {
      addParents(s, w.id, [t.a, t.b], true);
      placed = true;
      break;
    }
  }
  if (!placed && rand(r) < SOCIAL.arrival.childOfOne) {
    for (const p of shuffled(s, here)) {
      if (canAdopt(s, w.id, [p.id], true)) {
        addParents(s, w.id, [p.id], true);
        break;
      }
    }
  }
  for (const o of here) s.social.labels[pairKey(o.id, w.id)] = labelOf(o, w);
  const parents = parentsOf(s, w.id).map((id) => byId(s, id)?.name).filter(Boolean);
  if (parents.length) log(s, `${w.name} is ${parents.join(' and ')}'s grown child, come to join them.`, w.id);
}

// ------------------------------------------------------------- what happens

/** Keep a moment in mind. The same moment again just freshens it. */
function remember(s: SimState, w: Worker, about: Worker, tone: 1 | -1, what: string, heardFrom?: number, target?: number): void {
  const same = w.lately.findIndex((m) => m.about === about.id && m.what === what && m.heardFrom === heardFrom);
  if (same >= 0) w.lately.splice(same, 1);
  w.lately.unshift({ about: about.id, tone, what, tick: s.tick, ...(heardFrom !== undefined ? { heardFrom } : {}), ...(target !== undefined ? { target } : {}) });
  // over the limit, forget the oldest everyday moment first: a rumor about someone is the last to go
  while (w.lately.length > SOCIAL.remember) {
    const drop = w.lately.map((m) => m.target === undefined).lastIndexOf(true);
    w.lately.splice(drop >= 0 ? drop : w.lately.length - 1, 1);
  }
}

/** Workers beside this one (same row, a few tiles away), optionally only those doing something. */
function beside(s: SimState, w: Worker, kind?: string): Worker[] {
  return s.workers.filter(
    (o) => o !== w && !o.leaving && o.y === w.y && Math.abs(o.x - w.x) <= SOCIAL.event.near && (kind === undefined || (o.activity.kind === kind && o.activity.stage === 1)),
  );
}

const HABIT_WHAT: Record<HabitId, (name: string) => string> = {
  whistles: (n) => `${n}'s whistling at work`,
  sings: (n) => `${n}'s singing at the bar`,
  stories: (n) => `${n}'s stories at the bar`,
  snores: (n) => `${n} snoring all night`,
};

/** w gets a dose of o's habit: their taste decides which way it moves them. */
function habitDose(s: SimState, w: Worker, o: Worker, h: HabitId): void {
  const taste = w.tastes[h] ?? 0;
  timeNudge(s, w, o, taste * SOCIAL.habits.dose * (SOCIAL.habits.weight[h] ?? 1), `habit: ${h}`);
  if (Math.abs(taste) >= SOCIAL.habits.strong) remember(s, w, o, taste > 0 ? 1 : -1, HABIT_WHAT[h](o.name));
}

/**
 * Finishing a meal or a drink: you warm a little to everyone doing the
 * same beside you, hear their songs and stories, size up their purses,
 * enjoy (or put up with) the company, maybe come to blows with an enemy,
 * and maybe tell someone the latest.
 */
export function together(s: SimState, w: Worker, kind: 'eat' | 'bar', by: number): void {
  const company = beside(s, w, kind);
  if (company.length === 0) return;
  let friend: Worker | null = null;
  let enemy: Worker | null = null;
  for (const o of company) {
    timeNudge(s, w, o, by, kind === 'bar' ? 'drinking together' : 'eating together');
    if (kind === 'bar') for (const h of o.habits) if (h === 'sings' || h === 'stories') habitDose(s, w, o, h);
    purses(s, w, o);
    const label = labelOf(w, o);
    if (label === 'friends' || label === 'good friends' || label === 'best friends') friend ??= o;
    if (label === 'enemies' || feelOf(w, o) < SOCIAL.hates) enemy ??= o;
  }
  const c = SOCIAL.company;
  if (friend) addMoodlet(s, w, 'company', `Good company: ${friend.name}`, c.friend, c.ticks);
  else if (enemy) addMoodlet(s, w, 'company', `Had to put up with ${enemy.name}`, c.enemy, c.ticks);
  if (kind === 'bar' && enemy && canScuffle(s, w, enemy) && rand(s.social.rng) < SOCIAL.scuffle.chance) scuffle(s, w, enemy, company);
  if (rand(s.social.rng) < SOCIAL.gossip.chance) gossip(s, w, company[Math.floor(rand(s.social.rng) * company.length)]);
}

/** Greedy workers resent a much fuller purse; frugal ones admire it. */
function purses(s: SimState, w: Worker, o: Worker): void {
  if (o.purse < w.purse + SOCIAL.wealth.gap) return;
  if (w.traits.includes('greedy')) {
    nudge(w, o, -SOCIAL.wealth.jealous, 'jealousy');
    remember(s, w, o, -1, `${o.name}'s fat purse`);
  } else if (w.traits.includes('frugal')) {
    nudge(w, o, SOCIAL.wealth.admire, 'admiration');
    remember(s, w, o, 1, `how much ${o.name} has saved`);
  }
}

/** Enemies, or one who hates the other: bad blood both ways. Once a day at most. */
function canScuffle(s: SimState, a: Worker, b: Worker): boolean {
  if (s.social.today[`fight:${pairKey(a.id, b.id)}`]) return false;
  return Math.max(feelOf(a, b), feelOf(b, a)) < SOCIAL.scuffle.bothBelow && Math.min(feelOf(a, b), feelOf(b, a)) < SOCIAL.scuffle.oneBelow;
}

/** A scuffle at the bar. A friend of either nearby may break it up. */
function scuffle(s: SimState, a: Worker, b: Worker, around: Worker[]): void {
  const k = SOCIAL.scuffle;
  s.social.today[`fight:${pairKey(a.id, b.id)}`] = 1;
  for (const [x, y] of [[a, b], [b, a]] as const) {
    nudge(x, y, -k.sour, 'scuffle');
    addMoodlet(s, x, 'scuffle', `Came to blows with ${y.name}`, k.mood, k.moodTicks);
    remember(s, x, y, -1, `the scuffle with ${y.name}`);
  }
  const peacemaker = around.find((p) => p !== b && (feelOf(p, a) >= SOCIAL.likes || feelOf(p, b) >= SOCIAL.likes));
  if (!peacemaker) {
    log(s, `${a.name} and ${b.name} came to blows at the bar.`, a.id);
    return;
  }
  // the one they stood with is grateful
  const helped = feelOf(peacemaker, a) >= feelOf(peacemaker, b) ? a : b;
  nudge(helped, peacemaker, k.thanks, 'peacemaker');
  remember(s, helped, peacemaker, 1, `${peacemaker.name} breaking up the scuffle`);
  log(s, `${a.name} and ${b.name} came to blows at the bar; ${peacemaker.name} broke it up.`, a.id);
}

/**
 * Gossip: the speaker tells the listener their latest moment (not one about
 * the listener, and not one they only heard). A complaint makes the listener
 * take a side, by whom they like better: siding with the subject sours them
 * on the speaker; siding with the speaker sours them on the subject and
 * warms them to the speaker. Praise warms the listener to its subject,
 * unless they can't stand that person, in which case it's the speaker they
 * think less of.
 *
 * The last straw: a listener who sided against the teller remembers the
 * badmouthing. If they later get to tell the one who was badmouthed (it's
 * the story they'd pick, sitting beside them), that worker turns hard on
 * the badmouther, for good in part. A small slight between friends can end
 * the friendship, if the rumor finds its way back.
 */
export function gossip(s: SimState, speaker: Worker, listener: Worker): void {
  const g = SOCIAL.gossip;
  const age = (x: { tick: number }) => s.tick - x.tick;
  const rumor = speaker.lately.find((x) => x.target === listener.id && age(x) <= g.rumorDays * TIME.dayTicks);
  const fresh = speaker.lately.filter((x) => x.about !== listener.id && x.heardFrom === undefined && age(x) <= g.maxAge);
  const m = rumor ?? fresh[0];
  if (!m) return;
  const subject = s.workers.find((o) => o.id === m.about && !o.leaving);
  if (!subject) return;
  if (m.target === listener.id) {
    lastStraw(s, speaker, listener, subject);
    speaker.lately = speaker.lately.filter((x) => x !== m); // told: nothing more to pass on
    return;
  }
  if (m.tone < 0) {
    speaker.thought = `Complaining to ${listener.name} about ${m.what}.`;
    if (feelOf(listener, subject) > feelOf(listener, speaker)) {
      nudge(listener, speaker, -g.side, 'gossip: sided against teller');
      remember(s, listener, speaker, -1, `${speaker.name} badmouthing ${subject.name}`, undefined, subject.id);
    } else {
      nudge(listener, subject, -g.pile, 'gossip: soured on subject');
      nudge(listener, speaker, g.bond, 'gossip: bonded with teller');
      remember(s, listener, subject, -1, m.what, speaker.id);
    }
  } else {
    speaker.thought = `Telling ${listener.name} about ${m.what}.`;
    if (feelOf(listener, subject) < SOCIAL.dislikes) nudge(listener, speaker, -g.side / 2, 'gossip: sided against teller');
    else {
      nudge(listener, subject, g.pile / 2, 'gossip: warmed to subject');
      remember(s, listener, subject, 1, m.what, speaker.id);
    }
  }
}

/** "Did you know what they've been saying about you?" */
function lastStraw(s: SimState, teller: Worker, victim: Worker, badmouther: Worker): void {
  const g = SOCIAL.gossip;
  const wereFriends = labelOf(victim, badmouther);
  nudge(victim, badmouther, -g.lastStraw, 'gossip: the last straw');
  nudgeBase(victim, badmouther, -g.lastStrawBase);
  nudge(victim, teller, g.toldMe, 'gossip: thanks for telling me');
  remember(s, victim, badmouther, -1, `${badmouther.name} badmouthing them behind their back`, teller.id);
  teller.thought = `Telling ${victim.name} what ${badmouther.name} said about them.`;
  const friends = wereFriends === 'friends' || wereFriends === 'good friends' || wereFriends === 'best friends';
  log(s, `${victim.name} heard from ${teller.name} that ${badmouther.name} has been badmouthing them${friends ? ', and they were friends' : ''}.`, victim.id);
}

/** A worker woke up: the snorers who slept beside them made an impression. */
export function wokeBeside(s: SimState, w: Worker): void {
  for (const o of beside(s, w, 'sleep')) if (o.habits.includes('snores')) habitDose(s, w, o, 'snores');
}

/** A worker finished some work: anyone beside them heard the whistling, and they may pass on the latest. */
export function workedBeside(s: SimState, w: Worker): void {
  const near = beside(s, w);
  if (w.habits.includes('whistles')) for (const o of near) habitDose(s, o, w, 'whistles');
  if (near.length && SOCIAL.gossip.atWork > 0 && rand(s.social.rng) < SOCIAL.gossip.atWork) gossip(s, w, near[Math.floor(rand(s.social.rng) * near.length)]);
}

/** A worker finished their share of a notice: whoever's on the same notice helped (or, if lazy, didn't). */
export function sharedJob(s: SimState, w: Worker, noticeId: number): void {
  for (const o of s.workers) {
    if (o === w || o.leaving || o.memory?.noticeId !== noticeId || o.activity.kind !== 'job') continue;
    if (w.traits.includes('industrious') && o.traits.includes('lazy')) {
      timeNudge(s, w, o, SOCIAL.job.lazyHelp, 'slacker');
      if (rand(s.social.rng) < SOCIAL.job.remember * 2) remember(s, w, o, -1, `${o.name} slacking on the job`);
    } else {
      timeNudge(s, w, o, SOCIAL.job.help, 'help with work');
      if (rand(s.social.rng) < SOCIAL.job.remember) remember(s, w, o, 1, `${o.name}'s help with the work`);
    }
  }
}

/** Someone finished the last of a notice: remember who, for whoever turns up too late. */
export function tookNotice(s: SimState, w: Worker, noticeId: number): void {
  s.social.takers.push({ notice: noticeId, by: w.id });
  if (s.social.takers.length > 30) s.social.takers.shift();
}

/** A worker finished a job that someone else had already emptied. */
export function beatenTo(s: SimState, w: Worker, noticeId: number): void {
  const t = s.social.takers.find((x) => x.notice === noticeId);
  const by = t && s.workers.find((o) => o.id === t.by && o !== w);
  if (!by) return;
  nudge(w, by, -SOCIAL.job.beatMe, 'beaten to a job');
  remember(s, w, by, -1, `${by.name} beating them to a job`);
}

/** A word taught: teacher and student warm to each other. */
export function lessonWord(s: SimState, teacher: Worker, student: Worker): void {
  nudge(teacher, student, SOCIAL.lessonWord, 'lessons');
  nudge(student, teacher, SOCIAL.lessonWord, 'lessons');
  remember(s, student, teacher, 1, `the lessons with ${teacher.name}`);
}

/**
 * A worker is leaving for good. Those close to them are sad, those who
 * hated them glad, and a spouse may go with them. Returns who's following.
 */
export function farewell(s: SimState, w: Worker): Worker[] {
  const k = SOCIAL.leaving;
  const spouses = spousesOf(s, w.id);
  const following: Worker[] = [];
  for (const o of s.workers) {
    if (o === w || o.leaving) continue;
    if (spouses.includes(o.id) && rand(s.social.rng) < k.follow * feelOf(o, w) * 2) {
      following.push(o);
      log(s, `${o.name} won't stay without ${w.name}: they're leaving together.`, o.id);
      continue;
    }
    const f = feelOf(o, w);
    if (f >= SOCIAL.fond || spouses.includes(o.id)) addMoodlet(s, o, 'farewell', `${w.name} left`, k.missed, k.ticks);
    else if (f < SOCIAL.hates) addMoodlet(s, o, 'farewell', `Glad ${w.name} is gone`, k.glad, k.ticks);
  }
  return following;
}

// ------------------------------------------------------------- each dawn

export function updateSocial(s: SimState): void {
  if (s.tick < s.social.nextDawn) return;
  s.social.nextDawn += TIME.dayTicks;
  dawn(s);
}

function estrangedNow(s: SimState, ws: Worker[]): string[] {
  const out: string[] = [];
  for (const t of s.social.ties) {
    if (t.kind !== 'parent') continue;
    const p = ws.find((w) => w.id === t.a);
    const c = ws.find((w) => w.id === t.b);
    if (p && c && Math.min(feelOf(p, c), feelOf(c, p)) < SOCIAL.hates) out.push(`${t.a}:${t.b}`);
  }
  return out;
}

const LABEL_RANK: Record<PairLabel, number> = { enemies: -2, frenemies: -1, '': 0, friends: 1, 'good friends': 2, 'best friends': 3 };

function labelNews(a: string, b: string, was: PairLabel, now: PairLabel): string {
  if (now === 'best friends') return `${a} and ${b} have become best friends.`;
  if (now === 'good friends') return was === 'best friends' ? `${a} and ${b} aren't as close as they were.` : `${a} and ${b} are good friends now.`;
  if (now === 'friends') return LABEL_RANK[was] > 1 ? `${a} and ${b} aren't as close as they were.` : `${a} and ${b} have become friends.`;
  if (now === 'enemies') return `${a} and ${b} are enemies now.`;
  if (now === 'frenemies') return `${a} and ${b} are an odd pair now: one likes the other, who can't stand them.`;
  if (was === 'enemies') return `${a} and ${b} have buried the hatchet.`;
  if (was === 'frenemies') return `${a} and ${b} have settled into indifference.`;
  return `${a} and ${b} have drifted apart.`;
}

function dawn(s: SimState): void {
  const ws = s.workers.filter((w) => !w.leaving);
  const r = s.social.rng;
  const here = (id: number) => ws.find((w) => w.id === id);

  // a new day: shared time counts afresh, and feelings drift back toward how they started
  s.social.today = {};
  for (const a of ws) {
    for (const b of ws) {
      if (a === b) continue;
      const base = a.feelBase[b.id];
      if (base !== undefined) nudge(a, b, (base - feelOf(a, b)) * SOCIAL.drift, 'drift back');
    }
  }

  // couples who've fallen out: a day's grace, then it's over
  for (const t of [...s.social.ties]) {
    if (!isCouple(t)) continue;
    const a = here(t.a);
    const b = here(t.b);
    if (!a || !b) continue;
    if (Math.min(feelOf(a, b), feelOf(b, a)) >= SOCIAL.hates) {
      t.strained = null;
      continue;
    }
    if (t.strained === null || t.strained === undefined) {
      t.strained = s.tick;
      log(s, `Things are bad between ${a.name} and ${b.name}.`, a.id);
      continue;
    }
    s.social.ties = s.social.ties.filter((x) => x !== t);
    log(s, t.kind === 'spouse' ? `${a.name} and ${b.name} have divorced.` : `${a.name} and ${b.name} have split up.`, a.id);
  }

  // secrets come out
  for (const t of s.social.ties) {
    if (t.kind !== 'lover' || !t.secret) continue;
    const a = here(t.a);
    const b = here(t.b);
    if (!a || !b) continue;
    for (const [cheat, other] of [[a, b], [b, a]] as const) {
      const wronged = partnersOf(s, cheat.id)
        .filter((id) => id !== other.id)
        .map(here)
        .find((p) => p && p.monogamy >= SOCIAL.openBelow && rand(r) < SOCIAL.dawn.discover);
      if (!wronged) continue;
      nudge(wronged, cheat, -SOCIAL.dawn.betrayed, 'betrayal');
      nudge(wronged, other, -SOCIAL.dawn.rival, 'betrayal');
      // some of it never quite heals
      nudgeBase(wronged, cheat, -SOCIAL.dawn.betrayed / 2);
      nudgeBase(wronged, other, -SOCIAL.dawn.rival / 2);
      t.secret = false;
      log(s, `${wronged.name} found out that ${cheat.name} has been seeing ${other.name}.`, wronged.id);
      break;
    }
  }

  // new romances
  romanceRound(s, ws, SOCIAL.dawn, false);

  // labels: log what changed
  for (const [a, b] of pairs(ws)) {
    const key = pairKey(a.id, b.id);
    const was = s.social.labels[key] ?? '';
    const now = labelOf(a, b);
    if (now === was) continue;
    s.social.labels[key] = now;
    log(s, labelNews(a.name, b.name, was, now), a.id);
  }

  // estrangement between parents and children
  const now = estrangedNow(s, ws);
  for (const k of now) {
    if (s.social.estranged.includes(k)) continue;
    const [p, c] = k.split(':').map((x) => here(Number(x))!);
    log(s, `${c.name} and their parent ${p.name} are estranged.`, c.id);
  }
  for (const k of s.social.estranged) {
    if (now.includes(k)) continue;
    const [p, c] = k.split(':').map((x) => here(Number(x)));
    if (p && c) log(s, `${c.name} and their parent ${p.name} have made up.`, c.id);
  }
  s.social.estranged = now;
}

// ------------------------------------------------------------- for the worker window

export interface RelationLine {
  text: string;
  /** The other worker, for linking to them. */
  otherId: number;
}

/** A worker's relationships as their bio lists them: family and couples first, then friends and foes, then feelings. */
export function relationsOf(s: SimState, w: Worker): RelationLine[] {
  const out: RelationLine[] = [];
  const named = new Set<number>();
  const add = (text: string, id: number) => {
    out.push({ text, otherId: id });
    named.add(id);
  };
  const present = (id: number) => s.workers.find((o) => o.id === id && !o.leaving);
  const estranged = (p: number, c: number) => (s.social.estranged.includes(`${p}:${c}`) ? ' (estranged)' : '');
  for (const id of spousesOf(s, w.id)) if (present(id)) add(`Married to ${present(id)!.name}`, id);
  for (const t of s.social.ties) {
    if (t.kind !== 'lover' || (t.a !== w.id && t.b !== w.id)) continue;
    const id = t.a === w.id ? t.b : t.a;
    if (present(id) && !tieBetween(s, 'spouse', w.id, id)) add(`${t.secret ? 'Secretly seeing' : 'Lovers with'} ${present(id)!.name}`, id);
  }
  for (const id of parentsOf(s, w.id)) if (present(id)) add(`Child of ${present(id)!.name}${estranged(id, w.id)}`, id);
  for (const id of childrenOf(s, w.id)) if (present(id)) add(`Parent of ${present(id)!.name}${estranged(w.id, id)}`, id);
  const sibs = new Set<number>();
  for (const p of parentsOf(s, w.id)) for (const c of childrenOf(s, p)) if (c !== w.id) sibs.add(c);
  for (const id of sibs) if (present(id)) add(`Sibling of ${present(id)!.name}`, id);
  // friends and foes, closest first; then one-sided feelings, warmest first
  const others = s.workers.filter((o) => o !== w && !o.leaving);
  const labelled = others.filter((o) => labelOf(w, o) !== '');
  const order: PairLabel[] = ['best friends', 'good friends', 'friends', 'frenemies', 'enemies'];
  labelled.sort((x, y) => order.indexOf(labelOf(w, x)) - order.indexOf(labelOf(w, y)));
  for (const o of labelled) {
    const label = labelOf(w, o);
    add(`${label[0].toUpperCase()}${label.slice(1)} with ${o.name}`, o.id);
  }
  const felt = others.filter((o) => !labelled.includes(o) && !named.has(o.id) && feelWord(feelOf(w, o)) !== '');
  felt.sort((x, y) => feelOf(w, y) - feelOf(w, x));
  for (const o of felt) {
    const word = feelWord(feelOf(w, o));
    add(`${word[0].toUpperCase()}${word.slice(1)} ${o.name}`, o.id);
  }
  return out;
}

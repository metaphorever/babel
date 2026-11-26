// Order vocabulary. An order is a sequence of tokens; each token is one word
// in one language. There's no grammar: a sentence is just its words in
// order, so every word translates on its own.
//
// English is the common tongue everyone starts with. French and Greek drift
// in as the tower rises: French is one a casual player may half know, Greek
// is a different script, so you can see at a glance that a word is foreign.

import type { FixtureKind } from './types';

export type LangId = 'en' | 'fr' | 'el';

export interface LangInfo {
  id: LangId;
  name: string;
  /** Workers can only drift into a language once the tower is this tall. */
  fromFloor: number;
}

export const LANGS: readonly LangInfo[] = [
  { id: 'en', name: 'English', fromFloor: Infinity },
  { id: 'fr', name: 'French', fromFloor: 3 },
  { id: 'el', name: 'Greek', fromFloor: 5 },
];

export function langName(id: LangId): string {
  return LANGS.find((l) => l.id === id)!.name;
}

/** Verbs that produce or move goods. These can go on board notices. */
export type WorkVerb = 'MINE' | 'CHOP' | 'HARVEST' | 'COOK' | 'BREW' | 'HAUL' | 'BUILD';
/** Verbs that control a scroll, move orders around, or teach. Scrolls only. */
export type FlowVerb = 'WRITE' | 'DELIVER' | 'REPEAT' | 'CHECK' | 'TEACH' | 'LEARN' | LogicVerb;
/**
 * Words that steer a scroll rather than do work. IF: the next line only runs
 * if the condition holds. OTHERWISE: the line after it only runs if it
 * didn't. WAIT: stand by for some hours, or until a condition holds.
 */
export type LogicVerb = 'IF' | 'OTHERWISE' | 'WAIT';
export type Verb = WorkVerb | FlowVerb;
/**
 * CAMP is everything built on the ground: buildings and the fixtures in them
 * (everything but the tower). ANY is "anything": hauling whatever goods
 * there are, each to where it's kept.
 */
export type Noun = 'STONE' | 'WOOD' | 'GRAIN' | 'BREAD' | 'BEER' | 'ANY' | 'BOARD' | 'TOWER' | 'CAMP' | 'BUILDINGS' | 'FIXTURES';
/** Little words that introduce details: where from, where to, and where in (which fixtures to build). */
export type Prep = 'FROM' | 'TO' | 'IN';
/**
 * Places. FLOOR (the word "level") carries its level index on the token; it
 * reads one higher, since the ground counts as the first level. TOWER (a
 * noun too) means any level.
 */
export type PlaceWord = 'BASE' | 'FLOOR';
/**
 * Fixtures by kind: the token carries the fixture's permanent number
 * ("stockpile 3", "bed 2"). The stores (stockpile, shelves, pantry, bar) are
 * places goods can be hauled from and to; any fixture can be built by number.
 */
export type FixtureWord = 'STOCKPILE' | 'SHELVES' | 'PANTRY' | 'BAR' | 'BED' | 'OVEN' | 'BREWERY' | 'LADDER';
export type StoreKind = 'stockpile' | 'shelves' | 'pantry' | 'bar';
/** Which fixture kind each fixture word names. */
export const FIXTURE_WORD_KIND: Record<FixtureWord, FixtureKind> = {
  STOCKPILE: 'stockpile', SHELVES: 'shelves', PANTRY: 'pantry', BAR: 'bar',
  BED: 'bed', OVEN: 'oven', BREWERY: 'brewery', LADDER: 'ladder',
};
export const FIXTURE_WORDS: readonly FixtureWord[] = ['STOCKPILE', 'SHELVES', 'PANTRY', 'BAR', 'BED', 'OVEN', 'BREWERY', 'LADDER'];
/** The word for each kind of fixture. */
export const FIXTURE_WORD: Record<FixtureKind, FixtureWord> = {
  stockpile: 'STOCKPILE', shelves: 'SHELVES', pantry: 'PANTRY', bar: 'BAR',
  bed: 'BED', oven: 'OVEN', brewery: 'BREWERY', ladder: 'LADDER',
};
/** Does this fixture word name a store (somewhere goods are kept)? */
export function isStoreWord(f: FixtureWord): boolean {
  return f === 'STOCKPILE' || f === 'SHELVES' || f === 'PANTRY' || f === 'BAR';
}
/** The word for a kind of store. */
export const STORE_WORD: Record<StoreKind, FixtureWord> = { stockpile: 'STOCKPILE', shelves: 'SHELVES', pantry: 'PANTRY', bar: 'BAR' };
/** Where each good that can be hauled is kept: materials and grain in stockpiles and on shelves, bread in pantries, beer in bars. Anything goes in any store that keeps it. */
export const STORES_FOR: Record<'STONE' | 'WOOD' | 'GRAIN' | 'BREAD' | 'BEER' | 'ANY', readonly StoreKind[]> = {
  STONE: ['stockpile', 'shelves'],
  WOOD: ['stockpile', 'shelves'],
  GRAIN: ['stockpile', 'shelves'],
  BREAD: ['pantry'],
  BEER: ['bar'],
  ANY: ['stockpile', 'shelves', 'pantry', 'bar'],
};
/**
 * The little words of a condition. UNTIL ends a work line early once its
 * condition holds; HAS, FEWER and NO read a store ("stockpile 3 has fewer
 * than 20 stone"); NOT turns a yes/no round.
 */
export type CondWord = 'UNTIL' | 'NOT' | 'HAS' | 'FEWER' | 'NO';
/**
 * Yes/no things anyone can tell without walking anywhere: about themselves,
 * or the time of day. The four times each name the quarter of the day that
 * starts then: dawn (6 to noon), noon (to 18:00), dusk (to midnight),
 * midnight (to 6). So "until dusk" ends a day shift and "wait until dawn"
 * starts the next one.
 */
export type StateWord = 'HUNGRY' | 'TIRED' | 'CARRYING' | TimeWord;
export type TimeWord = 'DAWN' | 'NOON' | 'DUSK' | 'MIDNIGHT';
export const TIME_WORDS: readonly TimeWord[] = ['DAWN', 'NOON', 'DUSK', 'MIDNIGHT'];
export const STATE_WORDS: readonly StateWord[] = ['HUNGRY', 'TIRED', 'CARRYING', ...TIME_WORDS];
/** Words workers think and say, so you can read what they want. */
export type SayWord = 'WANT' | 'WATER' | 'SLEEP' | 'HOME' | 'GOLD' | 'WHAT';
/**
 * A worker's name (WHO), a fixture the player has named (NAMED), or a
 * number (NUM, in a condition: "has 20 stone"). Names and numerals never
 * drift: they're written the same in every language.
 */
export type NameWord = 'WHO' | 'NAMED' | 'NUM';
export type TokenId = Verb | Noun | Prep | PlaceWord | FixtureWord | SayWord | NameWord | CondWord | StateWord;

export interface Token {
  t: TokenId;
  lang: LangId;
  /** A number carried by the word: which floor, or which worker (for WHO). */
  n?: number;
  /** For WHO and NAMED: the name, written as is in every language. */
  name?: string;
}

export type Order = Token[];

export const VERBS: readonly WorkVerb[] = ['MINE', 'CHOP', 'HARVEST', 'COOK', 'BREW', 'HAUL', 'BUILD'];
export const NOUNS: readonly Noun[] = ['STONE', 'WOOD', 'GRAIN', 'BREAD', 'BEER'];

/** Every word that can drift (everything except names). */
export const DRIFTABLE: readonly Exclude<TokenId, NameWord>[] = [
  'MINE', 'CHOP', 'HARVEST', 'COOK', 'BREW', 'HAUL', 'BUILD',
  'WRITE', 'DELIVER', 'REPEAT', 'CHECK', 'TEACH', 'LEARN',
  'STONE', 'WOOD', 'GRAIN', 'BREAD', 'BEER', 'ANY', 'BOARD', 'TOWER', 'CAMP',
  'FROM', 'TO', 'BASE', 'FLOOR', 'STOCKPILE', 'SHELVES', 'PANTRY', 'BAR',
  'BED', 'OVEN', 'BREWERY', 'LADDER',
  'WANT', 'WATER', 'SLEEP', 'HOME', 'GOLD', 'WHAT',
  'IF', 'OTHERWISE', 'WAIT', 'UNTIL', 'NOT', 'HAS', 'FEWER', 'NO',
  'HUNGRY', 'TIRED', 'CARRYING', 'DAWN', 'NOON', 'DUSK', 'MIDNIGHT',
  'BUILDINGS', 'FIXTURES', 'IN',
];

const WORDS: Record<LangId, Record<Exclude<TokenId, NameWord>, string>> = {
  en: {
    MINE: 'mine', CHOP: 'chop', HARVEST: 'harvest', COOK: 'cook', BREW: 'brew', HAUL: 'haul', BUILD: 'build',
    WRITE: 'write', DELIVER: 'deliver', REPEAT: 'repeat', CHECK: 'check', TEACH: 'teach', LEARN: 'learn from',
    STONE: 'stone', WOOD: 'wood', GRAIN: 'grain', BREAD: 'bread', BEER: 'beer', ANY: 'anything', BOARD: 'board', TOWER: 'tower', CAMP: 'camp',
    FROM: 'from', TO: 'to', BASE: 'base', FLOOR: 'level', STOCKPILE: 'stockpile', SHELVES: 'shelves', PANTRY: 'pantry', BAR: 'bar',
    BED: 'bed', OVEN: 'oven', BREWERY: 'brewery', LADDER: 'ladder',
    WANT: 'want', WATER: 'water', SLEEP: 'sleep', HOME: 'home', GOLD: 'gold', WHAT: 'what?',
    IF: 'if', OTHERWISE: 'otherwise', WAIT: 'wait', UNTIL: 'until', NOT: 'not', HAS: 'has', FEWER: 'fewer than', NO: 'no',
    HUNGRY: 'hungry', TIRED: 'tired', CARRYING: 'carrying', DAWN: 'dawn', NOON: 'noon', DUSK: 'dusk', MIDNIGHT: 'midnight',
    BUILDINGS: 'buildings', FIXTURES: 'fixtures', IN: 'in',
  },
  fr: {
    MINE: 'creuser', CHOP: 'couper', HARVEST: 'récolter', COOK: 'cuire', BREW: 'brasser', HAUL: 'porter', BUILD: 'bâtir',
    WRITE: 'écrire', DELIVER: 'livrer', REPEAT: 'répéter', CHECK: 'voir', TEACH: 'enseigner', LEARN: 'apprendre de',
    STONE: 'pierre', WOOD: 'bois', GRAIN: 'blé', BREAD: 'pain', BEER: 'bière', ANY: 'tout', BOARD: 'tableau', TOWER: 'tour', CAMP: 'camp',
    FROM: 'de', TO: 'à', BASE: 'base', FLOOR: 'niveau', STOCKPILE: 'réserve', SHELVES: 'étagère', PANTRY: 'garde-manger', BAR: 'comptoir',
    BED: 'lit', OVEN: 'four', BREWERY: 'brasserie', LADDER: 'échelle',
    WANT: 'veux', WATER: 'eau', SLEEP: 'dormir', HOME: 'maison', GOLD: 'or', WHAT: 'quoi ?',
    IF: 'si', OTHERWISE: 'sinon', WAIT: 'attendre', UNTIL: 'jusqu’à', NOT: 'pas', HAS: 'contient', FEWER: 'moins de', NO: 'aucun',
    HUNGRY: 'affamé', TIRED: 'fatigué', CARRYING: 'chargé', DAWN: 'aube', NOON: 'midi', DUSK: 'crépuscule', MIDNIGHT: 'minuit',
    BUILDINGS: 'bâtiments', FIXTURES: 'installations', IN: 'dans',
  },
  el: {
    MINE: 'σκάψε', CHOP: 'κόψε', HARVEST: 'θέρισε', COOK: 'ψήσε', BREW: 'ζύμωσε', HAUL: 'κουβάλα', BUILD: 'χτίσε',
    WRITE: 'γράψε', DELIVER: 'παράδωσε', REPEAT: 'επανάλαβε', CHECK: 'δες', TEACH: 'δίδαξε', LEARN: 'μάθε από',
    STONE: 'πέτρα', WOOD: 'ξύλο', GRAIN: 'σιτάρι', BREAD: 'ψωμί', BEER: 'μπίρα', ANY: 'οτιδήποτε', BOARD: 'πίνακας', TOWER: 'πύργος', CAMP: 'καταυλισμός',
    FROM: 'από', TO: 'σε', BASE: 'βάση', FLOOR: 'επίπεδο', STOCKPILE: 'σωρός', SHELVES: 'ράφια', PANTRY: 'κελάρι', BAR: 'ταβέρνα',
    BED: 'κρεβάτι', OVEN: 'φούρνος', BREWERY: 'ζυθοποιείο', LADDER: 'σκάλα',
    WANT: 'θέλω', WATER: 'νερό', SLEEP: 'ύπνος', HOME: 'σπίτι', GOLD: 'χρυσός', WHAT: 'τι;',
    IF: 'αν', OTHERWISE: 'αλλιώς', WAIT: 'περίμενε', UNTIL: 'μέχρι', NOT: 'όχι', HAS: 'έχει', FEWER: 'λιγότερα από', NO: 'καθόλου',
    HUNGRY: 'πεινασμένος', TIRED: 'κουρασμένος', CARRYING: 'φορτωμένος', DAWN: 'αυγή', NOON: 'μεσημέρι', DUSK: 'σούρουπο', MIDNIGHT: 'μεσάνυχτα',
    BUILDINGS: 'κτίρια', FIXTURES: 'εγκαταστάσεις', IN: 'εντός',
  },
};

/** A word as written in its own language. Numbers and names are the same everywhere. */
export function word(tok: Token): string {
  if (tok.t === 'WHO' || tok.t === 'NAMED') return tok.name ?? '?';
  if (tok.t === 'NUM') return String(tok.n ?? 0);
  const w = WORDS[tok.lang][tok.t];
  if (tok.n === undefined) return w;
  return `${w} ${tok.t === 'FLOOR' ? tok.n + 1 : tok.n}`;
}

/** The same word in another language (for glosses). */
export function wordIn(t: TokenId, lang: LangId, n?: number): string {
  return word({ t, lang, n });
}

/**
 * A place in an order (after FROM or TO):
 * - a level: 0 is the base (anywhere on the ground), n is the tower level
 *   above the nth deck, which the player reads as "Level n+1" (levelName);
 * - 'tower': any tower level;
 * - one storage fixture by its permanent number ("stockpile 3");
 * - one fixture by the name the player gave it.
 * No place at all means the nearest (TO) or whatever's lying around (FROM).
 */
export type Place = number | 'tower' | 'camp' | { fixture: FixtureWord; n: number } | { name: string };

export function placeTokens(place: Place, lang: LangId = 'en'): Token[] {
  if (typeof place === 'number') return place === 0 ? [{ t: 'BASE', lang }] : [{ t: 'FLOOR', lang, n: place }];
  if (place === 'tower') return [{ t: 'TOWER', lang }];
  if (place === 'camp') return [{ t: 'CAMP', lang }];
  if ('fixture' in place) return [{ t: place.fixture, lang, n: place.n }];
  return [{ t: 'NAMED', lang, name: place.name }];
}

/**
 * A tower room as the player reads it, by the level workers stand on in it.
 * The room on the ground (standing level 0) is "Tower Ground Level", the
 * room on top of the nth deck is "Tower Level n+1". There is no level 0 or
 * level 1 for the player. Inside the code, levels stay 0-based.
 * Short drops "Tower", for places where the tower goes without saying.
 */
export function levelName(level: number, short = false): string {
  if (level === 0) return short ? 'Ground Level' : 'Tower Ground Level';
  return `${short ? '' : 'Tower '}Level ${level + 1}`;
}

/**
 * A tower floor under construction (or finished), as the player reads it.
 * Building floor k raises the walls of the room below its deck, so the
 * first floor built is the Ground Level, the next is Level 2.
 */
export function floorName(floor: number, short = false): string {
  return levelName(floor - 1, short);
}

export function placeName(place: Place): string {
  if (typeof place === 'number') return place === 0 ? 'the base' : levelName(place);
  if (place === 'tower') return 'the tower';
  if (place === 'camp') return 'the camp';
  if ('fixture' in place) return `${word({ t: place.fixture, lang: 'en' })} ${place.n}`;
  return place.name;
}

/** A place as a short string, for comparing places and for menus. */
export function placeKey(place: Place | null): string {
  if (place === null) return '';
  if (typeof place === 'number') return `L${place}`;
  if (place === 'tower') return 'T';
  if (place === 'camp') return 'C';
  if ('fixture' in place) return `F:${place.fixture}:${place.n}`;
  return `N:${place.name.toLowerCase()}`;
}

/** The place a token names, if it names one. */
function tokenPlace(tok: Token): Place | null {
  switch (tok.t) {
    case 'BASE': return 0;
    case 'FLOOR': return tok.n ?? 0;
    case 'TOWER': return 'tower';
    case 'CAMP': return 'camp';
    case 'NAMED': return { name: tok.name ?? '' };
    default: return (FIXTURE_WORDS as readonly string[]).includes(tok.t) ? { fixture: tok.t as FixtureWord, n: tok.n ?? 0 } : null;
  }
}

/**
 * The parts of an order: verb, object, a worker named in it, and optional
 * FROM / TO places. A place right after the verb, instead of an object, is
 * what to build: "build Kitchen", "build ladder 1", "build level 4".
 */
export interface ParsedOrder {
  verb: Verb;
  noun: Noun | null;
  who: number | null;
  from: Place | null;
  to: Place | null;
  target: Place | null;
  /** IF's condition, WAIT UNTIL's, or a work line's UNTIL clause. */
  cond: Condition | null;
  /** "build fixtures in …": where (null: anywhere). */
  within: Place | null;
}

// ---------------------------------------------------------------- conditions

/** Goods a store can be checked for. */
export type Good = 'STONE' | 'WOOD' | 'GRAIN' | 'BREAD' | 'BEER';
export const GOODS: readonly Good[] = ['STONE', 'WOOD', 'GRAIN', 'BREAD', 'BEER'];
/** How a store's count is compared: at least n, fewer than n, or none at all. */
export type Compare = 'least' | 'fewer' | 'none';

/**
 * Something a worker can find out: how much a store holds (they have to be
 * able to see it), or a yes/no about themselves or the sky. There are no
 * variables: state lives in the world, so a number is a pile of stone.
 */
export type Condition =
  | { kind: 'has'; place: Place; cmp: Compare; n: number; noun: Good }
  | { kind: 'state'; state: StateWord; not: boolean };

/** A condition's words: "stockpile 3 has fewer than 20 stone", "not night". */
export function condTokens(c: Condition, lang: LangId = 'en'): Token[] {
  if (c.kind === 'state') return [...(c.not ? [{ t: 'NOT' as const, lang }] : []), { t: c.state, lang }];
  const out: Token[] = [...placeTokens(c.place, lang), { t: 'HAS', lang }];
  if (c.cmp === 'fewer') out.push({ t: 'FEWER', lang });
  if (c.cmp === 'none') out.push({ t: 'NO', lang });
  else out.push({ t: 'NUM', lang, n: c.n });
  out.push({ t: c.noun, lang });
  return out;
}

/** Read a condition back from its words (null if it doesn't make one). */
export function parseCondition(toks: readonly Token[]): Condition | null {
  if (toks.length === 0) return null;
  let i = 0;
  const not = toks[0].t === 'NOT';
  if (not) i++;
  const first = toks[i];
  if (!first) return null;
  if ((STATE_WORDS as readonly string[]).includes(first.t)) return { kind: 'state', state: first.t as StateWord, not };
  if (not) return null;
  const place = tokenPlace(first);
  if (place === null || toks[i + 1]?.t !== 'HAS') return null;
  let j = i + 2;
  let cmp: Compare = 'least';
  if (toks[j]?.t === 'FEWER') {
    cmp = 'fewer';
    j++;
  } else if (toks[j]?.t === 'NO') {
    cmp = 'none';
    j++;
  }
  let n = 0;
  if (cmp !== 'none') {
    if (toks[j]?.t !== 'NUM') return null;
    n = toks[j++].n ?? 0;
  }
  const noun = toks[j]?.t;
  if (!noun || !(GOODS as readonly string[]).includes(noun)) return null;
  return { kind: 'has', place, cmp, n, noun: noun as Good };
}

export function conditionText(c: Condition): string {
  return condTokens(c).map(word).join(' ');
}

/** Where a work line's UNTIL clause starts (-1: it has none). */
export function untilIndex(order: Order): number {
  if (order[0]?.t === 'IF' || order[0]?.t === 'WAIT') return -1;
  return order.findIndex((t) => t.t === 'UNTIL');
}

/** A work line split into what to do and the UNTIL clause after it (its words, without UNTIL). */
export function splitUntil(order: Order): { action: Order; until: Order | null } {
  const i = untilIndex(order);
  return i < 0 ? { action: order, until: null } : { action: order.slice(0, i), until: order.slice(i + 1) };
}

/** Which lines take a condition: IF must, WAIT and work lines may (WAIT UNTIL…, …UNTIL…). */
export function condRule(verb: Verb): 'must' | 'may' | 'never' {
  if (verb === 'IF') return 'must';
  if (verb === 'WAIT' || isWorkVerb(verb)) return 'may';
  return 'never';
}

export function isLogicVerb(v: TokenId): v is LogicVerb {
  return v === 'IF' || v === 'OTHERWISE' || v === 'WAIT';
}

export function parseOrder(order: Order): ParsedOrder {
  const out: ParsedOrder = { verb: order[0].t as Verb, noun: null, who: null, from: null, to: null, target: null, cond: null, within: null };
  if (out.verb === 'IF') {
    out.cond = parseCondition(order.slice(1));
    return out;
  }
  if (out.verb === 'WAIT') {
    if (order[1]?.t === 'UNTIL') out.cond = parseCondition(order.slice(2));
    return out;
  }
  const { action, until } = splitUntil(order);
  if (until) out.cond = parseCondition(until);
  order = action;
  let i = 1;
  if (order[i]?.t === 'WHO') out.who = order[i++].n ?? null;
  else if (order[i] && !isPrep(order[i].t)) {
    // TOWER and CAMP are places too, but after a verb they're the thing itself ("build tower")
    const place = order[i].t === 'TOWER' || order[i].t === 'CAMP' ? null : tokenPlace(order[i]);
    if (place !== null) out.target = place;
    else out.noun = order[i].t as Noun;
    i++;
  }
  while (i < order.length) {
    const prep = order[i].t;
    const place = order[i + 1];
    if (!place || !isPrep(prep)) break;
    const where = tokenPlace(place);
    if (where === null) break;
    if (prep === 'FROM') out.from = where;
    else if (prep === 'IN') out.within = where;
    else out.to = where;
    i += 2;
  }
  return out;
}

export function isPrep(t: TokenId): t is Prep {
  return t === 'FROM' || t === 'TO' || t === 'IN';
}

export function orderText(order: Order): string {
  return order.map((tok) => word(tok)).join(' ');
}

export interface OrderExtras {
  from?: Place | null;
  to?: Place | null;
  /** A worker named in the order (who to teach, who to learn from). */
  who?: { id: number; name: string } | null;
  /** One planned build (or everything planned on a level), in place of an object. */
  target?: Place | null;
  /** IF's condition, WAIT UNTIL's, or an UNTIL clause on a work line. */
  cond?: Condition | null;
  /** "build fixtures in …": where. */
  within?: Place | null;
}

export function makeOrder(verb: Verb, noun: Noun | null = null, extras: OrderExtras = {}, lang: LangId = 'en'): Order {
  const o: Order = [{ t: verb, lang }];
  const cond = extras.cond ?? null;
  if (verb === 'IF') return cond ? [...o, ...condTokens(cond, lang)] : o;
  if (verb === 'WAIT') return cond ? [...o, { t: 'UNTIL', lang }, ...condTokens(cond, lang)] : o;
  if (verb === 'OTHERWISE') return o;
  if (extras.who) o.push({ t: 'WHO', lang, n: extras.who.id, name: extras.who.name });
  if (extras.target !== undefined && extras.target !== null) o.push(...placeTokens(extras.target, lang));
  else if (noun) o.push({ t: noun, lang });
  if (extras.from !== undefined && extras.from !== null) o.push({ t: 'FROM', lang }, ...placeTokens(extras.from, lang));
  if (extras.to !== undefined && extras.to !== null) o.push({ t: 'TO', lang }, ...placeTokens(extras.to, lang));
  if (extras.within !== undefined && extras.within !== null) o.push({ t: 'IN', lang }, ...placeTokens(extras.within, lang));
  if (cond) o.push({ t: 'UNTIL', lang }, ...condTokens(cond, lang));
  return o;
}

/** Only hauling takes places (FROM a store, TO a store). */
export function takesPlaces(verb: Verb): boolean {
  return verb === 'HAUL';
}

/** Teaching and learning name a worker. */
export function takesWho(verb: Verb): boolean {
  return verb === 'TEACH' || verb === 'LEARN';
}

export function isWorkVerb(v: TokenId): v is WorkVerb {
  return (VERBS as readonly string[]).includes(v);
}

/** Which verb+noun pairs make sense as jobs in P0. */
export const VALID_JOBS: Record<WorkVerb, readonly Noun[]> = {
  MINE: ['STONE'],
  CHOP: ['WOOD'],
  HARVEST: ['GRAIN'],
  COOK: ['BREAD'],
  BREW: ['BEER'],
  HAUL: ['ANY', 'STONE', 'WOOD', 'GRAIN', 'BREAD', 'BEER'],
  BUILD: ['CAMP', 'BUILDINGS', 'FIXTURES', 'TOWER'],
};

/** Only "build fixtures" says where: in the camp, in the tower, on a level, in a building. */
export function takesWithin(verb: Verb, noun: Noun | null): boolean {
  return verb === 'BUILD' && noun === 'FIXTURES';
}

/** Building can name one planned build instead of an object. */
export function takesTarget(verb: Verb): boolean {
  return verb === 'BUILD';
}

export function isValidJob(verb: Verb, noun: Noun): boolean {
  return isWorkVerb(verb) && VALID_JOBS[verb].includes(noun);
}

/** Every line that can be written on a scroll. */
export interface LineOption {
  verb: Verb;
  noun: Noun | null;
}

export const SCROLL_LINES: readonly LineOption[] = [
  ...VERBS.flatMap((v) => VALID_JOBS[v].map((n) => ({ verb: v as Verb, noun: n as Noun | null }))),
  { verb: 'WRITE', noun: null },
  { verb: 'DELIVER', noun: null },
  { verb: 'TEACH', noun: null },
  { verb: 'LEARN', noun: null },
  { verb: 'CHECK', noun: 'BOARD' },
  { verb: 'REPEAT', noun: null },
  { verb: 'IF', noun: null },
  { verb: 'OTHERWISE', noun: null },
  { verb: 'WAIT', noun: null },
];

export function isValidLine(verb: Verb, noun: Noun | null, target: Place | null = null): boolean {
  if (target !== null) return takesTarget(verb) && noun === null && target !== 'tower' && target !== 'camp';
  return SCROLL_LINES.some((l) => l.verb === verb && l.noun === noun);
}

/**
 * Special counts. ALL keeps going while there's anything to do and is done
 * once the source runs dry (everything lying around, every word to teach).
 * FOREVER never finishes. Both are stored as negative numbers so state stays
 * plain JSON.
 */
export const ALL = -1;
export const FOREVER = -2;

export function isSpecialCount(n: number): boolean {
  return n === ALL || n === FOREVER;
}

export function countText(n: number): string {
  return n === ALL ? 'all' : n === FOREVER ? '∞' : String(n);
}

/** "All" only makes sense where the work can run out. */
export function allowsAll(verb: Verb): boolean {
  return verb === 'HAUL' || verb === 'BUILD' || verb === 'COOK' || verb === 'BREW' || verb === 'WRITE' || verb === 'TEACH' || verb === 'LEARN';
}

/** "Forever" is for work that can go on indefinitely. */
export function allowsForever(verb: Verb): boolean {
  return isWorkVerb(verb) || verb === 'WRITE';
}

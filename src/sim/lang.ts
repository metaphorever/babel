// Order vocabulary. An order is a sequence of tokens; each token is one word
// in one language. P0 starts with English only, but every order already
// records the language of each word so drift can slot in later.

export type LangId = 'en';

/** Verbs that produce or move goods. These can go on board notices. */
export type WorkVerb = 'MINE' | 'CHOP' | 'HARVEST' | 'COOK' | 'HAUL' | 'BUILD';
/** Verbs that control a scroll or move orders around. Scrolls only. */
export type FlowVerb = 'WRITE' | 'DELIVER' | 'REPEAT' | 'CHECK';
export type Verb = WorkVerb | FlowVerb;
export type Noun = 'STONE' | 'WOOD' | 'GRAIN' | 'BREAD' | 'BOARD' | 'TOWER';
/** Little words that introduce details: where from, where to. */
export type Prep = 'FROM' | 'TO';
/** Places. FLOOR carries its number on the token. */
export type PlaceWord = 'BASE' | 'FLOOR';
export type TokenId = Verb | Noun | Prep | PlaceWord;

export interface Token {
  t: TokenId;
  lang: LangId;
  /** A number carried by the word, e.g. which floor. */
  n?: number;
}

export type Order = Token[];

export const VERBS: readonly WorkVerb[] = ['MINE', 'CHOP', 'HARVEST', 'COOK', 'HAUL', 'BUILD'];
export const NOUNS: readonly Noun[] = ['STONE', 'WOOD', 'GRAIN', 'BREAD'];

const WORDS: Record<LangId, Record<TokenId, string>> = {
  en: {
    MINE: 'mine',
    CHOP: 'chop',
    HARVEST: 'harvest',
    COOK: 'cook',
    HAUL: 'haul',
    BUILD: 'build',
    WRITE: 'write',
    DELIVER: 'deliver',
    REPEAT: 'repeat',
    CHECK: 'check',
    STONE: 'stone',
    WOOD: 'wood',
    GRAIN: 'grain',
    BREAD: 'bread',
    BOARD: 'board',
    TOWER: 'tower',
    FROM: 'from',
    TO: 'to',
    BASE: 'base',
    FLOOR: 'floor',
  },
};

export function word(tok: Token): string {
  const w = WORDS[tok.lang][tok.t];
  return tok.n !== undefined ? `${w} ${tok.n}` : w;
}

/** A place, as a level: 0 is the base (on the ground), n is floor n. */
export type Place = number;

export function placeTokens(level: Place, lang: LangId = 'en'): Token[] {
  return level === 0 ? [{ t: 'BASE', lang }] : [{ t: 'FLOOR', lang, n: level }];
}

export function placeName(level: Place): string {
  return level === 0 ? 'the base' : `floor ${level}`;
}

/** The parts of a work order: verb, object, and optional FROM / TO places. */
export interface ParsedOrder {
  verb: Verb;
  noun: Noun | null;
  from: Place | null;
  to: Place | null;
}

export function parseOrder(order: Order): ParsedOrder {
  const out: ParsedOrder = { verb: order[0].t as Verb, noun: null, from: null, to: null };
  let i = 1;
  if (order[i] && !isPrep(order[i].t)) out.noun = order[i++].t as Noun;
  while (i < order.length) {
    const prep = order[i].t;
    const place = order[i + 1];
    if (!place || !isPrep(prep)) break;
    const level = place.t === 'FLOOR' ? place.n ?? 0 : 0;
    if (prep === 'FROM') out.from = level;
    else out.to = level;
    i += 2;
  }
  return out;
}

function isPrep(t: TokenId): t is Prep {
  return t === 'FROM' || t === 'TO';
}

export function orderText(order: Order): string {
  return order.map((tok) => word(tok)).join(' ');
}

export function makeOrder(
  verb: Verb,
  noun: Noun | null = null,
  places: { from?: Place | null; to?: Place | null } = {},
  lang: LangId = 'en',
): Order {
  const o: Order = [{ t: verb, lang }];
  if (noun) o.push({ t: noun, lang });
  if (places.from !== undefined && places.from !== null) o.push({ t: 'FROM', lang }, ...placeTokens(places.from, lang));
  if (places.to !== undefined && places.to !== null) o.push({ t: 'TO', lang }, ...placeTokens(places.to, lang));
  return o;
}

/** Only hauling takes places (FROM a stockpile, TO a stockpile) in P0. */
export function takesPlaces(verb: Verb): boolean {
  return verb === 'HAUL';
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
  HAUL: ['STONE', 'WOOD', 'GRAIN'],
  BUILD: ['TOWER'],
};

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
  { verb: 'CHECK', noun: 'BOARD' },
  { verb: 'REPEAT', noun: null },
];

export function isValidLine(verb: Verb, noun: Noun | null): boolean {
  return SCROLL_LINES.some((l) => l.verb === verb && l.noun === noun);
}

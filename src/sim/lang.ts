// Order vocabulary. An order is a sequence of tokens; each token is one word
// in one language. There's no grammar: a sentence is just its words in
// order, so every word translates on its own.
//
// English is the common tongue everyone starts with. French and Greek drift
// in as the tower rises: French is one a casual player may half know, Greek
// is a different script, so you can see at a glance that a word is foreign.

export type LangId = 'en' | 'fr' | 'el';

export interface LangInfo {
  id: LangId;
  name: string;
  /** Workers can only drift into a language once the tower is this tall. */
  fromFloor: number;
}

export const LANGS: readonly LangInfo[] = [
  { id: 'en', name: 'English', fromFloor: Infinity },
  { id: 'fr', name: 'French', fromFloor: 2 },
  { id: 'el', name: 'Greek', fromFloor: 5 },
];

export function langName(id: LangId): string {
  return LANGS.find((l) => l.id === id)!.name;
}

/** Verbs that produce or move goods. These can go on board notices. */
export type WorkVerb = 'MINE' | 'CHOP' | 'HARVEST' | 'COOK' | 'HAUL' | 'BUILD';
/** Verbs that control a scroll, move orders around, or teach. Scrolls only. */
export type FlowVerb = 'WRITE' | 'DELIVER' | 'REPEAT' | 'CHECK' | 'TEACH' | 'LEARN';
export type Verb = WorkVerb | FlowVerb;
export type Noun = 'STONE' | 'WOOD' | 'GRAIN' | 'BREAD' | 'BOARD' | 'TOWER';
/** Little words that introduce details: where from, where to. */
export type Prep = 'FROM' | 'TO';
/** Places. FLOOR carries its number on the token. */
export type PlaceWord = 'BASE' | 'FLOOR';
/** Words workers think and say, so you can read what they want. */
export type SayWord = 'WANT' | 'WATER' | 'SLEEP' | 'HOME' | 'GOLD' | 'WHAT';
/** A worker's name. Names never drift and everyone recognizes their own. */
export type NameWord = 'WHO';
export type TokenId = Verb | Noun | Prep | PlaceWord | SayWord | NameWord;

export interface Token {
  t: TokenId;
  lang: LangId;
  /** A number carried by the word: which floor, or which worker (for WHO). */
  n?: number;
  /** For WHO: the name, written as is in every language. */
  name?: string;
}

export type Order = Token[];

export const VERBS: readonly WorkVerb[] = ['MINE', 'CHOP', 'HARVEST', 'COOK', 'HAUL', 'BUILD'];
export const NOUNS: readonly Noun[] = ['STONE', 'WOOD', 'GRAIN', 'BREAD'];

/** Every word that can drift (everything except names). */
export const DRIFTABLE: readonly Exclude<TokenId, NameWord>[] = [
  'MINE', 'CHOP', 'HARVEST', 'COOK', 'HAUL', 'BUILD',
  'WRITE', 'DELIVER', 'REPEAT', 'CHECK', 'TEACH', 'LEARN',
  'STONE', 'WOOD', 'GRAIN', 'BREAD', 'BOARD', 'TOWER',
  'FROM', 'TO', 'BASE', 'FLOOR',
  'WANT', 'WATER', 'SLEEP', 'HOME', 'GOLD', 'WHAT',
];

const WORDS: Record<LangId, Record<Exclude<TokenId, NameWord>, string>> = {
  en: {
    MINE: 'mine', CHOP: 'chop', HARVEST: 'harvest', COOK: 'cook', HAUL: 'haul', BUILD: 'build',
    WRITE: 'write', DELIVER: 'deliver', REPEAT: 'repeat', CHECK: 'check', TEACH: 'teach', LEARN: 'learn from',
    STONE: 'stone', WOOD: 'wood', GRAIN: 'grain', BREAD: 'bread', BOARD: 'board', TOWER: 'tower',
    FROM: 'from', TO: 'to', BASE: 'base', FLOOR: 'floor',
    WANT: 'want', WATER: 'water', SLEEP: 'sleep', HOME: 'home', GOLD: 'gold', WHAT: 'what?',
  },
  fr: {
    MINE: 'creuser', CHOP: 'couper', HARVEST: 'récolter', COOK: 'cuire', HAUL: 'porter', BUILD: 'bâtir',
    WRITE: 'écrire', DELIVER: 'livrer', REPEAT: 'répéter', CHECK: 'voir', TEACH: 'enseigner', LEARN: 'apprendre de',
    STONE: 'pierre', WOOD: 'bois', GRAIN: 'blé', BREAD: 'pain', BOARD: 'tableau', TOWER: 'tour',
    FROM: 'de', TO: 'à', BASE: 'base', FLOOR: 'étage',
    WANT: 'veux', WATER: 'eau', SLEEP: 'dormir', HOME: 'maison', GOLD: 'or', WHAT: 'quoi ?',
  },
  el: {
    MINE: 'σκάψε', CHOP: 'κόψε', HARVEST: 'θέρισε', COOK: 'ψήσε', HAUL: 'κουβάλα', BUILD: 'χτίσε',
    WRITE: 'γράψε', DELIVER: 'παράδωσε', REPEAT: 'επανάλαβε', CHECK: 'δες', TEACH: 'δίδαξε', LEARN: 'μάθε από',
    STONE: 'πέτρα', WOOD: 'ξύλο', GRAIN: 'σιτάρι', BREAD: 'ψωμί', BOARD: 'πίνακας', TOWER: 'πύργος',
    FROM: 'από', TO: 'σε', BASE: 'βάση', FLOOR: 'όροφος',
    WANT: 'θέλω', WATER: 'νερό', SLEEP: 'ύπνος', HOME: 'σπίτι', GOLD: 'χρυσός', WHAT: 'τι;',
  },
};

/** A word as written in its own language. Numbers and names are the same everywhere. */
export function word(tok: Token): string {
  if (tok.t === 'WHO') return tok.name ?? '?';
  const w = WORDS[tok.lang][tok.t];
  return tok.n !== undefined ? `${w} ${tok.n}` : w;
}

/** The same word in another language (for glosses). */
export function wordIn(t: TokenId, lang: LangId, n?: number): string {
  return word({ t, lang, n });
}

/** A place, as a level: 0 is the base (on the ground), n is floor n. */
export type Place = number;

export function placeTokens(level: Place, lang: LangId = 'en'): Token[] {
  return level === 0 ? [{ t: 'BASE', lang }] : [{ t: 'FLOOR', lang, n: level }];
}

export function placeName(level: Place): string {
  return level === 0 ? 'the base' : `floor ${level}`;
}

/** The parts of an order: verb, object, a worker named in it, and optional FROM / TO places. */
export interface ParsedOrder {
  verb: Verb;
  noun: Noun | null;
  who: number | null;
  from: Place | null;
  to: Place | null;
}

export function parseOrder(order: Order): ParsedOrder {
  const out: ParsedOrder = { verb: order[0].t as Verb, noun: null, who: null, from: null, to: null };
  let i = 1;
  if (order[i]?.t === 'WHO') out.who = order[i++].n ?? null;
  else if (order[i] && !isPrep(order[i].t)) out.noun = order[i++].t as Noun;
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

export function isPrep(t: TokenId): t is Prep {
  return t === 'FROM' || t === 'TO';
}

export function orderText(order: Order): string {
  return order.map((tok) => word(tok)).join(' ');
}

export interface OrderExtras {
  from?: Place | null;
  to?: Place | null;
  /** A worker named in the order (who to teach, who to learn from). */
  who?: { id: number; name: string } | null;
}

export function makeOrder(verb: Verb, noun: Noun | null = null, extras: OrderExtras = {}, lang: LangId = 'en'): Order {
  const o: Order = [{ t: verb, lang }];
  if (extras.who) o.push({ t: 'WHO', lang, n: extras.who.id, name: extras.who.name });
  if (noun) o.push({ t: noun, lang });
  if (extras.from !== undefined && extras.from !== null) o.push({ t: 'FROM', lang }, ...placeTokens(extras.from, lang));
  if (extras.to !== undefined && extras.to !== null) o.push({ t: 'TO', lang }, ...placeTokens(extras.to, lang));
  return o;
}

/** Only hauling takes places (FROM a stockpile, TO a stockpile) in P0. */
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
  { verb: 'TEACH', noun: null },
  { verb: 'LEARN', noun: null },
  { verb: 'CHECK', noun: 'BOARD' },
  { verb: 'REPEAT', noun: null },
];

export function isValidLine(verb: Verb, noun: Noun | null): boolean {
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
  return verb === 'HAUL' || verb === 'BUILD' || verb === 'COOK' || verb === 'WRITE' || verb === 'TEACH' || verb === 'LEARN';
}

/** "Forever" is for work that can go on indefinitely. */
export function allowsForever(verb: Verb): boolean {
  return isWorkVerb(verb) || verb === 'WRITE';
}

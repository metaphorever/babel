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
  { id: 'fr', name: 'French', fromFloor: 3 },
  { id: 'el', name: 'Greek', fromFloor: 5 },
];

export function langName(id: LangId): string {
  return LANGS.find((l) => l.id === id)!.name;
}

/** Verbs that produce or move goods. These can go on board notices. */
export type WorkVerb = 'MINE' | 'CHOP' | 'HARVEST' | 'COOK' | 'BREW' | 'HAUL' | 'BUILD';
/** Verbs that control a scroll, move orders around, or teach. Scrolls only. */
export type FlowVerb = 'WRITE' | 'DELIVER' | 'REPEAT' | 'CHECK' | 'TEACH' | 'LEARN';
export type Verb = WorkVerb | FlowVerb;
/** CAMP is everything built on the ground: buildings and the fixtures in them (everything but the tower). */
export type Noun = 'STONE' | 'WOOD' | 'GRAIN' | 'BREAD' | 'BEER' | 'BOARD' | 'TOWER' | 'CAMP';
/** Little words that introduce details: where from, where to. */
export type Prep = 'FROM' | 'TO';
/**
 * Places. FLOOR (the word "level") carries its level index on the token; it
 * reads one higher, since the ground counts as the first level. TOWER (a
 * noun too) means any level.
 */
export type PlaceWord = 'BASE' | 'FLOOR';
/** Fixtures that hold goods, by kind: the token carries the fixture's permanent number ("stockpile 3"). */
export type FixtureWord = 'STOCKPILE' | 'SHELVES' | 'PANTRY' | 'BAR';
export type StoreKind = 'stockpile' | 'shelves' | 'pantry' | 'bar';
/** Which fixture kind each fixture word names. */
export const FIXTURE_WORD_KIND: Record<FixtureWord, StoreKind> = { STOCKPILE: 'stockpile', SHELVES: 'shelves', PANTRY: 'pantry', BAR: 'bar' };
export const FIXTURE_WORDS: readonly FixtureWord[] = ['STOCKPILE', 'SHELVES', 'PANTRY', 'BAR'];
/** The word for a kind of store. */
export const STORE_WORD: Record<StoreKind, FixtureWord> = { stockpile: 'STOCKPILE', shelves: 'SHELVES', pantry: 'PANTRY', bar: 'BAR' };
/** Where each good that can be hauled is kept: materials and grain in stockpiles and on shelves, bread in pantries, beer in bars. */
export const STORES_FOR: Record<'STONE' | 'WOOD' | 'GRAIN' | 'BREAD' | 'BEER', readonly StoreKind[]> = {
  STONE: ['stockpile', 'shelves'],
  WOOD: ['stockpile', 'shelves'],
  GRAIN: ['stockpile', 'shelves'],
  BREAD: ['pantry'],
  BEER: ['bar'],
};
/** Words workers think and say, so you can read what they want. */
export type SayWord = 'WANT' | 'WATER' | 'SLEEP' | 'HOME' | 'GOLD' | 'WHAT';
/**
 * A worker's name (WHO), or a fixture the player has named (NAMED). Names
 * never drift: they're written the same in every language.
 */
export type NameWord = 'WHO' | 'NAMED';
export type TokenId = Verb | Noun | Prep | PlaceWord | FixtureWord | SayWord | NameWord;

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
  'STONE', 'WOOD', 'GRAIN', 'BREAD', 'BEER', 'BOARD', 'TOWER', 'CAMP',
  'FROM', 'TO', 'BASE', 'FLOOR', 'STOCKPILE', 'SHELVES', 'PANTRY', 'BAR',
  'WANT', 'WATER', 'SLEEP', 'HOME', 'GOLD', 'WHAT',
];

const WORDS: Record<LangId, Record<Exclude<TokenId, NameWord>, string>> = {
  en: {
    MINE: 'mine', CHOP: 'chop', HARVEST: 'harvest', COOK: 'cook', BREW: 'brew', HAUL: 'haul', BUILD: 'build',
    WRITE: 'write', DELIVER: 'deliver', REPEAT: 'repeat', CHECK: 'check', TEACH: 'teach', LEARN: 'learn from',
    STONE: 'stone', WOOD: 'wood', GRAIN: 'grain', BREAD: 'bread', BEER: 'beer', BOARD: 'board', TOWER: 'tower', CAMP: 'camp',
    FROM: 'from', TO: 'to', BASE: 'base', FLOOR: 'level', STOCKPILE: 'stockpile', SHELVES: 'shelves', PANTRY: 'pantry', BAR: 'bar',
    WANT: 'want', WATER: 'water', SLEEP: 'sleep', HOME: 'home', GOLD: 'gold', WHAT: 'what?',
  },
  fr: {
    MINE: 'creuser', CHOP: 'couper', HARVEST: 'récolter', COOK: 'cuire', BREW: 'brasser', HAUL: 'porter', BUILD: 'bâtir',
    WRITE: 'écrire', DELIVER: 'livrer', REPEAT: 'répéter', CHECK: 'voir', TEACH: 'enseigner', LEARN: 'apprendre de',
    STONE: 'pierre', WOOD: 'bois', GRAIN: 'blé', BREAD: 'pain', BEER: 'bière', BOARD: 'tableau', TOWER: 'tour', CAMP: 'camp',
    FROM: 'de', TO: 'à', BASE: 'base', FLOOR: 'niveau', STOCKPILE: 'réserve', SHELVES: 'étagère', PANTRY: 'garde-manger', BAR: 'comptoir',
    WANT: 'veux', WATER: 'eau', SLEEP: 'dormir', HOME: 'maison', GOLD: 'or', WHAT: 'quoi ?',
  },
  el: {
    MINE: 'σκάψε', CHOP: 'κόψε', HARVEST: 'θέρισε', COOK: 'ψήσε', BREW: 'ζύμωσε', HAUL: 'κουβάλα', BUILD: 'χτίσε',
    WRITE: 'γράψε', DELIVER: 'παράδωσε', REPEAT: 'επανάλαβε', CHECK: 'δες', TEACH: 'δίδαξε', LEARN: 'μάθε από',
    STONE: 'πέτρα', WOOD: 'ξύλο', GRAIN: 'σιτάρι', BREAD: 'ψωμί', BEER: 'μπίρα', BOARD: 'πίνακας', TOWER: 'πύργος', CAMP: 'καταυλισμός',
    FROM: 'από', TO: 'σε', BASE: 'βάση', FLOOR: 'επίπεδο', STOCKPILE: 'σωρός', SHELVES: 'ράφια', PANTRY: 'κελάρι', BAR: 'ταβέρνα',
    WANT: 'θέλω', WATER: 'νερό', SLEEP: 'ύπνος', HOME: 'σπίτι', GOLD: 'χρυσός', WHAT: 'τι;',
  },
};

/** A word as written in its own language. Numbers and names are the same everywhere. */
export function word(tok: Token): string {
  if (tok.t === 'WHO' || tok.t === 'NAMED') return tok.name ?? '?';
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
export type Place = number | 'tower' | { fixture: FixtureWord; n: number } | { name: string };

export function placeTokens(place: Place, lang: LangId = 'en'): Token[] {
  if (typeof place === 'number') return place === 0 ? [{ t: 'BASE', lang }] : [{ t: 'FLOOR', lang, n: place }];
  if (place === 'tower') return [{ t: 'TOWER', lang }];
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
  if ('fixture' in place) return `${word({ t: place.fixture, lang: 'en' })} ${place.n}`;
  return place.name;
}

/** A place as a short string, for comparing places and for menus. */
export function placeKey(place: Place | null): string {
  if (place === null) return '';
  if (typeof place === 'number') return `L${place}`;
  if (place === 'tower') return 'T';
  if ('fixture' in place) return `F:${place.fixture}:${place.n}`;
  return `N:${place.name.toLowerCase()}`;
}

/** The place a token names, if it names one. */
function tokenPlace(tok: Token): Place | null {
  switch (tok.t) {
    case 'BASE': return 0;
    case 'FLOOR': return tok.n ?? 0;
    case 'TOWER': return 'tower';
    case 'STOCKPILE':
    case 'SHELVES':
    case 'PANTRY':
    case 'BAR': return { fixture: tok.t, n: tok.n ?? 0 };
    case 'NAMED': return { name: tok.name ?? '' };
    default: return null;
  }
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
    const where = tokenPlace(place);
    if (where === null) break;
    if (prep === 'FROM') out.from = where;
    else out.to = where;
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
  HAUL: ['STONE', 'WOOD', 'GRAIN', 'BREAD', 'BEER'],
  BUILD: ['TOWER', 'CAMP'],
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
  return verb === 'HAUL' || verb === 'BUILD' || verb === 'COOK' || verb === 'BREW' || verb === 'WRITE' || verb === 'TEACH' || verb === 'LEARN';
}

/** "Forever" is for work that can go on indefinitely. */
export function allowsForever(verb: Verb): boolean {
  return isWorkVerb(verb) || verb === 'WRITE';
}

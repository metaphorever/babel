// Order vocabulary. An order is a sequence of tokens; each token is one word
// in one language. P0 starts with English only, but every order already
// records the language of each word so drift can slot in later.

export type LangId = 'en';

/** Verbs that produce or move goods. These can go on board notices. */
export type WorkVerb = 'MINE' | 'CHOP' | 'HARVEST' | 'COOK' | 'HAUL';
/** Verbs that control a scroll or move orders around. Scrolls only. */
export type FlowVerb = 'WRITE' | 'DELIVER' | 'REPEAT' | 'CHECK';
export type Verb = WorkVerb | FlowVerb;
export type Noun = 'STONE' | 'WOOD' | 'GRAIN' | 'BREAD' | 'BOARD';
export type TokenId = Verb | Noun;

export interface Token {
  t: TokenId;
  lang: LangId;
}

export type Order = Token[];

export const VERBS: readonly WorkVerb[] = ['MINE', 'CHOP', 'HARVEST', 'COOK', 'HAUL'];
export const NOUNS: readonly Noun[] = ['STONE', 'WOOD', 'GRAIN', 'BREAD'];

const WORDS: Record<LangId, Record<TokenId, string>> = {
  en: {
    MINE: 'mine',
    CHOP: 'chop',
    HARVEST: 'harvest',
    COOK: 'cook',
    HAUL: 'haul',
    WRITE: 'write',
    DELIVER: 'deliver',
    REPEAT: 'repeat',
    CHECK: 'check',
    STONE: 'stone',
    WOOD: 'wood',
    GRAIN: 'grain',
    BREAD: 'bread',
    BOARD: 'board',
  },
};

export function word(tok: Token): string {
  return WORDS[tok.lang][tok.t];
}

export function orderText(order: Order): string {
  return order.map((tok) => word(tok)).join(' ');
}

export function makeOrder(verb: Verb, noun: Noun | null = null, lang: LangId = 'en'): Order {
  const o: Order = [{ t: verb, lang }];
  if (noun) o.push({ t: noun, lang });
  return o;
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

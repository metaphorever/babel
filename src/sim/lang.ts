// Order vocabulary. An order is a sequence of tokens; each token is one word
// in one language. P0 starts with English only, but every order already
// records the language of each word so drift can slot in later.

export type LangId = 'en';

export type Verb = 'MINE' | 'CHOP' | 'HARVEST' | 'COOK' | 'HAUL';
export type Noun = 'STONE' | 'WOOD' | 'GRAIN' | 'BREAD';
export type TokenId = Verb | Noun;

export interface Token {
  t: TokenId;
  lang: LangId;
}

export type Order = Token[];

export const VERBS: readonly Verb[] = ['MINE', 'CHOP', 'HARVEST', 'COOK', 'HAUL'];
export const NOUNS: readonly Noun[] = ['STONE', 'WOOD', 'GRAIN', 'BREAD'];

const WORDS: Record<LangId, Record<TokenId, string>> = {
  en: {
    MINE: 'mine',
    CHOP: 'chop',
    HARVEST: 'harvest',
    COOK: 'cook',
    HAUL: 'haul',
    STONE: 'stone',
    WOOD: 'wood',
    GRAIN: 'grain',
    BREAD: 'bread',
  },
};

export function word(tok: Token): string {
  return WORDS[tok.lang][tok.t];
}

export function orderText(order: Order): string {
  return order.map((tok) => word(tok)).join(' ');
}

export function makeOrder(verb: Verb, noun: Noun, lang: LangId = 'en'): Order {
  return [
    { t: verb, lang },
    { t: noun, lang },
  ];
}

/** Which verb+noun pairs make sense as jobs in P0. */
export const VALID_JOBS: Record<Verb, readonly Noun[]> = {
  MINE: ['STONE'],
  CHOP: ['WOOD'],
  HARVEST: ['GRAIN'],
  COOK: ['BREAD'],
  HAUL: ['STONE', 'WOOD', 'GRAIN'],
};

export function isValidJob(verb: Verb, noun: Noun): boolean {
  return VALID_JOBS[verb].includes(noun);
}

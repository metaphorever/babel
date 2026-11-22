import type { LangId, Order, TokenId } from './lang';
import type { RngState } from './rng';
import type { Difficulty } from './tuning';

// Everything in SimState must be plain JSON (no Maps, Sets, classes or
// functions) so it can be saved, hashed and replayed.

export type ItemType = 'stone' | 'wood' | 'grain' | 'bread';
export const ITEM_TYPES: readonly ItemType[] = ['stone', 'wood', 'grain', 'bread'];

export const Tile = {
  Air: 0,
  Dirt: 1,
  Ladder: 2,
  Deck: 3,
  /** Stone wall of a tower story. Background only: workers walk past it. */
  Wall: 4,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export interface Pt {
  x: number;
  y: number;
}

export type SiteKind =
  | 'home'
  | 'forest'
  | 'field'
  | 'well'
  | 'kitchen'
  | 'beds'
  | 'board'
  | 'stockpile'
  | 'foundation'
  | 'tavern'
  | 'quarry'
  | 'scriptorium';

export interface Site {
  id: number;
  kind: SiteKind;
  label: string;
  x0: number; // inclusive
  x1: number; // inclusive
  /** Row workers stand on while using the site. */
  y: number;
  /** Tower level: 0 on the ground, n on floor n. */
  level: number;
  /** Stored goods (stockpile, larder). */
  store: Record<ItemType, number>;
}

export interface Item {
  id: number;
  type: ItemType;
  x: number;
  y: number;
  reservedBy: number | null;
}

export interface Notice {
  id: number;
  order: Order;
  /** Jobs left. Goes down when a job is finished, not when it's taken. */
  remaining: number;
  wage: number;
  /** null = Anyone, otherwise a worker id. */
  addressee: number | null;
  postedTick: number;
}

/** Where a written carrier is headed. */
export type Dest =
  /** Pinned on the board, for Anyone (null) or for one worker by name. */
  | { kind: 'board'; addressee: number | null }
  /** A blueprint, carried to the top of the tower to start the next floor. */
  | { kind: 'tower' }
  /** Handed straight to a worker. It replaces whatever they were doing. */
  | { kind: 'worker'; workerId: number };

/**
 * A physical object with orders written on it. A card holds one order; a
 * scroll holds several, carried out top to bottom. Each line has a count:
 * the units to finish before moving to the next line.
 *
 * A one-line card pinned on the board becomes a notice: anyone can read it
 * and take one job at a time from it, and it stays up until its count runs
 * out. Anything else on the board is taken down by whoever takes it.
 */
export interface Carrier {
  id: number;
  kind: 'card' | 'scroll' | 'blueprint';
  orders: Order[];
  /** Units to finish on each line before moving on. */
  counts: number[];
  /** Gold per unit of work. */
  wage: number;
  dest: Dest;
  /** Next line to carry out, and units done on it so far. */
  pc: number;
  lineDone: number;
  loops: number;
  /** Posted by the patron's standing charter rather than written by a scribe. */
  patron: boolean;
  /** Times the holder has hit a line they can't read. Too many and they give up on it. */
  strikes: number;
  /** After a failed line, the holder takes a breather before carrying on. */
  waitUntil: number;
  /** A courier who couldn't hand it over waits until then to try again. */
  retryAfter: number;
}

/** A carrier the player has composed, waiting in the scriptorium to be written out. */
export interface Design {
  id: number;
  carrier: Carrier;
  /** Writing time needed, in work units; a scribe adds their speed each tick. */
  cost: number;
  progress: number;
  claimedBy: number | null;
  postedTick: number;
}

/** Materials that go into a floor. */
export type BuildMaterial = 'stone' | 'wood';

/**
 * A floor under construction. It starts when a blueprint reaches the top of
 * the tower; builders bring materials up and set them in place from the
 * story below. When it's done, a ladder goes in and the floor is walkable.
 */
export interface Project {
  id: number;
  level: number;
  needs: Record<BuildMaterial, number>;
  placed: Record<BuildMaterial, number>;
}

export interface Job {
  noticeId: number;
  order: Order;
  wage: number;
}

export type SkillId = 'mining' | 'woodcutting' | 'farming' | 'cooking' | 'hauling' | 'writing' | 'building';

export type TraitId =
  | 'strong'
  | 'industrious'
  | 'lazy'
  | 'greedy'
  | 'glutton'
  | 'sleepyhead'
  | 'spendthrift'
  | 'frugal'
  | 'cheerful'
  | 'grumpy';

export interface Personality {
  work: number; // multiplier on wanting to work
  greed: number; // multiplier on wage appeal
  hunger: number; // multiplier on hunger rate
  fatigue: number; // multiplier on fatigue rate
  spend: number; // multiplier on tavern appeal
  moodBias: number; // flat mood offset
}

export interface Moodlet {
  kind: string;
  label: string;
  value: number;
  until: number;
}

export type ActivityKind =
  | 'idle'
  | 'wander'
  | 'eat'
  | 'drink'
  | 'sleep'
  | 'readBoard'
  | 'job'
  | 'scroll'
  | 'lesson'
  | 'tavern';

export interface Activity {
  kind: ActivityKind;
  stage: number;
  timer: number;
  target: Pt | null;
  /** The order as this worker read it (after any guessing), fixed for the rest of the job. */
  read: Order | null;
  /** Item id or site id, depending on the activity. */
  ref: number | null;
}

export interface Score {
  kind: ActivityKind;
  label: string;
  score: number;
}

export interface Worker {
  id: number;
  name: string;
  traits: TraitId[];
  p: Personality;

  x: number;
  y: number;
  path: Pt[];
  pathGoal: Pt | null;
  stepProgress: number;
  stepCost: number;
  facing: 1 | -1;

  hunger: number;
  thirst: number;
  fatigue: number;
  mood: number;
  moodlets: Moodlet[];

  purse: number;
  carrying: ItemType | null;
  /** How many of `carrying` are in their arms (0 when carrying nothing). */
  carryCount: number;

  /** XP per skill. Levels come from tuning SKILLS.levelXp. */
  skills: Record<SkillId, number>;
  /** The skill this worker has a natural knack for. */
  knack: SkillId;
  /** The one job held in mind (read from a board). Survives distractions. */
  memory: Job | null;
  /** Cards and scrolls in hand, carried out in order (the first one is active). */
  held: Carrier[];
  /** Written carriers this worker is carrying to deliver to someone else. */
  bag: Carrier[];
  /** Words this worker knows, per language. Drift moves words from one language to another. */
  vocab: Partial<Record<LangId, TokenId[]>>;
  /** Build-up from time spent high in the tower. When it fills, a word drifts. Hidden from the player. */
  exposure: number;
  /** The language this worker's words drift into, chosen the first time they drift. */
  driftTongue: LangId | null;
  /** 0..100: how badly they understand the orders they're carrying. */
  confusion: number;
  /** Notices this worker recently failed at and won't pick again for a while. */
  avoid: { noticeId: number; until: number }[];

  activity: Activity;
  nextThink: number;
  lastScores: Score[];
  thought: string;

  jobsDone: number;
  /** Ticks spent in a low mood (resets when mood recovers). */
  lowMoodTicks: number;
  /** When their notice runs out, if they've given notice. */
  noticeUntil: number | null;
  /** On their way home for good. */
  leaving: boolean;
  /** Look seed for the procedural sprite later. */
  look: number;
}

export interface GameEvent {
  tick: number;
  text: string;
  workerId: number | null;
}

export interface SimState {
  version: 6;
  seed: number;
  tick: number;
  rng: RngState;
  nextId: number;

  width: number;
  height: number;
  /** Row-major tiles, index = y * width + x. */
  tiles: number[];

  sites: Site[];
  items: Item[];
  workers: Worker[];
  notices: Notice[];
  /** Cards and scrolls pinned on the board for someone to take (notices live in `notices`). */
  boardScrolls: Carrier[];
  /** Written carriers left at the scriptorium for the next courier. */
  outbox: Carrier[];
  /** Words the player can write, per language. Grows through translation. */
  lexicon: Partial<Record<LangId, TokenId[]>>;
  /** Floors being built, lowest first. */
  projects: Project[];
  /** Highest finished floor (0 = just the ground). */
  floors: number;
  /** The scriptorium's writing queue. */
  designs: Design[];

  gold: number;
  /** The patron's patience, 0..100. Finished floors win it back. */
  patience: number;
  difficulty: Difficulty;
  nextStipend: number;
  nextArrival: number;
  /** Running totals, for the books (and the tests). */
  income: number;
  leftWith: number;
  /** Gold promised to posted notices but not yet paid. */
  reserved: number;

  events: GameEvent[];
}

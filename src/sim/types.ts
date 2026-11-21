import type { Order } from './lang';
import type { RngState } from './rng';

// Everything in SimState must be plain JSON (no Maps, Sets, classes or
// functions) so it can be saved, hashed and replayed.

export type ItemType = 'stone' | 'wood' | 'grain' | 'bread';
export const ITEM_TYPES: readonly ItemType[] = ['stone', 'wood', 'grain', 'bread'];

export const Tile = {
  Air: 0,
  Dirt: 1,
  Ladder: 2,
  Deck: 3,
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
  | 'quarry';

export interface Site {
  id: number;
  kind: SiteKind;
  label: string;
  x0: number; // inclusive
  x1: number; // inclusive
  /** Row workers stand on while using the site. */
  y: number;
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

export interface Job {
  noticeId: number;
  order: Order;
  wage: number;
}

export type SkillId = 'mining' | 'woodcutting' | 'farming' | 'cooking' | 'hauling';

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
  | 'tavern';

export interface Activity {
  kind: ActivityKind;
  stage: number;
  timer: number;
  target: Pt | null;
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
  /** Notices this worker recently failed at and won't pick again for a while. */
  avoid: { noticeId: number; until: number }[];

  activity: Activity;
  nextThink: number;
  lastScores: Score[];
  thought: string;

  jobsDone: number;
  /** Look seed for the procedural sprite later. */
  look: number;
}

export interface GameEvent {
  tick: number;
  text: string;
  workerId: number | null;
}

export interface SimState {
  version: 1;
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

  gold: number;
  /** Gold promised to posted notices but not yet paid. */
  reserved: number;

  events: GameEvent[];
}

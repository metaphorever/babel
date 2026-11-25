import type { LangId, Order, TokenId } from './lang';
import type { RngState } from './rng';
import type { Difficulty } from './tuning';

// Everything in SimState must be plain JSON (no Maps, Sets, classes or
// functions) so it can be saved, hashed and replayed.

export type ItemType = 'stone' | 'wood' | 'grain' | 'bread' | 'beer';
export const ITEM_TYPES: readonly ItemType[] = ['stone', 'wood', 'grain', 'bread', 'beer'];

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

/** Natural features: placed when the map is made, never built or removed. */
export type NatureKind = 'home' | 'forest' | 'field' | 'well' | 'quarry';
/**
 * Fixtures: fixed in place inside a building or a tower room (stockpiles
 * can also stand outside). Ladders go only in the tower: each one climbs
 * from its room up to the floor above.
 */
export type FixtureKind = 'bed' | 'oven' | 'pantry' | 'brewery' | 'bar' | 'stockpile' | 'shelves' | 'ladder';
export const FIXTURE_KINDS: readonly FixtureKind[] = ['bed', 'oven', 'pantry', 'brewery', 'bar', 'stockpile', 'shelves', 'ladder'];
/** Fixtures that store stone, wood and grain. */
export const STORAGE_KINDS: readonly FixtureKind[] = ['stockpile', 'shelves'];

export type SiteKind = NatureKind | FixtureKind | 'board' | 'foundation' | 'scriptorium';

/** Materials that go into anything built. */
export type BuildMaterial = 'stone' | 'wood';

/**
 * Something being built, or taken down. Builders bring materials and set
 * them in place one unit at a time; demolishers take it apart one unit at a
 * time and leave half the materials on the ground.
 */
export interface Works {
  needs: Record<BuildMaterial, number>;
  placed: Record<BuildMaterial, number>;
  /** Work units done taking it apart (demolition only). */
  undone: number;
  /** When it was planned (or marked for demolition): builders work oldest first. */
  since: number;
}

export interface Site {
  id: number;
  kind: SiteKind;
  /** What it's called: "Stockpile 3", or the name the player gave it. */
  label: string;
  /**
   * Fixtures: a permanent number per kind, given when it's placed and never
   * changed, so orders written on paper keep meaning the same thing. The
   * lowest free number is reused. 0 for everything else (and the broken
   * oven, and the patron's supplies).
   */
  num: number;
  /** The player renamed it (label is their name, not "Stockpile 3"). */
  named: boolean;
  x0: number; // inclusive
  x1: number; // inclusive
  /** Row workers stand on while using the site. */
  y: number;
  /** As a place in orders: 0 is the base (anywhere off the tower), n is tower floor n. */
  level: number;
  /** Stored goods (stockpile, pantry, bar). */
  store: Record<ItemType, number>;
  /** Most goods it can hold, all kinds together. null = no limit; 0 = it never takes deliveries. */
  capacity: number | null;
  /** Bars: what a beer costs here, if the player set it (otherwise ECONOMY.beerPrice). */
  price?: number;
  /** The building it stands in, or null outdoors. */
  buildingId: number | null;
  /** Still being built (null once finished). */
  build: Works | null;
  /** Marked for demolition. */
  demolish: Works | null;
  /** Broken and useless, like the oven in the old shack. */
  broken: boolean;
  /** The patron's starting supplies: a pile to take from, never to add to. */
  supplies: boolean;
}

/** A building: an empty shell that fixtures go in. One or two stories. */
export interface Building {
  id: number;
  kind: 'house' | 'shack';
  name: string;
  x0: number;
  x1: number;
  stories: 1 | 2;
  build: Works | null;
  demolish: Works | null;
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
  spend: number; // multiplier on the bar's appeal
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
  | 'bar';

export interface Activity {
  kind: ActivityKind;
  stage: number;
  timer: number;
  target: Pt | null;
  /** The order as this worker read it (after any guessing), fixed for the rest of the job. */
  read: Order | null;
  /** Item id or site id, depending on the activity. */
  ref: number | null;
  /** What a builder is working toward (a building or site id), so others can see what's on its way. */
  aim: number | null;
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
  /** How this worker feels about each other worker, by id: 0..1 (see SOCIAL in tuning). Hidden; the labels show. */
  feel: Record<number, number>;
  /** How they first felt about each (their natural chemistry): feelings drift back toward it. */
  feelBase: Record<number, number>;
  /** 0..1: how strongly they hold to one partner. Low means open to more than one, and fine with a partner who is. */
  monogamy: number;
  /** Little things they do that others have opinions on. */
  habits: HabitId[];
  /** What they think of each habit in others, -1 (can't stand it) to 1 (loves it). */
  tastes: Record<HabitId, number>;
  /** Their latest social moments, newest first: what they'd gossip about. */
  lately: SocialMemory[];
}

export type HabitId = 'whistles' | 'sings' | 'stories' | 'snores';

/** Something that happened between two workers, as one of them remembers it. */
export interface SocialMemory {
  /** Who it was about. */
  about: number;
  /** How it sat with them: 1 good, -1 bad. */
  tone: 1 | -1;
  /** A phrase that reads after "about": "Rejun snoring all night". */
  what: string;
  tick: number;
  /** Heard secondhand, from this worker (and not passed on again). */
  heardFrom?: number;
  /** Badmouthing: who was badmouthed. If the rememberer gets to tell them, it can be the last straw. */
  target?: number;
}

/**
 * A lasting tie between two workers. For a parent tie, a is the parent and
 * b the child. Friendships aren't ties: they're read off the feelings.
 */
export interface Tie {
  kind: 'spouse' | 'lover' | 'parent';
  a: number;
  b: number;
  /** Parent ties: by birth (rolled only when the child is created) or by marriage. */
  bio?: boolean;
  /** Lover ties: kept from a partner who wouldn't approve, until found out. */
  secret?: boolean;
  /** Spouse and lover ties: the dawn one of them fell below the line. One day's grace, then it ends. */
  strained?: number | null;
}

export type PairLabel = '' | 'enemies' | 'frenemies' | 'friends' | 'good friends' | 'best friends';

export interface SocialState {
  /** The social web's own dice, so relationships never shift the rest of the sim's rolls. */
  rng: RngState;
  ties: Tie[];
  /** Each pair's label as of the last check, keyed "lo:hi" by worker id, so changes can be logged. */
  labels: Record<string, PairLabel>;
  /** Parent-child pairs estranged as of the last dawn ("parent:child"). */
  estranged: string[];
  /** When statuses are next checked (each dawn). */
  nextDawn: number;
  /** Who finished recent notices, so a worker beaten to one knows whom to blame. */
  takers: { notice: number; by: number }[];
  /** Today's shared-time warmth so far, per "from>to" pair (capped daily), and pairs who've already come to blows today. Cleared at dawn. */
  today: Record<string, number>;
}

export interface GameEvent {
  tick: number;
  text: string;
  workerId: number | null;
}

/** How a new game starts: the P1 opening (nothing built yet), or a colony already laid out (tests, quick playtests). */
export type StartMode = 'opening' | 'prebuilt';

export interface SimState {
  version: 11;
  start: StartMode;
  seed: number;
  tick: number;
  rng: RngState;
  nextId: number;

  width: number;
  height: number;
  /** Row-major tiles, index = y * width + x. */
  tiles: number[];

  sites: Site[];
  buildings: Building[];
  /** The tower's footprint, once the player has chosen it. It never moves. */
  tower: { x0: number; x1: number } | null;
  /** The patron's charter, decreed once the scriptorium and first board are built. */
  charter: boolean;
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
  /** Until this tick the patron's patience doesn't drain, unless floor 1 is finished sooner. */
  graceUntil: number;
  nextStipend: number;
  nextArrival: number;
  /** Running totals, for the books (and the tests). */
  income: number;
  leftWith: number;
  /** Gold workers have spent at the bar, back into the treasury. */
  takings: number;
  /** Gold promised to posted notices but not yet paid. */
  reserved: number;

  events: GameEvent[];
  /** Who feels what about whom: families, couples, friends and enemies. */
  social: SocialState;
  /** Gold workers have sent home to their families (gone from the colony for good). */
  sentHome: number;
}

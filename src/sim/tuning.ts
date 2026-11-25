// Every balance number lives here so tuning never means hunting through logic.
// Time unit: sim ticks. TICKS_PER_SECOND ticks = one real second at 1x speed.

export const TICKS_PER_SECOND = 20;

export const TIME = {
  /** One day: 5 real minutes at 1x speed. */
  dayTicks: 6000,
  /** Tick 0 is this hour on day 1: just after dawn, in full daylight. Each new day starts (and the patron pays) at this hour. */
  startHour: 7,
};

/** Tallest tower the world has room for (the patron's goals go beyond this later). */
const MAX_FLOORS = 30;
const FLOOR_HEIGHT = 4; // tiles per story: a deck plus three rows of headroom

export const WORLD = {
  width: 192,
  groundRow: 8 + MAX_FLOORS * FLOOR_HEIGHT, // first solid row
  height: 8 + MAX_FLOORS * FLOOR_HEIGHT + 16,
};

export const TOWER = {
  maxFloors: MAX_FLOORS,
  floorHeight: FLOOR_HEIGHT,
  /** Width of every floor, in tiles. The player picks where it stands. */
  width: 16,
  /** Materials to build one floor: stone for the walls of the story below, wood for the deck and ladder. */
  stonePerFloor: 8,
  woodPerFloor: 6,
  /** Work ticks to set one unit of material in place. */
  buildTicks: 30,
  /** Writing a blueprint takes this long (in scribe work units). */
  blueprintCost: 220,
  /** Each finished floor gets a small stockpile on its deck: this far in from the left wall, this wide. */
};

/**
 * What a kind of fixture costs, how wide it is (fixtureWidth if not given),
 * and the lowest story it can go on (0 = the ground floor; 1 = the floor
 * above, upstairs in a building or tower floor 1). Some later fixtures,
 * like the pulley lift, only make sense higher up.
 */
export interface FixtureSpec {
  cost: { stone: number; wood: number };
  width?: number;
  minStory?: number;
}

/** The map, made fresh for each new game (P1). Widths are in tiles. */
export const MAP = {
  /** The road home always runs off the left edge. */
  roadWidth: 4,
  /**
   * The right edge: the road to far-away lands, where the trader will come in
   * and pilgrims leave (DESIGN.md §16). Nothing is built there. Wide enough for
   * the wagon (9) with room to spare.
   */
  reservedRight: 12,
  forest: 12,
  quarry: 16,
  field: 12,
  well: 2,
  shack: 6,
  /** Wide enough for the supply wagon's art (70 px). */
  supplies: 9,
  /** Clear ground left between features. */
  minGap: 3,
};

/**
 * Everything the player can place. Sizes in tiles, costs in units of
 * material. Generic buildings are wooden shells: their cost grows with
 * width and stories.
 */
export const BUILD = {
  scriptorium: { width: 6, cost: { stone: 4, wood: 6 } },
  board: { width: 2, cost: { stone: 0, wood: 2 } },
  /** The first board stands this many tiles right of the scriptorium (next to its door). */
  boardGap: 1,
  house: { minWidth: 3, maxWidth: 16, defaultWidth: 6, woodPerTilePerStory: 1, stonePerStory: 0, maxName: 24 },
  /** Every fixture is two tiles wide. */
  fixtureWidth: 2,
  fixtures: {
    bed: { cost: { stone: 0, wood: 2 } },
    oven: { cost: { stone: 4, wood: 0 } },
    pantry: { cost: { stone: 0, wood: 2 } },
    brewery: { cost: { stone: 1, wood: 2 } },
    bar: { cost: { stone: 0, wood: 3 } },
    /** A stockpile is just marked-out ground (or floor): free, and ready at once. */
    stockpile: { cost: { stone: 0, wood: 0 } },
    /** Storage shelves: indoors only (a building or a tower room), and they hold twice what a stockpile does. */
    shelves: { cost: { stone: 0, wood: 3 } },
    /** A ladder: tower rooms only, one tile wide, from its room up through the deck above. */
    ladder: { cost: { stone: 0, wood: 2 }, width: 1 },
  } as Record<'bed' | 'oven' | 'pantry' | 'brewery' | 'bar' | 'stockpile' | 'shelves' | 'ladder', FixtureSpec>,
  /** How much a fixture holds. A stockpile holds the same anywhere; shelves hold twice as much. */
  capacity: { pantry: 20, bar: 12, stockpile: 24, shelves: 48 },
  /** Work ticks to set one unit of material in place, or take one apart. */
  unitTicks: 30,
  /** Demolishing gives back this share of what went in (rounded down). */
  salvage: 0.5,
  /** The patron's starting supplies. */
  supplies: { stone: 20, wood: 30, grain: 10, bread: 24, beer: 0 },
};

/** Fixtures in the order they're offered. */
export const FIXTURE_LABEL = {
  bed: 'Bed',
  oven: 'Oven',
  pantry: 'Pantry',
  brewery: 'Brewing station',
  bar: 'Bar',
  stockpile: 'Stockpile',
  shelves: 'Storage shelves',
  ladder: 'Ladder',
} as const;

export const MOVE = {
  walkTicksPerTile: 4,
  ladderTicksPerTile: 9,
  carryingSlowdown: 2, // extra ticks per tile while carrying something
};

/** Needs run 0 (fine) .. 100 (desperate). Rates are per tick. */
export const NEEDS = {
  hungerRate: 0.014,
  thirstRate: 0.02,
  fatigueRate: 0.011,
  eatAmount: 60,
  eatTicks: 40,
  drinkAmount: 70,
  drinkTicks: 25,
  sleepRecoverBed: 0.3,
  sleepRecoverGround: 0.15,
  wakeBelow: 5,
  /** Needs below this don't register as wants at all. */
  noticeThreshold: 25,
};

export const WORK = {
  mineTicks: 70,
  chopTicks: 60,
  harvestTicks: 50,
  cookTicks: 80,
  readBoardTicks: 15,
  pickupTicks: 6,
  dropTicks: 6,
  breadPerGrain: 2,
  /** After failing a notice, a worker won't pick it again for this long. */
  avoidTicks: 1200,
  /** Board pick weight = (base + wage * greed)^2. Higher base = wages matter less. */
  boardWeightBase: 1,
  wanderRange: 10,
  idleTicks: 40,
};

export const SCRIBE = {
  /** Writing cost of a carrier: base + per token. */
  baseCost: 40,
  perToken: 25,
  /** A word the scribe doesn't know costs this many times more (you spell it out letter by letter). */
  unknownWordMult: 4,
  /** Work units a scribe adds per tick: 1 + level * perLevel. */
  speedPerLevel: 0.15,
  /** Carriers a courier's bag holds. */
  bagSize: 10,
  /** A courier hands over from this many tiles away (calling out the name). */
  handRange: 2,
  /** After a failed handover, wait this long before trying again. */
  retryTicks: 600,
  /** After a failed line, the holder waits this long before going on. */
  lineRetryTicks: 300,
  maxLines: 6,
  /** Hit this many unreadable lines on a scroll and the holder gives up on it. */
  giveUpAfter: 3,
  /** Extra pull of a scroll in hand over free time (it's an obligation). */
  duty: 8,
};

export const DRIFT = {
  /** Workers on this floor or higher build up exposure. */
  lineFloor: 3,
  /** Exposure per tick at the drift line, and extra per floor above it. */
  rate: 0.08,
  ratePerFloor: 0.03,
  /** On the ground, exposure fades this much per tick. */
  decay: 0.02,
  /** A word drifts each time exposure reaches this. */
  threshold: 100,
};

export const CONFUSION = {
  /** Added when a worker can't read their order at all. */
  unreadable: 25,
  /** Added per word they had to guess. */
  perGuess: 8,
  /** Fades this much per tick. */
  decay: 0.01,
  /** Above this, it drags their mood down. */
  moodAbove: 40,
  moodPenalty: 10,
};

export const LESSON = {
  /** Work units to pass on one word; a translator adds their speed each tick. */
  perWord: 120,
  /** Extra speed per language the translator knows well (5+ words). */
  speedPerLanguage: 0.25,
  /** How hard a called student wants to come to their lesson. */
  pull: 48,
};

export type Difficulty = 'easy' | 'normal' | 'hard';

export const PATRON = {
  /** How often the standing charter checks whether anyone is writing. */
  charterCheckTicks: 100,
  /** The patron pays a stipend each dawn, scaled by their patience. */
  stipendPerDay: 250,
  /** Patience runs 0..100 and drains steadily; difficulty is how fast. */
  patienceStart: 100,
  patienceDrain: { easy: 0.0035, normal: 0.006, hard: 0.01 } as Record<Difficulty, number>,
  /** A finished floor wins back this much patience, plus a gold bonus. */
  floorPatience: 35,
  floorBonusBase: 40,
  floorBonusPerLevel: 10,
  /** Below this patience, the patron stops sending newcomers. */
  recruitAbove: 50,
  /** Days of grace at the start: patience doesn't drain until then, or until floor 1 is done. */
  graceDays: 2,
  /**
   * Other construction wins back patience at about half the tower's rate,
   * per unit of material (a floor is 14 units for 35 patience). It can't
   * lift patience above otherBuildCap, so it can't replace the tower.
   */
  otherBuildPerUnit: 1.25,
  otherBuildCap: 75,
};

export const QUIT = {
  /** Mood below this for long enough and a worker gives notice. */
  lowMood: 30,
  sustainTicks: 1200,
  /** Notice period before they walk home. */
  noticeTicks: 2400,
  /** During their notice, mood above this and they decide to stay. */
  stayAbove: 40,
};

export const ARRIVALS = {
  /** How often a newcomer may turn up on the road. */
  every: 2400,
  /** Population the patron aims for: start + this many per finished floor (up to the cap). */
  perFloor: 1,
};

export const ECONOMY = {
  startingGold: 400,
  /** What a beer costs unless the player sets a bar's price. The bar is the colony's, so it goes back to the treasury. */
  beerPrice: 5,
  /** The price the player can set at a bar, from free up to this. */
  beerPriceMax: 20,
  /** Each gold under the usual price makes a beer this much more cheering (and each gold over, less), down to barMoodMin. */
  barMoodPerGold: 1,
  barMoodMin: 3,
  barTicks: 120,
  /** A beer also takes the edge off thirst. */
  beerQuench: 30,
  /** One grain brews this many beers. */
  beerPerGrain: 2,
  brewTicks: 90,
};

/** Utility AI weights. Scores are compared directly; highest wins. */
export const AI = {
  thinkInterval: 20, // re-evaluate at least this often
  inertia: 12, // bonus for whatever the worker is already doing
  workBase: 30,
  wageWeight: 5, // per gold of wage, times the worker's greed
  needScale: 1.3, // multiplier on (need^2 / 100)
  barPerGold: 1.2,
  barCap: 55,
  barMoodWeight: 0.35,
  /** Right after a drink (while its moodlet lasts), the bar appeals this much less: they've had their fill for now. */
  barAfterDrink: 0.35,
  wanderBase: 8,
  noise: 4, // random jitter on each candidate so equal workers differ
  /** Before the scriptorium is placed, workers mill around and only sleep if they're this tired. */
  openingSleepAbove: 80,
};

export const SKILLS = {
  /** XP needed for each level; index = level. One work action = 1 XP. */
  levelXp: [0, 5, 15, 30, 55, 90],
  /** Each level adds this chance of a bonus unit per work action. */
  bonusPerLevel: 0.12,
  bonusCap: 0.6,
  /** Hauling level that adds one to carry capacity. */
  haulExtraAtLevel: 3,
  /** Knack skill: starting XP and XP multiplier. */
  knackStartXp: 15,
  knackXpMult: 1.6,
  /** Board pick appeal per skill level in that job (people like what they're good at). */
  pickPerLevel: 0.4,
  /** How far a hauler will range from their first pickup to fill their arms. */
  gatherRange: 6,
};

export const MOOD = {
  base: 55,
  smoothing: 0.02, // fraction per tick toward target
  hungryPenalty: 12, // need above 70
  thirstyPenalty: 12,
  tiredPenalty: 10,
  /** Extra once a need passes 90: starving, parched, exhausted. */
  desperatePenalty: { hunger: 22, thirst: 22, fatigue: 12 },
  ateBread: { value: 6, ticks: 2400 },
  sleptInBed: { value: 6, ticks: 3000 },
  sleptOnGround: { value: -8, ticks: 3000 },
  bar: { value: 12, ticks: 3600 },
  gotPaid: { value: 2, ticks: 600 },
  /** Missed job: penalty = base + wage * perWage, capped. */
  missedJobBase: 2,
  missedJobPerWage: 3,
  missedJobCap: 20,
  missedJobTicks: 1800,
  failedJob: { value: -3, ticks: 900 },
  /** Had to pick materials up off the ground: they'd rather take from a stockpile. */
  scavenged: { value: -3, ticks: 1200 },
};

export const POPULATION = {
  start: 8,
  cap: 30,
};

/**
 * Relationships. Every worker feels something about every other, 0..1,
 * rolled when they're created and moved by what happens (drinking and
 * eating together, so far). The feelings name themselves; pairs get a label
 * from both sides; family and couples are ties rolled on top.
 */
export const SOCIAL = {
  /** Feeling lines, as fractions of 0..1. 0.3 to 0.5 is a neutral gap with no word. */
  hates: 0.1,
  dislikes: 0.3,
  likes: 0.5,
  fond: 0.7,
  adores: 0.85,
  /**
   * Rolling feelings: a bell curve around feelMean, feelSpread wide (one
   * standard deviation, before sharing). Each pair shares part of the
   * roll, so feelings tend to run both ways. With 8 workers (28 pairs)
   * this gives about 4 friendships, 1 good one, half a pair of enemies and
   * 1 odd pair of frenemies; romance warms a couple more.
   */
  feelMean: 0.38,
  feelSpread: 0.26,
  shared: 0.55,
  /** Cheerful people are easier to like, grumpy ones harder: added to what others feel about them. */
  traitPull: { cheerful: 0.06, grumpy: -0.06 } as Record<string, number>,
  /** Monogamy is rolled as rand^this: under 1 leans most people monogamous. */
  monogamySkew: 0.5,
  /** Below this, a worker is open to more than one partner (and fine with a partner who is). */
  openBelow: 0.4,
  /** At world generation: rounds of romance, each changing the odds for the next. */
  gen: {
    rounds: 3,
    /** Chance per round that a pair at the "likes" line becomes lovers, rising to 4x at "adores". */
    lover: 0.07,
    /** Chance per round that lovers marry. */
    marryLovers: 0.3,
    /** Chance per round that a pair who like each other but aren't lovers marry anyway (a tenth of marriages or so). */
    marryFriends: 0.004,
    /** Becoming lovers warms both sides by this much. */
    loverWarmth: 0.1,
    /** Each partner they already have multiplies the odds of another by this... */
    morePartners: 0.25,
    /** ...and so does being monogamous (scaled: 1 - monogamy, at least this). */
    monogamousFloor: 0.08,
    /** Chance that a couple has a grown child among the workers (rolled again for a second, at half). */
    childOfCouple: 0.45,
    /** Chance that a worker is the grown child of one other worker alone. */
    childOfOne: 0.05,
  },
  /** Each dawn, for every pair. */
  dawn: {
    lover: 0.01,
    marryLovers: 0.02,
    marryFriends: 0.001,
    /** Chance that a monogamous partner finds out about a secret lover. */
    discover: 0.12,
    /** Finding out: how much it costs with the one who cheated, and with the other lover. */
    betrayed: 0.35,
    rival: 0.4,
  },
  /** A newcomer may be the grown child of a couple already here, or of one worker. */
  arrival: { childOfCouple: 0.15, childOfOne: 0.04 },
  /** Feeling nudges from things that happen. */
  event: {
    /** Each person you finish a drink beside, how much warmer you feel about them. */
    drankTogether: 0.005,
    ateTogether: 0.0025,
    /** "Beside": within this many tiles. */
    near: 4,
    /**
     * Shared time has diminishing returns: drinks, meals, songs, snoring
     * and help can move one worker's feeling about another by at most this
     * much a day, either way. One-off events (scuffles, gossip, lessons,
     * grudges) aren't capped. A pair can only come to blows once a day.
     */
    dailyCap: 0.02,
  },
  /**
   * Each dawn, every feeling drifts this share of the way back toward how
   * that worker first felt about the other (their natural chemistry), so
   * what's happened fades unless something keeps it up. 0.05 a day: about
   * two weeks to fade halfway. Becoming lovers moves the starting point
   * itself, and a betrayal moves it half as far as the blow.
   */
  drift: 0.05,
  /** Habits: little things workers do, and what everyone else thinks of them. */
  habits: {
    /** Chance of having none, one or two. */
    count: [0.45, 0.4, 0.15],
    /** What people tend to think of each (-1..1); each worker's taste is rolled around it. */
    lean: { whistles: 0, sings: 0.1, stories: 0.3, snores: -0.5 } as Record<string, number>,
    spread: 0.6,
    /** A taste this strong either way is remembered (and gossiped about). */
    strong: 0.4,
    /** One dose (a night of snoring, a song at the bar, a job finished whistling) moves feeling by taste times this. */
    dose: 0.006,
  },
  /** Enemies drinking side by side may come to blows. */
  scuffle: { chance: 0.3, mood: -8, moodTicks: 3000, sour: 0.04, thanks: 0.03 },
  /** Work: beaten to a job, or helped with one. Industrious workers resent lazy helpers. Help is common, so only some of it sticks in memory. */
  job: { beatMe: 0.03, help: 0.006, lazyHelp: -0.006, remember: 0.15 },
  /** Purses: greedy workers resent those this much richer; frugal ones are impressed. */
  wealth: { gap: 15, jealous: 0.008, admire: 0.006 },
  /** Each word taught warms teacher and student to each other. */
  lessonWord: 0.008,
  /** A friend (or an enemy) beside you over a drink or a meal. */
  company: { friend: 3, enemy: -3, ticks: 2400 },
  /** When a worker quits: a spouse may go too; those close are sad, those who hated them glad. */
  leaving: { follow: 0.5, missed: -8, glad: 3, ticks: 4800 },
  /** How many recent moments a worker keeps in mind. */
  remember: 4,
  /**
   * Gossip: finishing a drink or a meal beside someone, a worker may tell
   * them their latest moment. A complaint makes the listener take a side,
   * by whom they like better; praise warms them to its subject, unless they
   * can't stand that person.
   */
  gossip: { chance: 0.3, maxAge: TIME.dayTicks * 2, side: 0.03, pile: 0.015, bond: 0.01 },
};

/**
 * Remittances: at dawn, a worker with a full purse sends a good share of it
 * home to their family. It cheers them, takes the gold out of the colony
 * (it doesn't come back to the treasury), and leaves them reason to work.
 * Frugal workers send sooner and more; spendthrifts later and less.
 */
export const REMIT = {
  /** A purse this full gets sent home: the usual, frugal, spendthrift. */
  fullAt: { usual: 40, frugal: 25, spendthrift: 80 },
  /** The share of the purse that goes. */
  share: { usual: 0.6, frugal: 0.8, spendthrift: 0.4 },
  /** The moodlet: this much plus this much per gold sent, up to a cap, for a day. */
  mood: { base: 4, perGold: 0.15, max: 12 },
  moodTicks: TIME.dayTicks,
};

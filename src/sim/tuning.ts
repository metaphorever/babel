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
  stockpileInset: 6,
  stockpileWidth: 5,
};

/** The map, made fresh for each new game (P1). Widths are in tiles. */
export const MAP = {
  /** The road home always runs off the left edge. */
  roadWidth: 4,
  /** The right edge is reserved for something not decided yet. Nothing goes there. */
  reservedRight: 8,
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
    /** Storage shelves: indoors only, and they hold twice what a stockpile does. */
    shelves: { cost: { stone: 0, wood: 3 } },
  },
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
  /** A worker pays this for a beer at the bar. The bar is the colony's, so it goes back to the treasury. */
  beerPrice: 5,
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
  wanderBase: 8,
  noise: 4, // random jitter on each candidate so equal workers differ
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

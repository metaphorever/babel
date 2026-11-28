// Every balance number lives here so tuning never means hunting through logic.
// Time unit: sim ticks. TICKS_PER_SECOND ticks = one real second at 1x speed.

export const TICKS_PER_SECOND = 20;

export const TIME = {
  /** One day: 5 real minutes at 1x speed. */
  dayTicks: 6000,
  /** Tick 0 is this hour on day 1: just after dawn, in full daylight. Each new day starts (and the patron pays) at this hour. */
  startHour: 7,
};

const FLOOR_HEIGHT = 4; // tiles per story: a deck plus three rows of headroom

/**
 * The map: sky above, the ground below. Its height follows the patron's
 * goal (mapHeight), with room above the goal so "Keep Playing" has
 * somewhere to go.
 */
export const WORLD = {
  width: 192,
  /** Rows of sky above the tallest tower the map has room for. */
  above: 8,
  /** Rows of ground under the surface. */
  below: 16,
  /** Room above the goal: this share of it, at least headroomMin levels (30 → 33, 1,000 → 1,100). */
  headroom: 0.1,
  headroomMin: 3,
};

/** Levels of tower a map made for this goal has room for. */
export function towerRoomFor(goal: number): number {
  return goal + Math.max(WORLD.headroomMin, Math.round(goal * WORLD.headroom));
}

/** Rows in a map made for this goal. */
export function mapHeight(goal: number): number {
  return WORLD.above + towerRoomFor(goal) * FLOOR_HEIGHT + WORLD.below;
}

export const TOWER = {
  /** The patron's goal before the New Game screen (§16.9 step 8): what createState(seed) and old saves get. */
  goal: 30,
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
  /** Buildings come in whole blocks (a block is 16 px, two tiles): widthStep is the block. */
  house: { minWidth: 4, maxWidth: 16, widthStep: 2, defaultWidth: 6, woodPerTilePerStory: 1, stonePerStory: 0, maxName: 24 },
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
    /** Shelves: indoors only (a building or a tower room), and they hold twice what a stockpile does. */
    shelves: { cost: { stone: 0, wood: 3 } },
    /** A ladder: tower rooms only, a full block (two tiles) wide like every fixture, from its room up through the deck above. */
    ladder: { cost: { stone: 0, wood: 2 } },
    /** Hauling equipment: built on open ground, then pushed about it. A store that moves. */
    wheelbarrow: { cost: { stone: 0, wood: 3 } },
    cart: { cost: { stone: 0, wood: 6 }, width: 4 },
  } as Record<'bed' | 'oven' | 'pantry' | 'brewery' | 'bar' | 'stockpile' | 'shelves' | 'ladder' | 'wheelbarrow' | 'cart', FixtureSpec>,
  /** How much a fixture holds. A stockpile holds the same anywhere; shelves hold twice as much. */
  capacity: { pantry: 20, bar: 12, stockpile: 24, shelves: 48, wheelbarrow: 8, cart: 20 },
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
  brewery: 'Brewery',
  bar: 'Bar',
  stockpile: 'Stockpile',
  shelves: 'Shelves',
  ladder: 'Ladder',
  wheelbarrow: 'Wheelbarrow',
  cart: 'Cart',
} as const;

export const MOVE = {
  walkTicksPerTile: 4,
  ladderTicksPerTile: 9,
  carryingSlowdown: 2, // extra ticks per tile while carrying something
  /** Extra ticks per tile pushing a wheelbarrow or cart (instead of the carrying slowdown): slower than walking, but it holds far more. */
  pushSlowdown: { wheelbarrow: 3, cart: 5 },
  /** Loading or unloading a wheelbarrow or cart: ticks per unit of goods. */
  loadTicksPerUnit: 4,
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
  /** IF and OTHERWISE take a line each, so a scroll with a branch in it needs the room. */
  maxLines: 8,
  /** Hit this many unreadable lines on a scroll and the holder gives up on it. */
  giveUpAfter: 3,
  /** Extra pull of a scroll in hand over free time (it's an obligation). */
  duty: 8,
};

/** Conditions, WAIT and UNTIL (the logic words). */
export const LOGIC = {
  /**
   * A store can be read from this many tiles away on the same level; any
   * further and the worker walks over to look. State lives in the world:
   * finding out costs a walk (flags, later, are the way round that).
   */
  lookRange: 6,
  /** "Hungry" and "tired" mean at least this hungry or tired (the same point where they say so). */
  hungryAt: 55,
  tiredAt: 65,
  /** The hour each time word starts. Each names the 6 hours that follow it: dawn is 6:00 to noon. */
  timeOfDay: { DAWN: 6, NOON: 12, DUSK: 18, MIDNIGHT: 0 },
  /** WAIT's count is in hours. */
  waitMaxHours: 48,
};

/**
 * Drift scales with the patron's goal (§16.9 step 8; the user approved
 * Claude's proposal): it starts at about a tenth of the goal and climbs to
 * its fastest at the goal, where it levels off. Against a goal of 30 that's
 * what it always was: from Tower Level 4 (level 3, counting the ground as
 * 0), 0.08 a tick there and 0.03 more per level, up to 0.89 on the roof of
 * the 30th. driftLine and driftRate in drift.ts work it out.
 */
export const DRIFT = {
  /** Workers at this share of the goal or higher (rounded, at least level 1) build up exposure. */
  lineShare: 0.1,
  /** Exposure per tick at the drift line... */
  rate: 0.08,
  /** ...climbing evenly to this at the goal, and no faster above it. */
  rateAtGoal: 0.89,
  /** Each language opens once the tower is this share of the goal tall (French at 3 and Greek at 5 of 30). Greek always after French. */
  langShare: { fr: 0.1, el: 1 / 6 } as Record<'fr' | 'el', number>,
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

/** The difficulty presets. "Medium" on the New Game screen is 'normal'. */
export type Difficulty = 'easy' | 'normal' | 'hard';
/** What the New Game screen offers: a preset, your own knobs, or the sandbox. */
export type DifficultyChoice = Difficulty | 'custom' | 'sandbox';

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

/**
 * Quitting (the user, 2026-11-26). Mood below the line and a worker is fed
 * up: they show it at once. At the end of that shift (dawn, noon, dusk,
 * midnight) it becomes notice, and they leave at the end of their notice
 * unless their mood is back at the line.
 */
export const QUIT = {
  /** The quit line: below it, fed up; back at it, they stay. */
  lowMood: 30,
  /** Fed up for less than this when a shift ends and it waits for the next one, so the bubble always comes first. */
  minFedUpTicks: 300,
  /** Notice, in shifts (a shift is a quarter of a day): easy a whole day, normal 2 shifts, hard 1. */
  noticeShifts: { easy: 4, normal: 2, hard: 1 } as Record<Difficulty, number>,
};

/** What a worker thinks fair pay for a job is: this many gold a unit, times their greed. Less is "low wages". */
export const PAY = {
  fair: 1.2,
  /** Mood lost per gold short of fair, up to lowMax, for lowTicks. */
  perGoldShort: 3,
  lowMax: 8,
  lowTicks: 1500,
};

/**
 * A bonus: a letter with gold in it, written by a scribe and handed over by
 * a courier (§16.9 step 3). The lift lands at once, and lasts a day. It's
 * sized by the gold against their purse (a full purse is less impressed) and
 * their greed, but never less than leastPerGold, so 100 gold lifts anyone at
 * least 30: back to the quit line from rock bottom.
 */
export const BONUS = {
  /** Mood per gold for a worker with an empty purse and ordinary greed. */
  perGold: 0.6,
  /** A purse this full halves it (perGold × purseRef / (purseRef + purse)). */
  purseRef: 40,
  /** However full their purse, at least this much a gold. */
  leastPerGold: 0.3,
  /** The most one bonus, or several stacked, can lift them. */
  max: 45,
  ticks: TIME.dayTicks,
  /** The most one letter can carry. */
  maxGold: 500,
  /** Writing a letter takes this long (scribe work units; a one-line card is about 90). */
  writeCost: 60,
};

/** Working a long stretch without a real break (a meal, a drink, sleep, a wander) wears on them. */
export const OVERWORK = {
  /** Ticks of work before it starts to tell (2 shifts). */
  after: 3000,
  /** Each tick of a break takes this much off the stretch; sleep wipes it. */
  restPerTick: 25,
  /** Mood lost per tick past `after`, up to max. */
  perTick: 1 / 150,
  max: 15,
};

/** Complaints fade with a half-life of about a shift (1500 ticks): 0.5^(1/1500). */
export const GRIEVANCE_DECAY = 0.99953802;

/** Alerts (§16.9 step 5). */
export const ALERTS = {
  /** The patron's patience falling to each of these raises one. */
  patienceAt: [50, 25, 0],
  /** How often supplies are counted. */
  supplyCheckTicks: 100,
  /** The default alert line per good: under 1 means all gone. */
  supplyBelow: 1,
  /** The highest alert line the Stores window lets you set. */
  supplyBelowMax: 999,
  /** Back this far above the line before the same good can raise another (so a pantry hovering at 0 doesn't nag). */
  supplyRearm: 5,
  /** The score: levels × this ÷ days played, plus the treasury's gold (the user, session 10: 10,000 so speed leads and gold mostly breaks ties). */
  scorePerLevel: 10000,
  /** After a "can't pay wages" alert, none again for this long (half a day). */
  wagesQuietTicks: TIME.dayTicks / 2,
};

export const ARRIVALS = {
  /** How often the patron may send a newcomer up the road, by difficulty (2400 is 0.4 of a day). */
  every: { easy: 1800, normal: 2400, hard: 3600 } as Record<Difficulty, number>,
  /** Population the patron aims for: start + this many per finished floor (up to the cap). */
  perFloor: 1,
};

/**
 * Recruiting a worker yourself (§16.9 step 4): no order, paid at once, and
 * they walk in from the road. The fee is perSquare × the headcount you'd have
 * with them, so a 9th worker costs 1,215 and a lone survivor's company 60.
 * Not past POPULATION.cap.
 */
export const RECRUIT = {
  perSquare: 15,
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
  /** Getting paid: a little for any pay, more for more (perGold), up to max; it lasts longer too. */
  gotPaid: { value: 2, ticks: 600, perGold: 0.5, max: 12, ticksPerGold: 20, maxTicks: 3000 },
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
 * rolled when they're created and moved by what happens.
 *
 * Tuned for drama (session 4, the user: "more interpersonal drama is
 * better unless it gets in the way of work; start big, tune down later"):
 * common things (help with work, whistling) are weak, and what happens
 * once a day or less (a drink together, gossip, a scuffle, a grudge) is
 * strong. Gossip can carry a rumor of badmouthing back to its target (the
 * last straw). Measured with npm run sim:month (12 workers, 30 days):
 * about 2.3 label changes a day, warming and cooling evenly, 13
 * friendships formed and 8 ended, about 2 falling-outs and 5 last straws a
 * month, 15% of changes flipping back, and no change to work done or mood;
 * still stable at 60 days. See DESIGN.md 15.13.
 *
 * The feelings name themselves; pairs get a label from both sides; family
 * and couples are ties rolled on top.
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
  /**
   * Temperament: each worker's warmth, touchiness and forgiveness is
   * 2^(spread x a bell curve), so about two in three fall between 0.66 and
   * 1.5, and one in twenty beyond 0.44 or 2.3. Traits lean it: cheerful
   * workers warmer and harder to offend, grumpy ones the other way.
   * Beyond "shows" (or under its inverse), the worker window names it:
   * about half the workers get a word. Measured over a month: the
   * warmest third end with about 1.75 times the friends of the coolest,
   * the touchiest about 1.5 times the foes of the thickest-skinned.
   */
  temper: {
    spread: 0.6,
    traits: {
      cheerful: { warmth: 1.25, touchiness: 0.8 },
      grumpy: { warmth: 0.75, touchiness: 1.25, forgiveness: 0.8 },
    } as Record<string, Partial<Record<'warmth' | 'touchiness' | 'forgiveness', number>>>,
    shows: 1.75,
  },
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
    lover: 0.04,
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
    drankTogether: 0.06,
    ateTogether: 0.03,
    /** "Beside": within this many tiles. */
    near: 4,
    /**
     * Shared time has diminishing returns: drinks, meals, songs, snoring
     * and help can move one worker's feeling about another by at most this
     * much a day, either way. One-off events (scuffles, gossip, lessons,
     * grudges) aren't capped. A pair can only come to blows once a day.
     */
    dailyCap: 0.1,
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
    /** One dose (a night of snoring, a song at the bar, a job finished whistling) moves feeling by taste times this... */
    dose: 0.06,
    /** ...times this per habit: whistling is heard at every finished job, so each dose counts for less. */
    weight: { whistles: 0.15, sings: 1, stories: 1, snores: 1 } as Record<string, number>,
  },
  /** Bad blood drinking side by side may come to blows: both feel below bothBelow about each other, and one below oneBelow. */
  scuffle: { chance: 0.6, bothBelow: 0.35, oneBelow: 0.2, mood: -8, moodTicks: 3000, sour: 0.3, thanks: 0.15 },
  /** Work: beaten to a job, or helped with one. Industrious workers resent lazy helpers. Help is common, so only some of it sticks in memory. */
  job: { beatMe: 0.15, help: 0.001, lazyHelp: -0.02, remember: 0.15 },
  /** Purses: greedy workers resent those this much richer; frugal ones are impressed. */
  wealth: { gap: 15, jealous: 0.08, admire: 0.06 },
  /** Each word taught warms teacher and student to each other. */
  lessonWord: 0.04,
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
  gossip: {
    chance: 0.7,
    maxAge: TIME.dayTicks * 2,
    side: 0.2,
    pile: 0.12,
    bond: 0.06,
    /**
     * The last straw: someone who heard a worker badmouthed tells the one
     * badmouthed. They turn on the badmouther this hard (and part of it,
     * lastStrawBase, never fades), and warm a little to whoever told them.
     */
    lastStraw: 0.45,
    lastStrawBase: 0.2,
    toldMe: 0.05,
    /** Juicy news keeps: a badmouthing is the last thing forgotten, and can be passed to its target for this long. */
    rumorDays: 7,
    /** People talk at work too: finishing a job beside someone, the chance of telling them the latest. */
    atWork: 0.1,
  },
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

/**
 * The New Game screen (§16.9 step 8). The presets take their numbers from
 * the tables above (PATRON, QUIT, ARRIVALS, ...), so Medium is the game as
 * it was. Custom and Sandbox open every knob, within these limits.
 */
export const NEW_GAME = {
  goals: [
    { label: 'Small', levels: 20 },
    { label: 'Medium', levels: 50 },
    { label: 'Large', levels: 100 },
    { label: 'Monumental', levels: 250 },
    { label: 'Infinite', levels: 1000 },
  ],
  /** The screen's first choice of goal: the closest to the 30 every playtest so far has had. */
  defaultGoal: 20,
  /** Custom knobs: lowest and highest the screen takes. */
  limits: {
    stipend: [0, 5000],
    /** Patience points lost a day (the sim keeps it per tick). */
    patiencePerDay: [0, 100],
    quitBelow: [0, 60],
    noticeShifts: [1, 12],
    /** Starting goods, times the usual. */
    supplies: [0, 10],
    gold: [0, 100000],
    /** Hours between the patron's chances to send a newcomer (0: never). */
    arrivalHours: [0, 240],
    recruitFee: [0, 500],
    /** Drift speed, times the usual (0: no drift). */
    driftSpeed: [0, 5],
    workers: [1, 30],
  } as Record<string, [number, number]>,
  /** The sandbox: Easy's knobs, plenty of gold, and stores the patron keeps full. */
  sandbox: { gold: 5000, refillTicks: 100 },
};

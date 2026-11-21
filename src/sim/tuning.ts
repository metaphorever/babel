// Every balance number lives here so tuning never means hunting through logic.
// Time unit: sim ticks. TICKS_PER_SECOND ticks = one real second at 1x speed.

export const TICKS_PER_SECOND = 20;

export const WORLD = {
  width: 128,
  height: 64,
  groundRow: 48, // first solid row
};

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

export const ECONOMY = {
  startingGold: 400,
  tavernCost: 5,
  tavernTicks: 120,
};

/** Utility AI weights. Scores are compared directly; highest wins. */
export const AI = {
  thinkInterval: 20, // re-evaluate at least this often
  inertia: 12, // bonus for whatever the worker is already doing
  workBase: 30,
  wageWeight: 5, // per gold of wage, times the worker's greed
  needScale: 1.3, // multiplier on (need^2 / 100)
  tavernPerGold: 1.2,
  tavernCap: 55,
  tavernMoodWeight: 0.35,
  wanderBase: 8,
  noise: 4, // random jitter on each candidate so equal workers differ
  boardPickNoise: 3,
};

export const MOOD = {
  base: 55,
  smoothing: 0.02, // fraction per tick toward target
  hungryPenalty: 12, // need above 70
  thirstyPenalty: 12,
  tiredPenalty: 10,
  ateBread: { value: 6, ticks: 2400 },
  sleptInBed: { value: 6, ticks: 3000 },
  sleptOnGround: { value: -8, ticks: 3000 },
  tavern: { value: 12, ticks: 3600 },
  gotPaid: { value: 2, ticks: 600 },
  /** Missed job: penalty = base + wage * perWage, capped. */
  missedJobBase: 2,
  missedJobPerWage: 3,
  missedJobCap: 20,
  missedJobTicks: 1800,
  failedJob: { value: -3, ticks: 900 },
};

export const POPULATION = {
  start: 8,
  cap: 30,
  beds: 6,
};

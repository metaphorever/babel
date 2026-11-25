import { updateWorker } from './ai';
import { startActivity } from './activities';
import { log } from './actions';
import { pinNotice, scribeLoop } from './carriers';
import { allWords } from './drift';
import { checkCharter, updatePatron } from './patron';
import { removeDeparted } from './morale';
import { applyCommand, validateCommand, type Command, type CommandResult, type StampedCommand } from './commands';
import { makeOrder, type Noun, type WorkVerb } from './lang';
import { makeName } from './names';
import { nextU32, pick, rand, seedRng } from './rng';
import { emptySkills, SKILL_IDS } from './skills';
import { rollPersonality } from './traits';
import { AI, ARRIVALS, ECONOMY, PATRON, POPULATION, SKILLS, TIME, type Difficulty } from './tuning';
import type { FixtureKind, SimState, StartMode, Worker } from './types';
import { fixedMap, generateMap, groundRow, sitesOf } from './world';
import { applyPlace, campJobs, finishNow, type PlaceRequest } from './build';
import { generateSocial, newSocial, rollHabits, rollMonogamy, updateSocial } from './social';

/**
 * A new game. 'opening' is the real start (P1): a fresh random map with
 * nothing built, the patron's supplies, and workers waiting by the road.
 * 'prebuilt' lays out a working colony the way P0 had it, for the tests and
 * for quick playtests (?start=prebuilt).
 */
export function createState(seed: number, difficulty: Difficulty = 'normal', start: StartMode = 'prebuilt'): SimState {
  const s: SimState = {
    version: 11,
    start,
    seed,
    tick: 0,
    rng: seedRng(seed),
    nextId: 1,
    width: 0,
    height: 0,
    tiles: [],
    sites: [],
    buildings: [],
    tower: null,
    charter: false,
    items: [],
    workers: [],
    notices: [],
    designs: [],
    boardScrolls: [],
    outbox: [],
    lexicon: { en: allWords() },
    projects: [],
    floors: 0,
    gold: ECONOMY.startingGold,
    patience: PATRON.patienceStart,
    difficulty,
    graceUntil: start === 'opening' ? TIME.dayTicks * PATRON.graceDays : 0,
    nextStipend: TIME.dayTicks,
    nextArrival: ARRIVALS.every,
    income: 0,
    leftWith: 0,
    takings: 0,
    reserved: 0,
    events: [],
    social: newSocial(seed),
    sentHome: 0,
  };
  if (start === 'opening') {
    generateMap(s);
    for (let i = 0; i < POPULATION.start; i++) addWorker(s);
    generateSocial(s);
    // the first worker has a gift for letters: they'll be your first scribe
    const scribe = s.workers[0];
    scribe.knack = 'writing';
    scribe.skills = emptySkills();
    scribe.skills.writing = SKILLS.knackStartXp;
    s.events = [];
    log(s, 'Your workers have arrived. Choose where to build the scriptorium.');
    return s;
  }
  prebuild(s);
  for (let i = 0; i < POPULATION.start; i++) addWorker(s);
  generateSocial(s);

  // The patron left a few notices up so the ground is busy from the start.
  const starter: [WorkVerb, Noun, number, number][] = [
    ['MINE', 'STONE', 20, 2],
    ['HAUL', 'STONE', 20, 2],
    ['HARVEST', 'GRAIN', 10, 2],
    ['HAUL', 'GRAIN', 10, 1],
    ['COOK', 'BREAD', 16, 1],
  ];
  for (const [verb, noun, count, wage] of starter) {
    pinNotice(s, makeOrder(verb, noun), count, wage, null);
    s.reserved += count * wage;
  }

  // The patron's charter: the one order the player didn't have to write.
  // It hires the first scribe and sets them on the writing loop.
  const scribe = s.workers[0];
  scribe.knack = 'writing';
  scribe.skills = emptySkills();
  scribe.skills.writing = SKILLS.knackStartXp;
  const charter = scribeLoop(s, { kind: 'worker', workerId: scribe.id }, true);
  scribe.held.push(charter);
  s.events = [];
  log(s, `The patron's charter names ${scribe.name} your scribe. Their loop: write, deliver, repeat.`, scribe.id);
  return s;
}

/**
 * The prebuilt colony, laid out much as P0 had it: a kitchen (oven and
 * pantry), a bunkhouse with six beds, the scriptorium and board, two
 * stockpiles with the patron's gift, the tower site, and a bar with a
 * brewing station. Everything is finished from the start.
 */
function prebuild(s: SimState): void {
  fixedMap(s);
  s.charter = true; // set before the scriptorium finishes, so it doesn't decree it again
  const place = (p: PlaceRequest) => applyPlace(s, p);
  const fixture = (fixture: FixtureKind, x0: number) => place({ what: 'fixture', fixture, x0, story: 0 });
  const finishAll = () => {
    for (let guard = 0; guard < 100; guard++) {
      const j = campJobs(s).find((x) => !x.demolish);
      if (!j) break;
      finishNow(s, j);
    }
  };
  place({ what: 'scriptorium', x0: 58 });
  place({ what: 'tower', x0: 74 });
  place({ what: 'house', x0: 38, width: 6, stories: 1, name: 'Kitchen' });
  place({ what: 'house', x0: 45, width: 12, stories: 1, name: 'Bunkhouse' });
  place({ what: 'house', x0: 92, width: 6, stories: 1, name: 'Tavern' });
  finishAll();
  fixture('oven', 38);
  fixture('pantry', 40);
  for (let i = 0; i < 6; i++) fixture('bed', 45 + i * 2);
  fixture('stockpile', 68);
  fixture('stockpile', 70);
  fixture('brewery', 92);
  fixture('bar', 94);
  finishAll();
  sitesOf(s, 'pantry')[0].store.bread = 16;
  sitesOf(s, 'bar')[0].store.beer = 12;
  // the patron's gift: enough to start
  const [a, b] = sitesOf(s, 'stockpile');
  a.store.stone = 10;
  a.store.grain = 10;
  b.store.wood = 8;
  // the patron's builders from placing the scriptorium aren't needed: it's already built
  for (const w of s.workers) w.held = [];
  s.events = [];
}

export function addWorker(s: SimState): Worker {
  const { traits, p } = rollPersonality(s.rng);
  const w: Worker = {
    id: s.nextId++,
    name: makeName(s.rng, s.workers.map((o) => o.name)),
    traits,
    p,
    x: spawnX(s),
    y: groundRow(),
    path: [],
    pathGoal: null,
    stepProgress: 0,
    stepCost: 0,
    facing: rand(s.rng) < 0.5 ? 1 : -1,
    hunger: rand(s.rng) * 30,
    thirst: rand(s.rng) * 30,
    fatigue: rand(s.rng) * 30,
    mood: 55,
    moodlets: [],
    purse: 0,
    carrying: null,
    carryCount: 0,
    vocab: { en: allWords() },
    exposure: 0,
    driftTongue: null,
    confusion: 0,
    skills: emptySkills(),
    knack: pick(s.rng, SKILL_IDS),
    memory: null,
    held: [],
    bag: [],
    avoid: [],
    activity: { kind: 'idle', stage: 0, timer: 0, target: null, ref: null, read: null, aim: null },
    nextThink: Math.floor(rand(s.rng) * AI.thinkInterval),
    lastScores: [],
    thought: '',
    jobsDone: 0,
    lowMoodTicks: 0,
    noticeUntil: null,
    leaving: false,
    look: nextU32(s.rng),
    feel: {},
    feelBase: {},
    monogamy: rollMonogamy(s),
    ...rollHabits(s),
    lately: [],
  };
  w.skills[w.knack] = SKILLS.knackStartXp;
  startActivity(w, 'idle');
  s.workers.push(w);
  return w;
}

/** Where a worker first appears: near the patron's supplies at the opening, by the bunkhouse when prebuilt. */
function spawnX(s: SimState): number {
  const pile = s.sites.find((x) => x.supplies);
  if (pile) return Math.max(0, Math.min(s.width - 1, pile.x0 - 6 + Math.floor(rand(s.rng) * 16)));
  return 44 + Math.floor(rand(s.rng) * 16);
}

/** Advance one tick, applying any commands first. */
export function step(s: SimState, cmds: readonly Command[] = []): CommandResult[] {
  const results = cmds.map((c) => applyCommand(s, c));
  checkCharter(s);
  updatePatron(s);
  updateSocial(s);
  const departed: Worker[] = [];
  for (const w of s.workers) if (updateWorker(s, w)) departed.push(w);
  removeDeparted(s, departed);
  s.tick++;
  return results;
}

/** FNV-1a over the JSON state. Used by the determinism tests. */
export function hashState(s: SimState): string {
  const str = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Owns a state plus the queue of commands waiting for the next tick and the
 * full command history (enough to replay the session from the seed).
 */
export class Sim {
  state: SimState;
  history: StampedCommand[] = [];
  private pending: Command[] = [];

  constructor(seed: number, difficulty: Difficulty = 'normal', start: StartMode = 'opening') {
    this.state = createState(seed, difficulty, start);
  }

  /** Check a command now so the UI can show errors, then queue it. */
  enqueue(cmd: Command): CommandResult {
    const v = validateCommand(this.state, cmd);
    if (v.ok) this.pending.push(cmd);
    return v;
  }

  step(): void {
    const cmds = this.pending;
    this.pending = [];
    for (const c of cmds) this.history.push({ tick: this.state.tick, cmd: c });
    step(this.state, cmds);
  }
}

/** Rebuild a game from its seed and command history. */
export function replay(seed: number, history: readonly StampedCommand[], ticks: number, difficulty: Difficulty = 'normal', start: StartMode = 'opening'): SimState {
  const s = createState(seed, difficulty, start);
  let i = 0;
  while (s.tick < ticks) {
    const cmds: Command[] = [];
    while (i < history.length && history[i].tick === s.tick) cmds.push(history[i++].cmd);
    step(s, cmds);
  }
  return s;
}

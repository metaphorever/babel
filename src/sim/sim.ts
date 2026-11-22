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
import { AI, ARRIVALS, ECONOMY, PATRON, POPULATION, SKILLS, type Difficulty } from './tuning';
import type { SimState, Worker } from './types';
import { buildWorld, siteOf } from './world';

export function createState(seed: number, difficulty: Difficulty = 'normal'): SimState {
  const s: SimState = {
    version: 6,
    seed,
    tick: 0,
    rng: seedRng(seed),
    nextId: 1,
    width: 0,
    height: 0,
    tiles: [],
    sites: [],
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
    nextStipend: PATRON.stipendEvery,
    nextArrival: ARRIVALS.every,
    income: 0,
    leftWith: 0,
    reserved: 0,
    events: [],
  };
  buildWorld(s);
  siteOf(s, 'kitchen').store.bread = 16;
  // the patron's gift: enough to start
  const base = siteOf(s, 'stockpile');
  base.store.grain = 10;
  base.store.stone = 10;
  base.store.wood = 8;
  for (let i = 0; i < POPULATION.start; i++) addWorker(s);

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

export function addWorker(s: SimState): Worker {
  const { traits, p } = rollPersonality(s.rng);
  const w: Worker = {
    id: s.nextId++,
    name: makeName(s.rng, s.workers.map((o) => o.name)),
    traits,
    p,
    x: 44 + Math.floor(rand(s.rng) * 16),
    y: siteOf(s, 'beds').y,
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
    activity: { kind: 'idle', stage: 0, timer: 0, target: null, ref: null, read: null },
    nextThink: Math.floor(rand(s.rng) * AI.thinkInterval),
    lastScores: [],
    thought: '',
    jobsDone: 0,
    lowMoodTicks: 0,
    noticeUntil: null,
    leaving: false,
    look: nextU32(s.rng),
  };
  w.skills[w.knack] = SKILLS.knackStartXp;
  startActivity(w, 'idle');
  s.workers.push(w);
  return w;
}

/** Advance one tick, applying any commands first. */
export function step(s: SimState, cmds: readonly Command[] = []): CommandResult[] {
  const results = cmds.map((c) => applyCommand(s, c));
  checkCharter(s);
  updatePatron(s);
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

  constructor(seed: number, difficulty: Difficulty = 'normal') {
    this.state = createState(seed, difficulty);
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
export function replay(seed: number, history: readonly StampedCommand[], ticks: number, difficulty: Difficulty = 'normal'): SimState {
  const s = createState(seed, difficulty);
  let i = 0;
  while (s.tick < ticks) {
    const cmds: Command[] = [];
    while (i < history.length && history[i].tick === s.tick) cmds.push(history[i++].cmd);
    step(s, cmds);
  }
  return s;
}

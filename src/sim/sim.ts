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
import { checkAlerts, goodsOut } from './alerts';
import { AI, ALERTS, PATRON, SKILLS, TIME, type DifficultyChoice } from './tuning';
import type { FixtureKind, GameSettings, ItemType, SimState, StartMode, Worker } from './types';
import { fixedMap, generateMap, groundRow, sitesOf } from './world';
import { gameSettings } from './settings';
import { newProject, placeMaterial } from './tower';
import { applyPlace, campJobs, finishNow, type PlaceRequest } from './build';
import { generateSocial, newSocial, rollHabits, rollMonogamy, rollTemper, updateSocial } from './social';

/** The shape of SimState. Bump it (and SimState's `version`) when that changes, with a step in save.ts's MIGRATIONS. */
export const STATE_VERSION = 13 as const;

/** What a new game is made with: a difficulty (and starting camp), or the New Game screen's full settings. */
export type GameSpec = DifficultyChoice | GameSettings;

function specSettings(spec: GameSpec, start: StartMode): GameSettings {
  return typeof spec === 'string' ? gameSettings(spec, start) : gameSettings(spec.difficulty, spec.start, spec);
}

/**
 * A new game. 'opening' is the real start (P1): a fresh random map with
 * nothing built, the patron's supplies, and workers waiting by the road.
 * 'prebuilt' lays out a working colony the way P0 had it, for the tests and
 * for quick playtests (?start=prebuilt); 'large' a bigger one. With no
 * settings it's Medium, the small camp, and a goal of 30, as it always was.
 */
export function createState(seed: number, spec: GameSpec = 'normal', startMode: StartMode = 'prebuilt'): SimState {
  const settings = specSettings(spec, startMode);
  const { start } = settings;
  const s: SimState = {
    version: STATE_VERSION,
    settings,
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
    gold: settings.gold,
    patience: PATRON.patienceStart,
    graceUntil: start === 'opening' ? TIME.dayTicks * PATRON.graceDays : 0,
    nextStipend: TIME.dayTicks,
    // never, with no arrivals (a huge number rather than Infinity, which JSON can't hold)
    nextArrival: settings.arrivalEvery > 0 ? settings.arrivalEvery : Number.MAX_SAFE_INTEGER,
    income: 0,
    leftWith: 0,
    takings: 0,
    reserved: 0,
    events: [],
    alerts: [],
    won: false,
    alertBelow: { stone: ALERTS.supplyBelow, wood: ALERTS.supplyBelow, grain: ALERTS.supplyBelow, bread: ALERTS.supplyBelow, beer: ALERTS.supplyBelow },
    supplyOut: [],
    wagesQuietUntil: 0,
    gone: null,
    social: newSocial(seed),
    sentHome: 0,
  };
  if (start === 'opening') {
    generateMap(s);
    for (let i = 0; i < settings.workers; i++) addWorker(s);
    generateSocial(s);
    // the first worker has a gift for letters: they'll be your first scribe
    const scribe = s.workers[0];
    scribe.knack = 'writing';
    scribe.skills = emptySkills();
    scribe.skills.writing = SKILLS.knackStartXp;
    s.supplyOut = goodsOut(s);
    s.events = [];
    log(s, 'Your workers have arrived. Choose where to build the scriptorium.');
    return s;
  }
  if (start === 'large') prebuildLarge(s);
  else prebuild(s);
  if (settings.towerLevels > 0) buildTowerTo(s, settings.towerLevels);
  for (let i = 0; i < settings.workers; i++) addWorker(s);
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
  s.supplyOut = goodsOut(s);
  s.events = [];
  log(s, `The patron's charter names ${scribe.name} your scribe. Their loop: write, deliver, repeat.`, scribe.id);
  return s;
}

/**
 * The prebuilt colony, laid out much as P0 had it: a kitchen (oven and
 * pantry), a bunkhouse with six beds, the scriptorium and board, two
 * stockpiles with the patron's gift, the tower site, and a bar with a
 * brewery. Everything is finished from the start.
 */
function prebuild(s: SimState): void {
  const { place, fixture, finishAll, stock } = camp(s);
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
  stock(sitesOf(s, 'pantry')[0], { bread: 16 });
  stock(sitesOf(s, 'bar')[0], { beer: 12 });
  // the patron's gift: enough to start
  const [a, b] = sitesOf(s, 'stockpile');
  stock(a, { stone: 10, grain: 10 });
  stock(b, { wood: 8 });
  // the patron's builders from placing the scriptorium aren't needed: it's already built
  for (const w of s.workers) w.held = [];
  s.events = [];
}

/** Tools for laying out a finished camp on the fixed map. */
function camp(s: SimState) {
  fixedMap(s);
  s.charter = true; // set before the scriptorium finishes, so it doesn't decree it again
  const place = (p: PlaceRequest) => applyPlace(s, p);
  const fixture = (fixture: FixtureKind, x0: number, story = 0) => place({ what: 'fixture', fixture, x0, story });
  const finishAll = () => {
    for (let guard = 0; guard < 200; guard++) {
      const j = campJobs(s).find((x) => !x.demolish);
      if (!j) break;
      finishNow(s, j);
    }
  };
  /** Starting goods, times the game's supplies setting (never past what the store holds). */
  const stock = (site: { store: Record<ItemType, number>; capacity: number | null }, goods: Partial<Record<ItemType, number>>) => {
    for (const [k, n] of Object.entries(goods) as [ItemType, number][]) {
      const room = site.capacity === null ? Infinity : site.capacity - Object.values(site.store).reduce((a, b) => a + b, 0);
      site.store[k] += Math.max(0, Math.min(room, Math.round(n * s.settings.supplies)));
    }
  };
  return { place, fixture, finishAll, stock };
}

/**
 * The large camp (§16.9 step 8, Claude's layout): the small camp's
 * buildings made bigger, and more of them. A kitchen with two ovens, a
 * second, two-story bunkhouse (17 beds in all), a tavern with two bars and
 * a pantry, a storehouse of shelves, a wheelbarrow and a cart, and more of
 * everything stocked. The tower site is chosen but nothing is built on it,
 * as in the small camp.
 */
function prebuildLarge(s: SimState): void {
  const { place, fixture, finishAll, stock } = camp(s);
  place({ what: 'scriptorium', x0: 58 });
  place({ what: 'tower', x0: 74 });
  place({ what: 'house', x0: 38, width: 6, stories: 1, name: 'Kitchen' });
  place({ what: 'house', x0: 45, width: 12, stories: 1, name: 'Bunkhouse' });
  place({ what: 'house', x0: 92, width: 12, stories: 1, name: 'Tavern' });
  place({ what: 'house', x0: 138, width: 10, stories: 1, name: 'Storehouse' });
  place({ what: 'house', x0: 150, width: 12, stories: 2, name: 'Bunkhouse 2' });
  finishAll();
  fixture('oven', 38);
  fixture('pantry', 40);
  fixture('oven', 42);
  for (let i = 0; i < 6; i++) fixture('bed', 45 + i * 2);
  fixture('stockpile', 68);
  fixture('stockpile', 70);
  fixture('brewery', 92);
  fixture('bar', 94);
  fixture('brewery', 98);
  fixture('bar', 100);
  fixture('pantry', 102);
  for (let i = 0; i < 5; i++) fixture('shelves', 138 + i * 2);
  for (let i = 0; i < 6; i++) fixture('bed', 150 + i * 2);
  for (let i = 0; i < 5; i++) fixture('bed', 152 + i * 2, 1);
  fixture('wheelbarrow', 105);
  fixture('cart', 125);
  finishAll();
  for (const p of sitesOf(s, 'pantry')) stock(p, { bread: 16 });
  for (const b of sitesOf(s, 'bar')) stock(b, { beer: 12 });
  const [a, b] = sitesOf(s, 'stockpile');
  stock(a, { stone: 12, grain: 12 });
  stock(b, { wood: 16 });
  const shelves = sitesOf(s, 'shelves');
  stock(shelves[0], { stone: 30 });
  stock(shelves[1], { wood: 30 });
  stock(shelves[2], { grain: 30 });
  for (const w of s.workers) w.held = [];
  s.events = [];
}

/**
 * The sandbox's tower, already built to a level: each floor finished and a
 * ladder up from every level below the top, quietly (no patron's bonus, no
 * alerts). Ladders alternate sides so the climb zigzags.
 */
function buildTowerTo(s: SimState, levels: number): void {
  if (!s.tower) return;
  const { gold, patience, income } = s;
  for (let k = 1; k <= levels; k++) {
    const p = newProject(s, k);
    s.projects.push(p);
    while (p.placed.stone < p.needs.stone) placeMaterial(s, p, 'stone');
    while (p.placed.wood < p.needs.wood) placeMaterial(s, p, 'wood');
  }
  for (let k = 0; k < s.floors; k++) applyPlace(s, { what: 'fixture', fixture: 'ladder', x0: k % 2 === 0 ? s.tower.x0 + 2 : s.tower.x1 - 3, story: k });
  // every ladder at once (one at a time would look through every site each time: slow at a thousand levels)
  for (const j of campJobs(s)) if (!j.demolish) finishNow(s, j);
  Object.assign(s, { gold, patience, income });
  s.alerts = [];
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
    y: groundRow(s),
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
    fedUpSince: null,
    noticeUntil: null,
    leaving: false,
    look: nextU32(s.rng),
    feel: {},
    feelBase: {},
    monogamy: rollMonogamy(s),
    ...rollHabits(s),
    lately: [],
    temper: { warmth: 1, touchiness: 1, forgiveness: 1 },
  };
  w.skills[w.knack] = SKILLS.knackStartXp;
  w.temper = rollTemper(s, w);
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
  checkAlerts(s);
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

  /** A new game from a seed and its settings (or a difficulty and start), or a game already under way. */
  constructor(seed: number | SimState, spec: GameSpec = 'normal', start: StartMode = 'opening') {
    this.state = typeof seed === 'number' ? createState(seed, spec, start) : seed;
  }

  /** A game loaded from a save. Its command history starts over: a replay from the seed alone can't reach it. */
  static fromState(state: SimState): Sim {
    return new Sim(state);
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
export function replay(seed: number, history: readonly StampedCommand[], ticks: number, spec: GameSpec = 'normal', start: StartMode = 'opening'): SimState {
  const s = createState(seed, spec, start);
  let i = 0;
  while (s.tick < ticks) {
    const cmds: Command[] = [];
    while (i < history.length && history[i].tick === s.tick) cmds.push(history[i++].cmd);
    step(s, cmds);
  }
  return s;
}

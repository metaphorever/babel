import { addMoodlet, dropCarried, log, moveTo, settle } from './actions';
import { ALL, FOREVER, isSpecialCount, isWorkVerb, orderText, parseOrder, placeName, type Noun, type Order, type Place, type Verb, type WorkVerb } from './lang';
import { carrierText } from './carriers';
import { attendLesson, giveCarrier, runScroll, scrollLineDone, scrollLineFailed, unreadableLine } from './scrolls';
import { addConfusion, knows, readOrder } from './drift';
import { rand, randInt } from './rng';
import { carryCapacity, expectedUnits, practice, rollYield, SKILL_LABEL, SKILL_OF_VERB, skillLevel } from './skills';
import { ECONOMY, MOOD, NEEDS, POPULATION, SCRIBE, SKILLS, TOWER, WORK } from './tuning';
import type { ActivityKind, BuildMaterial, Carrier, Item, ItemType, Notice, SimState, SiteKind, SkillId, Worker } from './types';
import { siteOf, spotFor, standable, stockpileOn, stockpiles } from './world';
import { activeProject, buildSpot, placeMaterial } from './tower';

export type Result = 'running' | 'done' | 'failed';

export function startActivity(w: Worker, kind: ActivityKind): void {
  w.activity = { kind, stage: 0, timer: 0, target: null, ref: null, read: null };
}

export function runActivity(s: SimState, w: Worker): Result {
  switch (w.activity.kind) {
    case 'idle':
      return idle(s, w);
    case 'wander':
      return wander(s, w);
    case 'eat':
      return eat(s, w);
    case 'drink':
      return drink(s, w);
    case 'sleep':
      return sleep(s, w);
    case 'readBoard':
      return readBoard(s, w);
    case 'tavern':
      return tavern(s, w);
    case 'scroll':
      return runScroll(s, w);
    case 'lesson':
      return attendLesson(s, w);
    case 'job':
      return job(s, w);
  }
}

// ---------------------------------------------------------------- free time

function idle(s: SimState, w: Worker): Result {
  if (settle(s, w)) return 'running';
  const a = w.activity;
  if (a.stage === 0) {
    a.timer = WORK.idleTicks;
    a.stage = 1;
    w.thought = w.memory ? 'Hmm...' : 'Nothing to do.';
  }
  return --a.timer <= 0 ? 'done' : 'running';
}

function wander(s: SimState, w: Worker): Result {
  const a = w.activity;
  if (a.stage === 0) {
    for (let i = 0; i < 8; i++) {
      const x = w.x + randInt(s.rng, -WORK.wanderRange, WORK.wanderRange);
      if (standable(s, x, w.y)) {
        a.target = { x, y: w.y };
        break;
      }
    }
    if (!a.target) return 'done';
    a.stage = 1;
    w.thought = pickWanderThought(rand(s.rng));
  }
  const m = moveTo(s, w, a.target!);
  return m === 'moving' ? 'running' : 'done';
}

function pickWanderThought(r: number): string {
  if (r < 0.25) return 'Stretching my legs.';
  if (r < 0.5) return 'Just looking around.';
  if (r < 0.75) return 'That tower will be tall one day.';
  return 'La la la.';
}

// ------------------------------------------------------------------- needs

function eat(s: SimState, w: Worker): Result {
  const a = w.activity;
  const kitchen = siteOf(s, 'kitchen');
  if (a.stage === 0) {
    w.thought = 'Hungry. Off to the kitchen.';
    const m = moveTo(s, w, spotFor(kitchen, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable' || kitchen.store.bread <= 0) {
      w.thought = 'No bread!';
      return 'failed';
    }
    kitchen.store.bread--;
    a.stage = 1;
    a.timer = WORK.pickupTicks + NEEDS.eatTicks;
    w.thought = 'Eating bread.';
  }
  if (--a.timer > 0) return 'running';
  w.hunger = Math.max(0, w.hunger - NEEDS.eatAmount);
  addMoodlet(s, w, 'ate', 'Ate bread', MOOD.ateBread.value, MOOD.ateBread.ticks);
  return 'done';
}

function drink(s: SimState, w: Worker): Result {
  const a = w.activity;
  if (a.stage === 0) {
    w.thought = 'Thirsty.';
    const m = moveTo(s, w, spotFor(siteOf(s, 'well'), w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return 'failed';
    a.stage = 1;
    a.timer = NEEDS.drinkTicks;
    w.thought = 'Drinking from the well.';
  }
  if (--a.timer > 0) return 'running';
  w.thirst = Math.max(0, w.thirst - NEEDS.drinkAmount);
  return 'done';
}

/** a.ref = bed index, or -1 when sleeping rough. */
function sleep(s: SimState, w: Worker): Result {
  const a = w.activity;
  const beds = siteOf(s, 'beds');
  if (a.stage === 0) {
    if (a.ref === null) {
      const used = new Set(
        s.workers
          .filter((o) => o.id !== w.id && o.activity.kind === 'sleep' && o.activity.ref !== null && o.activity.ref >= 0)
          .map((o) => o.activity.ref),
      );
      let bed = -1;
      for (let i = 0; i < POPULATION.beds; i++) if (!used.has(i)) { bed = i; break; }
      a.ref = bed;
      a.target = bed >= 0 ? { x: beds.x0 + bed, y: beds.y } : { x: w.x, y: w.y };
      w.thought = bed >= 0 ? 'Time for bed.' : 'No bed free. The ground it is.';
    }
    const m = moveTo(s, w, a.target!);
    if (m === 'moving') return 'running';
    if (m === 'unreachable') {
      a.ref = -1;
      a.target = { x: w.x, y: w.y };
    }
    a.stage = 1;
    w.thought = 'Zzz...';
  }
  const inBed = (a.ref ?? -1) >= 0;
  w.fatigue = Math.max(0, w.fatigue - (inBed ? NEEDS.sleepRecoverBed : NEEDS.sleepRecoverGround));
  if (w.fatigue > NEEDS.wakeBelow) return 'running';
  if (inBed) addMoodlet(s, w, 'slept', 'Slept in a bed', MOOD.sleptInBed.value, MOOD.sleptInBed.ticks);
  else addMoodlet(s, w, 'slept', 'Slept on the ground', MOOD.sleptOnGround.value, MOOD.sleptOnGround.ticks);
  return 'done';
}

function tavern(s: SimState, w: Worker): Result {
  const a = w.activity;
  if (a.stage === 0) {
    w.thought = 'Off to the tavern!';
    const m = moveTo(s, w, spotFor(siteOf(s, 'tavern'), w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable' || w.purse < ECONOMY.tavernCost) return 'failed';
    // The tavern keeper isn't ours: this gold leaves the economy.
    w.purse -= ECONOMY.tavernCost;
    a.stage = 1;
    a.timer = ECONOMY.tavernTicks;
    w.thought = 'A drink and a song.';
  }
  if (--a.timer > 0) return 'running';
  addMoodlet(s, w, 'tavern', 'Good time at the tavern', MOOD.tavern.value, MOOD.tavern.ticks);
  return 'done';
}

// -------------------------------------------------------------- the board

export function eligibleNotices(s: SimState, w: Worker) {
  return s.notices.filter(
    (n) =>
      (n.remaining > 0 || isSpecialCount(n.remaining)) &&
      (n.addressee === null || n.addressee === w.id) &&
      // they can't take what they can't read, unless their name is on it
      (n.addressee === w.id || knows(w, n.order[0])) &&
      !w.avoid.some((av) => av.noticeId === n.id && av.until > s.tick) &&
      !nothingToHaul(s, n),
  );
}

/**
 * On the ground, workers can see whether there's anything lying around, so
 * they don't take a haul job for an empty field.
 */
/**
 * An "all" notice is finished when there's nothing left to do and nobody
 * is still in the middle of it (claimed loads count as not done yet).
 */
function allDone(s: SimState, n: Notice): boolean {
  if (s.workers.some((w) => w.memory?.noticeId === n.id)) return false;
  const o = parseOrder(n.order);
  if (o.verb === 'HAUL' && o.from === null) return !s.items.some((it) => it.type === nounItem(o.noun as Noun));
  return nothingToHaul(s, n);
}

export function nothingToHaul(s: SimState, n: Notice): boolean {
  const o = parseOrder(n.order);
  // the tower is in plain sight: no project, nothing to build
  if (o.verb === 'BUILD') return activeProject(s) === null;
  if (o.verb === 'COOK') return siteOf(s, 'stockpile').store.grain <= 0;
  if (o.verb !== 'HAUL') return false;
  const type = nounItem(o.noun as Noun);
  if (o.from !== null) return (stockpileOn(s, o.from)?.store[type] ?? 0) <= 0;
  return !s.items.some((it) => it.type === type && it.reservedBy === null);
}

function readBoard(s: SimState, w: Worker): Result {
  const a = w.activity;
  if (a.stage === 0) {
    w.thought = 'Checking the job board.';
    const m = moveTo(s, w, spotFor(siteOf(s, 'board'), w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return 'failed';
    a.stage = 1;
    a.timer = WORK.readBoardTicks;
  }
  if (--a.timer > 0) return 'running';
  const options = boardOptions(s, w);
  if (options.length === 0) {
    w.thought = 'Nothing on the board for me.';
    return 'failed';
  }
  const best = pickFromBoard(s, w, options);
  if (best.kind === 'notice') {
    // a notice stays up: the reader takes one job from it, in memory
    w.memory = { noticeId: best.n.id, order: best.n.order.map((t) => ({ ...t })), wage: best.n.wage };
    w.thought = `I'll ${orderText(best.n.order)}.`;
  } else {
    // a card or scroll is taken down and carried
    s.boardScrolls = s.boardScrolls.filter((x) => x !== best.c);
    giveCarrier(s, w, best.c);
    w.thought = `I'll take this ${best.c.kind}: ${carrierText(best.c)}.`;
    log(s, `${w.name} took a ${best.c.kind} from the board: ${carrierText(best.c)}.`, w.id);
  }
  return 'done';
}

export type BoardItem = { kind: 'notice'; n: Notice } | { kind: 'scroll'; c: Carrier };

export function eligibleScrolls(s: SimState, w: Worker): Carrier[] {
  return s.boardScrolls.filter(
    (c) => c.dest.kind === 'board' && (c.dest.addressee === w.id || (c.dest.addressee === null && knows(w, c.orders[0][0]))),
  );
}

/** Everything on the board this worker could take, notices and scrolls alike. */
export function boardOptions(s: SimState, w: Worker): BoardItem[] {
  return [
    ...eligibleNotices(s, w).map((n) => ({ kind: 'notice' as const, n })),
    ...eligibleScrolls(s, w).map((c) => ({ kind: 'scroll' as const, c })),
  ];
}

function addresseeOf(item: BoardItem): number | null {
  if (item.kind === 'notice') return item.n.addressee;
  return item.c.dest.kind === 'board' ? item.c.dest.addressee : null;
}

/** How appealing a piece of work is: pay per trip, plus liking what you're good at. */
function appealOf(w: Worker, order: Order, wage: number): number {
  const verb = order[0].t;
  if (!isWorkVerb(verb)) return WORK.boardWeightBase + wage * w.p.greed;
  return WORK.boardWeightBase + wage * w.p.greed * expectedUnits(w, verb) + skillLevel(w, SKILL_OF_VERB[verb]) * SKILLS.pickPerLevel;
}

/**
 * Weighted random pick. Better pay is more likely, never certain, so
 * low-wage jobs still get done. Anything addressed to the worker by name
 * always wins: a worker always recognizes their own name. Next comes the
 * patron's charter, then everything for Anyone.
 */
export function pickFromBoard(s: SimState, w: Worker, options: BoardItem[]): BoardItem {
  const named = options.filter((o) => addresseeOf(o) === w.id);
  const patron = options.filter((o) => o.kind === 'scroll' && o.c.patron);
  const pool = named.length > 0 ? named : patron.length > 0 ? patron : options;
  let total = 0;
  const weights = pool.map((o) => {
    const appeal = o.kind === 'notice' ? appealOf(w, o.n.order, o.n.wage) : appealOf(w, o.c.orders.find((x) => isWorkVerb(x[0].t)) ?? o.c.orders[0], o.c.wage);
    const wt = appeal * appeal;
    total += wt;
    return wt;
  });
  let r = rand(s.rng) * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// ------------------------------------------------------------------- jobs

const PRODUCE: Partial<Record<Verb, { site: SiteKind; ticks: number; doing: string }>> = {
  MINE: { site: 'quarry', ticks: WORK.mineTicks, doing: 'Mining stone.' },
  CHOP: { site: 'forest', ticks: WORK.chopTicks, doing: 'Chopping wood.' },
  HARVEST: { site: 'field', ticks: WORK.harvestTicks, doing: 'Harvesting grain.' },
};

function nounItem(n: Noun): ItemType {
  return n.toLowerCase() as ItemType;
}

function job(s: SimState, w: Worker): Result {
  const mem = w.memory;
  if (!mem) return 'failed';
  return workOrder(s, w, mem.order);
}

/**
 * Carry out one work order, whether it came from a notice (held in memory)
 * or a line on a scroll. finishWork / failWork route the result back to
 * whichever it came from.
 */
export function workOrder(s: SimState, w: Worker, order: Order): Result {
  // read it once, through the worker's own vocabulary, at the start of the job
  const a = w.activity;
  if (!a.read) {
    const reading = readOrder(s, w, order);
    addConfusion(w, reading);
    if (!reading.order) {
      if (a.kind === 'scroll' && w.held[0]) return unreadableLine(s, w, w.held[0], order);
      return failWork(s, w, `Can't read this: «${orderText(order)}».`);
    }
    if (reading.guesses > 0 && orderText(reading.order) !== orderText(order)) log(s, `${w.name} read «${orderText(order)}» as "${orderText(reading.order)}".`, w.id);
    a.read = reading.order;
  }
  const { verb, noun, from, to } = parseOrder(a.read);
  const prod = PRODUCE[verb];
  if (prod) return produceJob(s, w, verb as WorkVerb, prod.site, prod.ticks, prod.doing, nounItem(noun as Noun));
  if (verb === 'HAUL') {
    if (from !== null) return haulBetween(s, w, nounItem(noun as Noun), from, to ?? 0);
    return haulJob(s, w, nounItem(noun as Noun), to ?? 0);
  }
  if (verb === 'COOK') return cookJob(s, w);
  if (verb === 'BUILD') return buildJob(s, w);
  return failWork(s, w, "I don't know how to do that.");
}

function finishWork(s: SimState, w: Worker, units: number): Result {
  return w.activity.kind === 'scroll' ? scrollLineDone(s, w, units) : completeJob(s, w, units);
}

/**
 * The job couldn't be done. `empty` means there was simply nothing left to
 * do (nothing to haul, no grain, no floor to build): for a scroll line set
 * to "all" that's the line finished, and for "forever" it's a breather
 * before trying again, with no hard feelings either way.
 */
function failWork(s: SimState, w: Worker, why: string, empty = false): Result {
  if (w.activity.kind === 'scroll') {
    const c = w.held[0];
    const n = c?.counts[c.pc];
    if (empty && c && n === ALL) {
      w.thought = 'All done.';
      return scrollLineDone(s, w, 0, true);
    }
    if (empty && c && n === FOREVER) {
      w.thought = `${why} I'll check again soon.`;
      c.waitUntil = s.tick + SCRIBE.lineRetryTicks;
      return 'failed';
    }
    return scrollLineFailed(s, w, why);
  }
  return failJob(s, w, why);
}

function produceJob(s: SimState, w: Worker, verb: WorkVerb, site: SiteKind, ticks: number, doing: string, out: ItemType): Result {
  const a = w.activity;
  if (a.stage === 0) {
    if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
    w.thought = `Heading to the ${site}.`;
    const m = moveTo(s, w, spotFor(siteOf(s, site), w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, "Can't get there.");
    a.stage = 1;
    a.timer = ticks;
    w.thought = doing;
  }
  if (--a.timer > 0) return 'running';
  const skill = SKILL_OF_VERB[verb];
  const units = rollYield(s.rng, w, skill, 1);
  for (let i = 0; i < units; i++) s.items.push({ id: s.nextId++, type: out, x: w.x, y: w.y, reservedBy: null });
  train(s, w, skill);
  return finishWork(s, w, units);
}

/**
 * Claim up to a full armload: the nearest loose item, then others close to
 * it. Strong or practiced haulers carry more than one per trip.
 */
function claimLoad(s: SimState, w: Worker, type: ItemType, room: number): number {
  let claimed = 0;
  let from = { x: w.x, y: w.y };
  while (claimed < room) {
    let best = null as null | Item;
    let bestD = Infinity;
    for (const it of s.items) {
      if (it.type !== type || it.reservedBy !== null) continue;
      const d = Math.abs(it.x - from.x) + Math.abs(it.y - from.y);
      if (claimed > 0 && d > SKILLS.gatherRange) continue;
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    if (!best) break;
    best.reservedBy = w.id;
    from = { x: best.x, y: best.y };
    claimed++;
  }
  return claimed;
}

function nearestClaimed(s: SimState, w: Worker): Item | null {
  let best: Item | null = null;
  let bestD = Infinity;
  for (const it of s.items) {
    if (it.reservedBy !== w.id) continue;
    const d = Math.abs(it.x - w.x) + Math.abs(it.y - w.y);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

function haulJob(s: SimState, w: Worker, type: ItemType, toLevel: Place): Result {
  const a = w.activity;
  const pile = stockpileOn(s, toLevel);
  if (!pile) return failWork(s, w, `There's no stockpile on ${placeName(toLevel)}.`);
  if (a.stage === 0) {
    if (w.carrying === type) {
      // picking a haul back up after a break: deliver what's in hand
      a.stage = 2;
    } else {
      if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
      if (claimLoad(s, w, type, carryCapacity(w)) === 0) return failWork(s, w, `No ${type} lying around to haul.`, true);
      a.stage = 1;
      w.thought = `Fetching ${type}.`;
    }
  }
  if (a.stage === 1) {
    const next = nearestClaimed(s, w);
    if (!next) {
      if (w.carryCount === 0) return failWork(s, w, "Couldn't get to it.");
      a.stage = 2;
    } else {
      const m = moveTo(s, w, { x: next.x, y: next.y });
      if (m === 'moving') return 'running';
      if (m === 'unreachable') {
        next.reservedBy = null;
        return 'running';
      }
      s.items.splice(s.items.indexOf(next), 1);
      w.carrying = type;
      w.carryCount++;
      return 'running';
    }
  }
  if (a.stage === 2) {
    w.thought = `Taking ${w.carryCount > 1 ? `${w.carryCount} ` : ''}${type} to the stockpile on ${placeName(toLevel)}.`;
    const m = moveTo(s, w, spotFor(pile, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, "Can't reach the stockpile.");
    a.stage = 3;
    a.timer = WORK.dropTicks;
  }
  if (--a.timer > 0) return 'running';
  const units = w.carryCount;
  pile.store[type] += units;
  w.carrying = null;
  w.carryCount = 0;
  train(s, w, 'hauling');
  return finishWork(s, w, units);
}

/**
 * Carry goods from one stockpile to another, e.g. stone from the base up
 * to floor 3 so builders don't have to climb all the way down for it.
 */
function haulBetween(s: SimState, w: Worker, type: ItemType, fromLevel: Place, toLevel: Place): Result {
  const a = w.activity;
  const src = stockpileOn(s, fromLevel);
  const dst = stockpileOn(s, toLevel);
  if (!src) return failWork(s, w, `There's no stockpile on ${placeName(fromLevel)}.`);
  if (!dst) return failWork(s, w, `There's no stockpile on ${placeName(toLevel)}.`);
  if (a.stage === 0) {
    if (w.carrying === type) a.stage = 2;
    else {
      if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
      if (src.store[type] <= 0) return failWork(s, w, `No ${type} in the stockpile on ${placeName(fromLevel)}.`, true);
      w.thought = `Fetching ${type} from ${placeName(fromLevel)}.`;
      const m = moveTo(s, w, spotFor(src, w.id));
      if (m === 'moving') return 'running';
      if (m === 'unreachable') return failWork(s, w, `Can't reach ${placeName(fromLevel)}.`);
      const take = Math.min(carryCapacity(w), src.store[type]);
      if (take <= 0) return failWork(s, w, `Somebody took the last ${type}.`);
      src.store[type] -= take;
      w.carrying = type;
      w.carryCount = take;
      a.stage = 2;
    }
  }
  if (a.stage === 2) {
    w.thought = `Taking ${w.carryCount} ${type} to ${placeName(toLevel)}.`;
    const m = moveTo(s, w, spotFor(dst, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, `Can't reach ${placeName(toLevel)}.`);
    a.stage = 3;
    a.timer = WORK.dropTicks;
  }
  if (--a.timer > 0) return 'running';
  const units = w.carryCount;
  dst.store[type] += units;
  w.carrying = null;
  w.carryCount = 0;
  train(s, w, 'hauling');
  return finishWork(s, w, units);
}

/** How much of a material builders are already carrying toward the project. */
function inTransit(s: SimState, m: BuildMaterial): number {
  let n = 0;
  for (const o of s.workers) if (o.carrying === m && o.activity.kind !== 'idle' && isBuilding(o)) n += o.carryCount;
  return n;
}

function isBuilding(w: Worker): boolean {
  const order = w.activity.kind === 'job' ? w.memory?.order : w.activity.kind === 'scroll' ? w.held[0]?.orders[w.held[0].pc] : undefined;
  return order?.[0].t === 'BUILD';
}

/**
 * Work on the lowest floor under way: fetch stone or wood from the nearest
 * stockpile below it (the higher the better), climb up, and set it in place.
 * Stockpiles on the upper floors are what keep this from becoming a long
 * climb from the ground for every armload. activity.ref counts units placed.
 */
function buildJob(s: SimState, w: Worker): Result {
  const a = w.activity;
  const p = activeProject(s);
  if (a.stage === 0) {
    if (!p) return failWork(s, w, 'Nothing to build. Waiting on a blueprint.', true);
    if (w.carrying === 'stone' || w.carrying === 'wood') a.stage = 2;
    else {
      if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
      // what's still needed, after what other builders are already carrying up
      const want = (m: BuildMaterial) => p.needs[m] - p.placed[m] - inTransit(s, m);
      const m: BuildMaterial | null = want('stone') > 0 ? 'stone' : want('wood') > 0 ? 'wood' : null;
      if (!m) return failWork(s, w, 'Enough material is already on its way up.');
      // the highest stockpile at or below the story they build from
      const src = stockpiles(s)
        .filter((sp) => sp.level <= p.level - 1 && sp.store[m] > 0)
        .sort((x, y) => y.level - x.level)[0];
      if (!src) return failWork(s, w, `No ${m} in any stockpile to build with.`);
      a.target = spotFor(src, w.id);
      a.ref = src.id;
      a.stage = 1;
      w.thought = `Fetching ${m} for floor ${p.level}.`;
    }
  }
  if (a.stage === 1) {
    const src = s.sites.find((x) => x.id === a.ref);
    const m = moveTo(s, w, a.target!);
    if (m === 'moving') return 'running';
    if (!src || m === 'unreachable' || !p) return failWork(s, w, "Couldn't get the material.");
    const mat: BuildMaterial = p.placed.stone + inTransit(s, 'stone') < p.needs.stone && src.store.stone > 0 ? 'stone' : 'wood';
    const want = Math.max(1, p.needs[mat] - p.placed[mat] - inTransit(s, mat));
    const take = Math.min(carryCapacity(w), src.store[mat], want);
    if (take <= 0) return failWork(s, w, `Somebody took the last ${mat}.`);
    src.store[mat] -= take;
    w.carrying = mat;
    w.carryCount = take;
    a.stage = 2;
  }
  if (a.stage === 2) {
    if (!p) {
      // the floor got finished while they were on their way: leave the load here
      dropCarried(s, w);
      return finishWork(s, w, 0);
    }
    w.thought = `Carrying ${w.carryCount} ${w.carrying} up to floor ${p.level}.`;
    const m = moveTo(s, w, buildSpot(p.level, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, "Can't reach the top of the tower.");
    a.stage = 3;
    a.timer = TOWER.buildTicks;
    a.ref = 0;
  }
  // set one unit in place per buildTicks
  if (--a.timer > 0) return 'running';
  const mat = w.carrying as BuildMaterial | null;
  if (p && mat && p.placed[mat] < p.needs[mat]) {
    w.thought = `Building floor ${p.level}.`;
    placeMaterial(s, p, mat);
    a.ref = (a.ref ?? 0) + 1;
    w.carryCount--;
    if (w.carryCount <= 0) {
      w.carrying = null;
      w.carryCount = 0;
    }
    train(s, w, 'building');
    if (w.carryCount > 0) {
      a.timer = TOWER.buildTicks;
      return 'running';
    }
  } else if (w.carrying) {
    // nothing left to use this on: drop it where they stand
    dropCarried(s, w);
  }
  return finishWork(s, w, a.ref ?? 0);
}

export function train(s: SimState, w: Worker, skill: SkillId): void {
  const up = practice(w, skill);
  if (up !== null) log(s, `${w.name} is getting better at ${SKILL_LABEL[skill].toLowerCase()} (level ${up}).`, w.id);
}

function cookJob(s: SimState, w: Worker): Result {
  const a = w.activity;
  const pile = siteOf(s, 'stockpile');
  const kitchen = siteOf(s, 'kitchen');
  if (a.stage === 0) {
    if (w.carrying === 'grain') a.stage = 2;
    else {
      if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
      if (pile.store.grain <= 0) return failWork(s, w, 'No grain in the stockpile.', true);
      w.thought = 'Fetching grain.';
      const m = moveTo(s, w, spotFor(pile, w.id));
      if (m === 'moving') return 'running';
      if (m === 'unreachable') return failWork(s, w, "Can't reach the stockpile.");
      if (pile.store.grain <= 0) return failWork(s, w, 'Somebody took the last grain.');
      pile.store.grain--;
      w.carrying = 'grain';
      w.carryCount = 1;
      a.stage = 2;
    }
  }
  if (a.stage === 2) {
    w.thought = 'Taking grain to the kitchen.';
    const m = moveTo(s, w, spotFor(kitchen, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, "Can't reach the kitchen.");
    a.stage = 3;
    a.timer = WORK.cookTicks;
    w.thought = 'Baking bread.';
  }
  if (--a.timer > 0) return 'running';
  // one grain makes a batch; a practiced cook gets an extra loaf out of it
  w.carryCount--;
  if (w.carryCount <= 0) {
    w.carrying = null;
    w.carryCount = 0;
  }
  const units = rollYield(s.rng, w, 'cooking', WORK.breadPerGrain);
  kitchen.store.bread += units;
  train(s, w, 'cooking');
  return finishWork(s, w, units);
}

/**
 * Notice counts are in units (stone, loaves...), and wages are per unit. One
 * trip can finish several units: a skilled miner's bonus stone, a strong
 * hauler's double armload. The count goes down only now, when the work is
 * done. If it already ran out, the worker did the work for nothing and is
 * annoyed in proportion to the wage they expected. If only part was left,
 * they're paid for that part.
 *
 * One job per board visit: a worker holds one order in mind and forgets it
 * once done. Repeating work needs a carried scroll with a loop on it.
 */
function completeJob(s: SimState, w: Worker, units: number): Result {
  const mem = w.memory!;
  w.memory = null;
  w.jobsDone++;
  const notice = s.notices.find((n) => n.id === mem.noticeId);
  if (notice && isSpecialCount(notice.remaining)) {
    // "all" and "forever" notices pay from the treasury as they go
    const pay = units * notice.wage;
    if (pay > 0 && s.gold - s.reserved >= pay) {
      s.gold -= pay;
      w.purse += pay;
      addMoodlet(s, w, 'paid', `Paid ${pay} gold`, MOOD.gotPaid.value, MOOD.gotPaid.ticks);
    } else if (pay > 0) {
      addMoodlet(s, w, 'unpaid', 'Treasury was empty', -6, MOOD.missedJobTicks);
    }
    w.thought = `Done: ${units} ${mem.order[1]?.t.toLowerCase() ?? ''}.`;
    // "all" is finished once there's nothing left to do
    if (notice.remaining === ALL && units > 0 && allDone(s, notice)) {
      s.notices = s.notices.filter((n) => n.id !== notice.id);
      log(s, `Notice finished: ${orderText(notice.order)} (all done).`);
    }
  } else if (notice && notice.remaining > 0) {
    const counted = Math.min(units, notice.remaining);
    const pay = counted * notice.wage;
    notice.remaining -= counted;
    s.gold -= pay;
    s.reserved -= pay;
    w.purse += pay;
    if (pay > 0) addMoodlet(s, w, 'paid', `Paid ${pay} gold`, MOOD.gotPaid.value, MOOD.gotPaid.ticks);
    const what = `${counted} ${mem.order[1].t.toLowerCase()}`;
    w.thought = pay > 0 ? `Done! ${what}, +${pay} gold.` : `Done: ${what}.`;
    if (notice.remaining === 0) {
      s.notices = s.notices.filter((n) => n.id !== notice.id);
      log(s, `Notice finished: ${orderText(notice.order)}.`);
    }
  } else {
    const penalty = Math.min(MOOD.missedJobCap, MOOD.missedJobBase + mem.wage * MOOD.missedJobPerWage);
    addMoodlet(s, w, 'missed', 'Did a job for nothing', -penalty, MOOD.missedJobTicks);
    w.thought = 'Somebody beat me to it! No pay?!';
    log(s, `${w.name} finished "${orderText(mem.order)}" but it was already done. No pay.`, w.id);
  }
  return 'done';
}

function failJob(s: SimState, w: Worker, why: string): Result {
  const mem = w.memory;
  w.memory = null;
  w.thought = why;
  if (mem) {
    w.avoid.push({ noticeId: mem.noticeId, until: s.tick + WORK.avoidTicks });
    addMoodlet(s, w, 'failed', "Couldn't do my job", MOOD.failedJob.value, MOOD.failedJob.ticks);
    log(s, `${w.name} gave up on "${orderText(mem.order)}": ${why}`, w.id);
  }
  return 'failed';
}

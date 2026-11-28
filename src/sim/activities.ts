import { addMoodlet, unpaidAlert, dropCarried, gotPaid, judgeWage, letGo, log, moveTo, pushed, settle, takeHold } from './actions';
import { ALL, FIXTURE_WORD_KIND, FOREVER, STORES_FOR, floorName, isSpecialCount, isWorkVerb, makeOrder, orderText, parseOrder, placeName, type Noun, type Order, type Place, type Verb, type WorkVerb } from './lang';
import { carrierText } from './carriers';
import { attendLesson, giveCarrier, runScroll, scrollLineDone, scrollLineFailed, unreadableLine } from './scrolls';
import { addConfusion, knows, readOrder } from './drift';
import { rand, randInt } from './rng';
import { carryCapacity, expectedUnits, practice, rollYield, SKILL_LABEL, SKILL_OF_VERB, skillLevel } from './skills';
import { BUILD, ECONOMY, MOOD, MOVE, NEEDS, SCRIBE, SKILLS, SOCIAL, TOWER, WORK } from './tuning';
import { beatenTo, sharedJob, together, tookNotice, wokeBeside, workedBeside } from './social';
import type { ActivityKind, BuildMaterial, Carrier, FixtureKind, Item, ItemType, Notice, Pt, SimState, Site, SiteKind, SkillId, Worker } from './types';
import { depotFor, findSite, freeRoom, groundRow, nearest, roomIn, siteOf, siteRef, sitesOf, sourceFor, spotFor, standable, stockpiles, storesAt, usable, vehiclesAt } from './world';
import { activeProject, buildSpot, placeMaterial } from './tower';
import { accepts, buildScope, campJobs, jobsFor, jobSpot, placeUnit, scopeText, stillNeeded, undoUnit, type BuildScope, type Job } from './build';

export type Result = 'running' | 'done' | 'failed';

export function startActivity(w: Worker, kind: ActivityKind): void {
  w.activity = { kind, stage: 0, timer: 0, target: null, ref: null, read: null, aim: null };
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
    case 'bar':
      return bar(s, w);
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

/** Somewhere with bread: a pantry, or the patron's supplies until there are pantries. */
function breadSources(s: SimState): Site[] {
  return s.sites.filter((x) => usable(x) && x.store.bread > 0 && (x.kind === 'pantry' || x.supplies));
}

export function breadAvailable(s: SimState): boolean {
  return breadSources(s).length > 0;
}

/** a.ref = the site they're eating from. */
function eat(s: SimState, w: Worker): Result {
  const a = w.activity;
  if (a.stage === 0) {
    let src = a.ref === null ? null : s.sites.find((x) => x.id === a.ref) ?? null;
    if (!src || src.store.bread <= 0) {
      src = nearest(breadSources(s), w);
      if (!src) {
        w.thought = 'No bread anywhere!';
        return 'failed';
      }
      a.ref = src.id;
    }
    w.thought = src.supplies ? "Hungry. There's bread in the patron's supplies." : 'Hungry. Off to the pantry.';
    const m = moveTo(s, w, spotFor(src, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable' || src.store.bread <= 0) {
      w.thought = 'No bread!';
      return 'failed';
    }
    src.store.bread--;
    a.stage = 1;
    a.timer = WORK.pickupTicks + NEEDS.eatTicks;
    w.thought = 'Eating bread.';
  }
  if (--a.timer > 0) return 'running';
  w.hunger = Math.max(0, w.hunger - NEEDS.eatAmount);
  addMoodlet(s, w, 'ate', 'Ate bread', MOOD.ateBread.value, MOOD.ateBread.ticks);
  together(s, w, 'eat', SOCIAL.event.ateTogether);
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

/** a.ref = the bed's site id, or -1 when sleeping rough. */
function sleep(s: SimState, w: Worker): Result {
  const a = w.activity;
  if (a.stage === 0) {
    if (a.ref === null) {
      const used = new Set(
        s.workers
          .filter((o) => o.id !== w.id && o.activity.kind === 'sleep' && o.activity.ref !== null && o.activity.ref >= 0)
          .map((o) => o.activity.ref),
      );
      const bed = nearest(sitesOf(s, 'bed').filter((b) => !used.has(b.id) && !b.demolish), w);
      a.ref = bed ? bed.id : -1;
      a.target = bed ? { x: bed.x0, y: bed.y } : { x: w.x, y: w.y };
      w.thought = bed ? 'Time for bed.' : sitesOf(s, 'bed').length ? 'No bed free. The ground it is.' : 'No beds. The ground it is.';
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
  wokeBeside(s, w);
  if (inBed) addMoodlet(s, w, 'slept', 'Slept in a bed', MOOD.sleptInBed.value, MOOD.sleptInBed.ticks);
  else addMoodlet(s, w, 'slept', 'Slept on the ground', MOOD.sleptOnGround.value, MOOD.sleptOnGround.ticks);
  return 'done';
}

/** Bars with beer to sell. */
export function barsWithBeer(s: SimState): Site[] {
  return sitesOf(s, 'bar').filter((x) => x.store.beer > 0);
}

/** What a beer costs at this bar. */
export function beerPrice(bar: Site): number {
  return bar.price ?? ECONOMY.beerPrice;
}

/** The cheapest beer a worker could buy right now, or null if no bar has any. */
export function cheapestBeer(s: SimState): number | null {
  const bars = barsWithBeer(s);
  return bars.length ? Math.min(...bars.map(beerPrice)) : null;
}

/** How much a beer at this price lifts the mood: cheaper cheers more. */
export function barMood(price: number): number {
  return Math.max(ECONOMY.barMoodMin, MOOD.bar.value + (ECONOMY.beerPrice - price) * ECONOMY.barMoodPerGold);
}

/**
 * A beer at the bar: it lifts the mood and takes the edge off thirst. The
 * bar is the colony's own, so what workers pay goes back to the treasury.
 * a.ref = the bar.
 */
function bar(s: SimState, w: Worker): Result {
  const a = w.activity;
  if (a.stage === 0) {
    let b = a.ref === null ? null : s.sites.find((x) => x.id === a.ref) ?? null;
    if (!b) {
      b = nearest(barsWithBeer(s).filter((x) => beerPrice(x) <= w.purse), w);
      if (!b) return 'failed';
      a.ref = b.id;
    }
    w.thought = 'Off to the bar!';
    const m = moveTo(s, w, spotFor(b, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable' || w.purse < beerPrice(b) || b.store.beer <= 0) {
      w.thought = b.store.beer <= 0 ? 'The bar is dry!' : "Can't afford it.";
      return 'failed';
    }
    b.store.beer--;
    const price = beerPrice(b);
    w.purse -= price;
    s.gold += price;
    s.takings += price;
    a.stage = 1;
    a.timer = ECONOMY.barTicks;
    w.thought = 'A beer and a song.';
  }
  if (--a.timer > 0) return 'running';
  w.thirst = Math.max(0, w.thirst - ECONOMY.beerQuench);
  const paid = beerPrice(s.sites.find((x) => x.id === a.ref) ?? ({ price: ECONOMY.beerPrice } as Site));
  addMoodlet(s, w, 'bar', paid === 0 ? 'Free beer!' : paid < ECONOMY.beerPrice ? 'Cheap beer at the bar' : paid > ECONOMY.beerPrice ? 'Pricey beer, but still' : 'A good time at the bar', barMood(paid), MOOD.bar.ticks);
  together(s, w, 'bar', SOCIAL.event.drankTogether);
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
  if (o.verb === 'HAUL' && o.target !== null) return false;
  if (o.verb === 'HAUL' && o.noun === 'ANY') return !anythingToHaul(s, o.from, o.to, false);
  if (o.verb === 'HAUL' && o.from === null) return !s.items.some((it) => it.type === nounItem(o.noun as Noun));
  return nothingToHaul(s, n);
}

export function nothingToHaul(s: SimState, n: Notice): boolean {
  const o = parseOrder(n.order);
  // moving a cart isn't something that runs out
  if (o.verb === 'HAUL' && o.target !== null) return false;
  // the tower and the camp are in plain sight: nothing planned, nothing to build
  if (o.verb === 'BUILD') return o.noun === 'TOWER' ? activeProject(s) === null : jobsFor(s, buildScope(o.noun, o.target, o.within)).length === 0;
  if (o.verb === 'COOK' || o.verb === 'BREW') return !canProcess(s, PROCESS[o.verb]);
  if (o.verb !== 'HAUL') return false;
  if (o.noun === 'ANY') return !anythingToHaul(s, o.from, o.to, true);
  const type = nounItem(o.noun as Noun);
  if (o.from !== null) return !storesAt(s, o.from, type).some((x) => x.store[type] > 0);
  return !s.items.some((it) => it.type === type && it.reservedBy === null);
}

function readBoard(s: SimState, w: Worker): Result {
  const a = w.activity;
  if (a.stage === 0) {
    w.thought = 'Checking the job board.';
    const board = findSite(s, 'board');
    if (!board) return 'failed';
    const m = moveTo(s, w, spotFor(board, w.id));
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
  const { verb, noun, from, to, target, within, using } = parseOrder(a.read);
  const prod = PRODUCE[verb];
  if (prod) return produceJob(s, w, verb as WorkVerb, prod.site, prod.ticks, prod.doing, nounItem(noun as Noun));
  if (verb === 'HAUL') {
    // "haul cart 1 to stockpile 2": push it there
    if (target !== null) return pushCartJob(s, w, target, to);
    if (noun === 'ANY') {
      // "haul anything": settle on one good for this trip (whatever's already in the cart first), then it's an ordinary haul
      const type = (using !== null ? cartGood(s, using) : null) ?? haulAnyType(s, w, from, to);
      if (!type) return failWork(s, w, from === null ? 'Nothing lying around to haul.' : `Nothing at ${placeName(from)} to haul.`, true);
      a.read = makeOrder('HAUL', type.toUpperCase() as Noun, { from, to, using });
      return workOrder(s, w, order);
    }
    if (using !== null) return cartHaul(s, w, nounItem(noun as Noun), from, to, using);
    if (from !== null) return haulBetween(s, w, nounItem(noun as Noun), from, to);
    return haulJob(s, w, nounItem(noun as Noun), to);
  }
  if (verb === 'COOK' || verb === 'BREW') return processJob(s, w, PROCESS[verb]);
  if (verb === 'BUILD') return noun === 'TOWER' ? buildJob(s, w) : campJob(s, w, buildScope(noun, target, within));
  return failWork(s, w, "I don't know how to do that.");
}

const GOODS: readonly ItemType[] = ['stone', 'wood', 'grain', 'bread', 'beer'];

// ------------------------------------------------- wheelbarrows and carts

/** The first good already in the named cart, if any. */
function cartGood(s: SimState, using: Place): ItemType | null {
  const cart = vehiclesAt(s, using)[0];
  return cart ? GOODS.find((t) => cart.store[t] > 0) ?? null : null;
}

/** Someone else has hold of it. */
function cartInUse(s: SimState, w: Worker, cart: Site): Worker | null {
  return s.workers.find((o) => o !== w && o.pushing === cart.id) ?? null;
}

/**
 * Get hold of a wheelbarrow or cart: walk to its nearer end and take the
 * handles. 'held' once they have it.
 */
function getCart(s: SimState, w: Worker, cart: Site): Result | 'held' {
  if (pushed(s, w) === cart) return 'held';
  const other = cartInUse(s, w, cart);
  if (other) return failWork(s, w, `${other.name} has ${siteRef(cart)}.`, 'wait');
  if (cart.y !== groundRow(s)) return failWork(s, w, `${cap(siteRef(cart))} isn't on the ground.`);
  w.thought = `Fetching ${siteRef(cart)}.`;
  const left = w.x < cart.x0 || (w.x <= cart.x1 && w.x - cart.x0 < cart.x1 - w.x);
  const end = { x: Math.max(0, Math.min(s.width - 1, left ? cart.x0 - 1 : cart.x1 + 1)), y: cart.y };
  const m = moveTo(s, w, end);
  if (m === 'moving') return 'running';
  if (m === 'unreachable') return failWork(s, w, `Can't get to ${siteRef(cart)}.`);
  if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
  takeHold(s, w, cart);
  return 'held';
}

/** Where a cart can be pushed to: beside a fixture (by number or name) or into a building by name, on the ground. */
function cartDestination(s: SimState, place: Place | null, w: Worker): Pt | null {
  if (place === null || typeof place !== 'object') return null;
  if ('fixture' in place) {
    const site = s.sites.find((x) => x.kind === FIXTURE_WORD_KIND[place.fixture] && x.num === place.n);
    return site ? spotFor(site, w.id) : null;
  }
  const name = place.name.toLowerCase();
  const site = s.sites.find((x) => x.named && x.label.toLowerCase() === name);
  if (site) return spotFor(site, w.id);
  const b = s.buildings.find((x) => x.name.toLowerCase() === name);
  return b ? { x: Math.floor((b.x0 + b.x1) / 2), y: groundRow(s) } : null;
}

/** "Haul cart 1 to stockpile 2": push it there and leave it. One unit of work. */
function pushCartJob(s: SimState, w: Worker, target: Place, to: Place | null): Result {
  const cart = vehiclesAt(s, target).find((x) => x.build === null);
  if (!cart) return failWork(s, w, `There's no ${placeName(target)} to move.`);
  const dest = cartDestination(s, to, w);
  if (!dest) return failWork(s, w, to === null ? 'Push it where?' : `There's no ${placeName(to)} to push it to.`);
  if (dest.y !== groundRow(s)) return failWork(s, w, `${cap(siteRef(cart))} can't go up the tower.`);
  const held = getCart(s, w, cart);
  if (held !== 'held') return held;
  w.thought = `Pushing ${siteRef(cart)} to ${placeName(to!)}.`;
  const m = moveTo(s, w, dest);
  if (m === 'moving') return 'running';
  letGo(w);
  if (m === 'unreachable') return failWork(s, w, `Can't push ${siteRef(cart)} there.`);
  train(s, w, 'hauling');
  return finishWork(s, w, 1);
}

/**
 * Hauling with a wheelbarrow or cart: get hold of it, push it to the goods
 * (a store, or whatever's lying around), load it up, push it to where they
 * go, unload. One trip moves far more than an armload, but pushing is slow.
 * Stopping for anything else leaves the cart where it stands, loaded or
 * not: it's a store, so anyone can haul from it, and nobody holds on to it.
 * activity.stage: 0 get the cart, 1 load, 2 deliver, 3 loading or unloading.
 */
function cartHaul(s: SimState, w: Worker, type: ItemType, from: Place | null, to: Place | null, using: Place): Result {
  const a = w.activity;
  const cart = vehiclesAt(s, using).find((x) => x.build === null);
  if (!cart) return failWork(s, w, `There's no ${placeName(using)} to haul with.`);
  if (a.stage === 0) {
    const held = getCart(s, w, cart);
    if (held !== 'held') return held;
    a.ref = 0;
    a.stage = roomIn(cart) > 0 && moreToLoad(s, cart, type, from) ? 1 : 2;
    if (a.stage === 2 && cart.store[type] === 0) {
      letGo(w);
      return failWork(s, w, from === null ? `No ${type} lying around to haul.` : `No ${type} left at ${placeName(from)}.`, true);
    }
  }
  if (pushed(s, w) !== cart) {
    // let go of it somehow (a ladder in the way): start over
    a.stage = 0;
    return 'running';
  }
  if (a.stage === 1) {
    // to the goods
    let spot: Pt | null = null;
    let src: Site | null = null;
    if (from !== null) {
      src = nearest(storesAt(s, from, type).filter((x) => x !== cart && x.store[type] > 0), w);
      if (src) spot = spotFor(src, w.id);
    } else {
      let best: Item | null = null;
      for (const it of s.items) {
        if (it.type !== type || it.reservedBy !== null || it.y !== cart.y) continue;
        if (!best || Math.abs(it.x - w.x) < Math.abs(best.x - w.x)) best = it;
      }
      if (best) spot = { x: best.x, y: best.y };
    }
    if (!spot) {
      a.stage = cart.store[type] > 0 ? 2 : 0;
      if (a.stage === 0) {
        letGo(w);
        return failWork(s, w, `No more ${type} to load.`, true);
      }
      return 'running';
    }
    if (spot.y !== groundRow(s)) {
      a.stage = cart.store[type] > 0 ? 2 : 0;
      if (a.stage === 0) {
        letGo(w);
        return failWork(s, w, `${cap(siteRef(cart))} can't go up the tower to load.`);
      }
      return 'running';
    }
    w.thought = `Pushing ${siteRef(cart)} to the ${type}.`;
    const m = moveTo(s, w, spot);
    if (m === 'moving') return 'running';
    if (m === 'unreachable') {
      letGo(w);
      return failWork(s, w, `Can't push ${siteRef(cart)} there.`);
    }
    // load up
    let n = 0;
    const room = roomIn(cart);
    if (src) {
      n = Math.min(src.store[type], room);
      src.store[type] -= n;
    } else {
      for (const it of [...s.items]) {
        if (n >= room) break;
        if (it.type !== type || it.reservedBy !== null || it.y !== w.y || Math.abs(it.x - w.x) > SKILLS.gatherRange) continue;
        s.items.splice(s.items.indexOf(it), 1);
        n++;
      }
    }
    cart.store[type] += n;
    w.thought = `Loading ${n} ${type} into ${siteRef(cart)}.`;
    a.timer = Math.max(1, n * MOVE.loadTicksPerUnit);
    // full, or nothing more to fetch: off to deliver; else fetch more
    a.aim = roomIn(cart) > 0 && moreToLoad(s, cart, type, from) ? 1 : 2;
    a.stage = 3;
    return 'running';
  }
  if (a.stage === 2) {
    const dst = depotFor(s, to, type, w, [cart]);
    if (!dst) {
      letGo(w);
      return failWork(s, w, noDepot(s, to, type));
    }
    if (dst.y !== groundRow(s)) {
      letGo(w);
      return failWork(s, w, `${cap(siteRef(cart))} can't go up the tower: ${siteRef(dst)} is up there.`);
    }
    w.thought = `Pushing ${cart.store[type]} ${type} to ${siteRef(dst)}.`;
    const m = moveTo(s, w, spotFor(dst, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') {
      letGo(w);
      return failWork(s, w, `Can't push ${siteRef(cart)} to ${siteRef(dst)}.`);
    }
    const n = Math.min(cart.store[type], roomIn(dst));
    cart.store[type] -= n;
    dst.store[type] += n;
    a.ref = (a.ref ?? 0) + n;
    w.thought = `Unloading ${n} ${type} at ${siteRef(dst)}.`;
    a.timer = Math.max(1, n * MOVE.loadTicksPerUnit);
    a.aim = -1;
    a.stage = 3;
    return 'running';
  }
  // stage 3: loading or unloading takes a moment
  if (--a.timer > 0) return 'running';
  if (a.aim === 1 || a.aim === 2) {
    a.stage = a.aim;
    return 'running';
  }
  train(s, w, 'hauling');
  return finishWork(s, w, a.ref ?? 0);
}

/** Is there more of this good to load into the cart from where it's coming from? */
function moreToLoad(s: SimState, cart: Site, type: ItemType, from: Place | null): boolean {
  if (from !== null) return storesAt(s, from, type).some((x) => x !== cart && x.store[type] > 0);
  return s.items.some((it) => it.type === type && it.reservedBy === null && it.y === cart.y);
}

/**
 * Which good a "haul anything" trip moves. Whatever's already in hand comes
 * first. From the ground, the nearest loose thing that has somewhere to go;
 * from a place, the first good stored there that has somewhere to go.
 */
function haulAnyType(s: SimState, w: Worker, from: Place | null, to: Place | null): ItemType | null {
  const held = w.carrying;
  if (held && GOODS.includes(held) && depotFor(s, to, held, w)) return held;
  if (from === null) {
    const goesSomewhere = new Map<ItemType, boolean>();
    const ok = (t: ItemType) => {
      if (!goesSomewhere.has(t)) goesSomewhere.set(t, depotFor(s, to, t, w) !== null);
      return goesSomewhere.get(t)!;
    };
    let best: Item | null = null;
    let bestD = Infinity;
    for (const it of s.items) {
      if (it.reservedBy !== null || !GOODS.includes(it.type) || !ok(it.type)) continue;
      const d = Math.abs(it.x - w.x) + Math.abs(it.y - w.y);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best?.type ?? null;
  }
  for (const t of GOODS) {
    const sources = storesAt(s, from, t);
    if (sources.some((x) => x.store[t] > 0) && depotFor(s, to, t, w, sources)) return t;
  }
  return null;
}

/** Is there anything for "haul anything" to do? Loose goods (or goods stored at `from`) that have somewhere to go. */
function anythingToHaul(s: SimState, from: Place | null, to: Place | null, unclaimedOnly: boolean): boolean {
  for (const t of GOODS) {
    const sources = from === null ? [] : storesAt(s, from, t);
    const there = from === null ? s.items.some((it) => it.type === t && (!unclaimedOnly || it.reservedBy === null)) : sources.some((x) => x.store[t] > 0);
    if (there && depotFor(s, to, t, { x: 0, y: 0 }, sources)) return true;
  }
  return false;
}

function finishWork(s: SimState, w: Worker, units: number): Result {
  if (units > 0) workedBeside(s, w);
  return w.activity.kind === 'scroll' ? scrollLineDone(s, w, units) : completeJob(s, w, units);
}

/**
 * The job couldn't be done. `empty` means there was simply nothing left to
 * do (nothing to haul, no grain, no floor to build): for a scroll line set
 * to "all" that's the line finished, and for "forever" it's a breather
 * before trying again, with no hard feelings either way. `'wait'` means the
 * work isn't done but there's nothing for this worker to do right now
 * (others are already carrying what's needed): a short breather and no hard
 * feelings, and the line stays where it is.
 */
function failWork(s: SimState, w: Worker, why: string, empty: boolean | 'wait' = false): Result {
  if (empty === 'wait') {
    w.thought = `${why} I'll check again soon.`;
    if (w.activity.kind === 'scroll' && w.held[0]) {
      w.held[0].waitUntil = s.tick + SCRIBE.lineRetryTicks;
      // things may have changed by the time they come back to it: look again
      w.held[0].checked = false;
    }
    // a notice's job is simply let go: the notice is still on the board for later
    else w.memory = null;
    return 'failed';
  }
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
      c.checked = false;
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

/** Marks a fetch from loose items on the ground instead of from a store (in activity.ref or .timer). */
const LOOSE = -1;

/** Loose items of a type that nobody has claimed. */
function looseFree(s: SimState, type: ItemType): number {
  let n = 0;
  for (const it of s.items) if (it.type === type && it.reservedBy === null) n++;
  return n;
}

/**
 * Fetching from the ground, for when no store has what's needed: walk to
 * each claimed item and pick it up. Workers would rather take from a
 * stockpile, so every pickup costs a little mood.
 */
function gatherLoose(s: SimState, w: Worker): 'running' | 'done' | 'failed' {
  const next = nearestClaimed(s, w);
  if (!next) return w.carryCount > 0 ? 'done' : 'failed';
  w.thought = `Hunting around for loose ${next.type}.`;
  const m = moveTo(s, w, { x: next.x, y: next.y });
  if (m === 'moving') return 'running';
  if (m === 'unreachable') {
    next.reservedBy = null;
    return 'running';
  }
  s.items.splice(s.items.indexOf(next), 1);
  w.carrying = next.type;
  w.carryCount++;
  addMoodlet(s, w, 'scavenged', `Had to pick ${next.type} up off the ground`, MOOD.scavenged.value, MOOD.scavenged.ticks);
  return 'running';
}

/** Why nothing can go to a place: there's no such store, or it's full. */
function noDepot(s: SimState, to: Place | null, type: ItemType): string {
  const store = STORES_FOR[type.toUpperCase() as keyof typeof STORES_FOR][0];
  if (to === null) return `No ${store} with room anywhere.`;
  const there = storesAt(s, to, type);
  if (typeof to === 'number' || to === 'tower') return there.length === 0 ? `There's no ${store} on ${placeName(to)}.` : `No ${store} with room on ${placeName(to)}.`;
  return there.length === 0 ? `There's no ${placeName(to)}.` : `${cap(siteRef(there[0]))} is full.`;
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function haulJob(s: SimState, w: Worker, type: ItemType, toPlace: Place | null): Result {
  const a = w.activity;
  if (a.stage === 0) {
    if (!depotFor(s, toPlace, type, w)) return failWork(s, w, noDepot(s, toPlace, type));
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
    const pile = depotFor(s, toPlace, type, w, [], w.carryCount);
    if (!pile) {
      dropCarried(s, w);
      a.into = null;
      a.bringing = 0;
      return failWork(s, w, noDepot(s, toPlace, type));
    }
    a.into = pile.id;
    a.bringing = w.carryCount;
    w.thought = `Taking ${w.carryCount > 1 ? `${w.carryCount} ` : ''}${type} to ${siteRef(pile)}.`;
    const m = moveTo(s, w, spotFor(pile, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, "Can't reach the stockpile.");
    a.stage = 3;
    a.timer = WORK.dropTicks;
    a.ref = pile.id;
  }
  if (--a.timer > 0) return 'running';
  const pile = s.sites.find((x) => x.id === a.ref);
  if (!pile) {
    a.stage = 2;
    return 'running';
  }
  const units = deposit(s, w, pile);
  train(s, w, 'hauling');
  return finishWork(s, w, units);
}

/**
 * Carry goods from one place to another, e.g. stone from the base up to
 * floor 3 so builders don't have to climb all the way down for it.
 */
function haulBetween(s: SimState, w: Worker, type: ItemType, fromPlace: Place, toPlace: Place | null): Result {
  const a = w.activity;
  // with no TO, the nearest store that isn't one it's coming from
  const sources = storesAt(s, fromPlace, type);
  if (a.stage === 0) {
    if (!depotFor(s, toPlace, type, w, sources)) return failWork(s, w, noDepot(s, toPlace, type));
    if (w.carrying === type) a.stage = 2;
    else {
      if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
      let src = a.ref === null ? null : s.sites.find((x) => x.id === a.ref) ?? null;
      if (!src || src.store[type] <= 0) {
        src = sourceFor(s, fromPlace, type, w);
        if (!src) return failWork(s, w, sources.length === 0 && typeof fromPlace === 'object' ? `There's no ${placeName(fromPlace)}.` : `No ${type} stored at ${placeName(fromPlace)}.`, true);
        a.ref = src.id;
      }
      w.thought = `Fetching ${type} from ${siteRef(src)}.`;
      const m = moveTo(s, w, spotFor(src, w.id));
      if (m === 'moving') return 'running';
      if (m === 'unreachable') return failWork(s, w, `Can't reach ${siteRef(src)}.`);
      const room = depotFor(s, toPlace, type, w, sources);
      const take = Math.min(carryCapacity(w), src.store[type], room ? freeRoom(s, room, w) : 0);
      if (take <= 0) return failWork(s, w, `Somebody took the last ${type}.`);
      src.store[type] -= take;
      w.carrying = type;
      w.carryCount = take;
      a.stage = 2;
    }
  }
  if (a.stage === 2) {
    const dst = depotFor(s, toPlace, type, w, sources, w.carryCount);
    if (!dst) {
      dropCarried(s, w);
      a.into = null;
      a.bringing = 0;
      return failWork(s, w, noDepot(s, toPlace, type));
    }
    a.into = dst.id;
    a.bringing = w.carryCount;
    w.thought = `Taking ${w.carryCount} ${type} to ${siteRef(dst)}.`;
    const m = moveTo(s, w, spotFor(dst, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, `Can't reach ${siteRef(dst)}.`);
    a.stage = 3;
    a.timer = WORK.dropTicks;
    a.ref = dst.id;
  }
  if (--a.timer > 0) return 'running';
  const dst = s.sites.find((x) => x.id === a.ref);
  if (!dst) {
    a.stage = 2;
    return 'running';
  }
  const units = deposit(s, w, dst);
  train(s, w, 'hauling');
  return finishWork(s, w, units);
}

/**
 * Put a load into a store: as much as it has room for. Should it have
 * filled up in the moment before they got there, the rest is set down
 * beside it, lying around for a hauler. Returns the whole load: they
 * brought it all.
 */
function deposit(s: SimState, w: Worker, dst: Site): number {
  const type = w.carrying;
  const units = w.carryCount;
  w.activity.into = null;
  w.activity.bringing = 0;
  if (!type) return 0;
  const n = Math.min(units, roomIn(dst));
  dst.store[type] += n;
  w.carryCount = units - n;
  if (w.carryCount > 0) {
    w.thought = `${cap(siteRef(dst))} filled up: left ${w.carryCount} ${type} beside it.`;
    dropCarried(s, w);
  }
  w.carrying = null;
  w.carryCount = 0;
  return units;
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
    if (!s.tower) return failWork(s, w, 'There is no tower site yet.', true);
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
        .sort((x, y) => y.level - x.level || Math.abs(x.x0 - w.x) - Math.abs(y.x0 - w.x))[0];
      if (src) {
        a.target = spotFor(src, w.id);
        a.ref = src.id;
      } else {
        // nothing stored: make do with what's lying around
        if (claimLoad(s, w, m, Math.min(carryCapacity(w), Math.max(1, want(m)))) === 0) return failWork(s, w, `No ${m} in any stockpile to build with.`);
        a.ref = LOOSE;
      }
      a.stage = 1;
      w.thought = `Fetching ${m} for ${floorName(p.level)}.`;
    }
  }
  if (a.stage === 1 && a.ref === LOOSE) {
    const g = gatherLoose(s, w);
    if (g === 'running') return 'running';
    if (g === 'failed') return failWork(s, w, "Couldn't get the material.");
    a.stage = 2;
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
    w.thought = `Carrying ${w.carryCount} ${w.carrying} up to ${floorName(p.level)}.`;
    const m = moveTo(s, w, buildSpot(s, p.level, w.id));
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
    w.thought = `Building ${floorName(p.level)}.`;
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

// ----------------------------------------------------- baking and brewing

interface Process {
  station: FixtureKind;
  store: FixtureKind;
  product: ItemType;
  ticks: number;
  per: number;
  doing: string;
  stationName: string;
  storeName: string;
}

const PROCESS: Record<'COOK' | 'BREW', Process> = {
  COOK: { station: 'oven', store: 'pantry', product: 'bread', ticks: WORK.cookTicks, per: WORK.breadPerGrain, doing: 'Baking bread.', stationName: 'oven', storeName: 'pantry' },
  BREW: { station: 'brewery', store: 'bar', product: 'beer', ticks: ECONOMY.brewTicks, per: ECONOMY.beerPerGrain, doing: 'Brewing beer.', stationName: 'brewery', storeName: 'bar' },
};

/** Grain at the base, a working station, and somewhere to keep what comes out. */
function canProcess(s: SimState, p: Process): boolean {
  return whyNotProcess(s, p) === null;
}

/** The most one batch can come to (a practiced hand gets one more): the room a cook speaks for when they start. */
function batchRoom(p: Process): number {
  return p.per + 1;
}

/** Where a batch will go: the nearest store with room for a whole batch that nobody else has spoken for. */
function batchStore(s: SimState, p: Process, w: Worker | null): Site | null {
  const open = sitesOf(s, p.store).filter((x) => !x.demolish && freeRoom(s, x, w) >= batchRoom(p));
  return w ? nearest(open, w) : open[0] ?? null;
}

function whyNotProcess(s: SimState, p: Process, w: Worker | null = null): string | null {
  if (sitesOf(s, p.station).length === 0) return `There's no ${p.stationName} to work at.`;
  if (!sitesOf(s, p.store).some((x) => !x.demolish && accepts(x, p.product))) return `There's no ${p.storeName} to keep the ${p.product} in.`;
  if (!batchStore(s, p, w)) return `Every ${p.storeName} is full.`;
  if (!stockpiles(s).some((x) => x.level === 0 && x.store.grain > 0) && looseFree(s, 'grain') === 0) return 'No grain in the stockpiles.';
  return null;
}

/**
 * Bake bread or brew beer: fetch a grain from a stockpile, work it at the
 * oven (or brewery), then carry what comes out to a pantry (or the
 * bar). One grain makes a batch; a practiced cook gets an extra out of it.
 */
function processJob(s: SimState, w: Worker, p: Process): Result {
  const a = w.activity;
  if (a.stage === 0) {
    if (w.carrying === p.product) a.stage = 4;
    else if (w.carrying === 'grain') a.stage = 2;
    else {
      const why = whyNotProcess(s, p, w);
      // full stores: nothing to do for now, but the work isn't done
      if (why) {
        a.into = null;
        a.bringing = 0;
        return failWork(s, w, why, why.startsWith('Every') ? 'wait' : why.startsWith('No grain'));
      }
      // speak for the batch's room now, so the pantry can't fill up while it bakes
      const keep = a.into === null || a.into === undefined ? null : s.sites.find((x) => x.id === a.into) ?? null;
      if (!keep || freeRoom(s, keep, w) < batchRoom(p)) {
        a.into = batchStore(s, p, w)!.id;
        a.bringing = batchRoom(p);
      }
      if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
      if (a.ref === LOOSE) {
        // picking grain up off the ground (once they have it, they carry on above)
        if (gatherLoose(s, w) === 'failed') return failWork(s, w, "Couldn't get the grain.");
        return 'running';
      }
      let src = a.ref === null ? null : s.sites.find((x) => x.id === a.ref) ?? null;
      if (!src || src.store.grain <= 0) {
        src = sourceFor(s, 0, 'grain', w);
        if (!src) {
          if (claimLoad(s, w, 'grain', 1) === 0) return failWork(s, w, 'No grain in the stockpiles.', true);
          a.ref = LOOSE;
          return 'running';
        }
        a.ref = src.id;
      }
      w.thought = 'Fetching grain.';
      const m = moveTo(s, w, spotFor(src, w.id));
      if (m === 'moving') return 'running';
      if (m === 'unreachable') return failWork(s, w, "Can't reach the stockpile.");
      if (src.store.grain <= 0) return failWork(s, w, 'Somebody took the last grain.');
      src.store.grain--;
      w.carrying = 'grain';
      w.carryCount = 1;
      a.stage = 2;
    }
  }
  if (a.stage === 2) {
    const station = nearest(sitesOf(s, p.station), w);
    if (!station) {
      dropCarried(s, w);
      return failWork(s, w, `There's no ${p.stationName} to work at.`);
    }
    w.thought = `Taking grain to the ${p.stationName}.`;
    const m = moveTo(s, w, spotFor(station, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, `Can't reach the ${p.stationName}.`);
    a.stage = 3;
    a.timer = p.ticks;
    w.thought = p.doing;
  }
  if (a.stage === 3) {
    if (--a.timer > 0) return 'running';
    const units = rollYield(s.rng, w, 'cooking', p.per);
    w.carrying = p.product;
    w.carryCount = units;
    a.bringing = units;
    train(s, w, 'cooking');
    a.stage = 4;
  }
  if (a.stage === 4) {
    // the store they spoke for; else the nearest with room for the batch, or any room; failing all that the nearest, to leave it beside
    const stores = sitesOf(s, p.store).filter((x) => !x.demolish);
    const kept = stores.find((x) => x.id === a.into && freeRoom(s, x, w) >= w.carryCount);
    const open = stores.filter((x) => freeRoom(s, x, w) > 0);
    const dst = kept ?? nearest(open.filter((x) => freeRoom(s, x, w) >= w.carryCount), w) ?? nearest(open, w) ?? nearest(stores, w);
    if (!dst) {
      dropCarried(s, w);
      a.into = null;
      a.bringing = 0;
      return failWork(s, w, `There's no ${p.storeName} to keep the ${p.product} in.`);
    }
    a.into = dst.id;
    a.bringing = w.carryCount;
    w.thought = `Taking ${w.carryCount} ${p.product} to the ${p.storeName}.`;
    const m = moveTo(s, w, spotFor(dst, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, `Can't reach the ${p.storeName}.`);
    a.stage = 5;
    a.timer = WORK.dropTicks;
    a.ref = dst.id;
  }
  if (--a.timer > 0) return 'running';
  const dst = s.sites.find((x) => x.id === a.ref);
  if (!dst) {
    a.stage = 4;
    return 'running';
  }
  return finishWork(s, w, deposit(s, w, dst));
}

// ---------------------------------------------------------- building camp

/** Materials already being carried to a camp job. */
function inTransitTo(s: SimState, jobId: number, m: BuildMaterial): number {
  let n = 0;
  for (const o of s.workers) if (o.activity.aim === jobId && o.carrying === m) n += o.carryCount;
  return n;
}

function wanted(s: SimState, j: Job, m: BuildMaterial): number {
  return stillNeeded(j, m) - inTransitTo(s, j.id, m);
}

/**
 * "Build camp": work on whatever the player has planned on the ground, in
 * the order they planned it. Fetch stone or wood from the nearest stockpile
 * (or the patron's supplies), carry it over and set it in place. Things
 * marked for demolition are taken apart instead. activity.aim is the job,
 * activity.ref counts units done, activity.timer holds the source while
 * fetching.
 */
function campJob(s: SimState, w: Worker, scope: BuildScope): Result {
  const a = w.activity;
  const current = () => (a.aim === null ? null : campJobs(s).find((j) => j.id === a.aim) ?? null);
  if (a.stage === 0) {
    const jobs = jobsFor(s, scope);
    if (jobs.length === 0) return failWork(s, w, `Nothing to build ${scopeText(scope)}.`, true);
    a.ref = a.ref ?? 0;
    // already carrying something one of them needs: take it there
    const held = w.carrying === 'stone' || w.carrying === 'wood' ? w.carrying : null;
    const forHeld = held ? jobs.find((j) => !j.demolish && stillNeeded(j, held) > 0) : undefined;
    if (forHeld) {
      a.aim = forHeld.id;
      a.stage = 2;
    } else {
      let pick: { j: Job; m: BuildMaterial | null; src: Site | null } | null = null;
      let lacking: BuildMaterial | null = null;
      for (const j of jobs) {
        if (j.demolish) {
          pick = { j, m: null, src: null };
          break;
        }
        for (const m of ['stone', 'wood'] as const) {
          if (wanted(s, j, m) <= 0) continue;
          const src = sourceFor(s, 0, m, w);
          // a stockpile first; failing that, whatever's lying around
          if (src || looseFree(s, m) > 0) {
            pick = { j, m, src };
            break;
          }
          lacking = lacking ?? m;
        }
        if (pick) break;
      }
      // everything still needed is already being carried: nothing for this worker to do, no hard feelings
      if (!pick) return lacking ? failWork(s, w, `No ${lacking} in any stockpile to build with.`) : failWork(s, w, 'Enough material is already on its way.', 'wait');
      if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
      a.aim = pick.j.id;
      if (pick.j.demolish) {
        a.stage = 5;
      } else if (pick.src) {
        a.target = spotFor(pick.src, w.id);
        a.timer = pick.src.id;
        a.stage = 1;
        w.thought = `Fetching ${pick.m} for ${pick.j.label.toLowerCase()}.`;
      } else {
        claimLoad(s, w, pick.m!, Math.min(carryCapacity(w), Math.max(1, wanted(s, pick.j, pick.m!))));
        a.timer = LOOSE;
        a.stage = 1;
      }
    }
  }
  if (a.stage === 1 && a.timer === LOOSE) {
    const g = gatherLoose(s, w);
    if (g === 'running') return 'running';
    if (g === 'failed') return failWork(s, w, "Couldn't get the material.");
    a.stage = 2;
  }
  if (a.stage === 1) {
    const src = s.sites.find((x) => x.id === a.timer);
    const m = moveTo(s, w, a.target!);
    if (m === 'moving') return 'running';
    const j = current();
    if (!src || m === 'unreachable' || !j) return failWork(s, w, "Couldn't get the material.");
    const mat: BuildMaterial = wanted(s, j, 'stone') > 0 && src.store.stone > 0 ? 'stone' : 'wood';
    const take = Math.min(carryCapacity(w), src.store[mat], Math.max(1, wanted(s, j, mat)));
    if (take <= 0) return failWork(s, w, `Somebody took the last ${mat}.`);
    src.store[mat] -= take;
    w.carrying = mat;
    w.carryCount = take;
    a.stage = 2;
  }
  if (a.stage === 2) {
    const j = current();
    if (!j) {
      // it got finished (or called off) while they were on their way: try the next one
      a.stage = 0;
      return w.carrying ? 'running' : finishWork(s, w, a.ref ?? 0);
    }
    w.thought = `Carrying ${w.carryCount} ${w.carrying} to ${j.label.toLowerCase()}.`;
    const m = moveTo(s, w, jobSpot(j, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, `Can't reach ${j.label.toLowerCase()}.`);
    a.stage = 3;
    a.timer = BUILD.unitTicks;
  }
  if (a.stage === 3) {
    if (--a.timer > 0) return 'running';
    const j = current();
    const mat = w.carrying as BuildMaterial | null;
    if (j && mat && stillNeeded(j, mat) > 0) {
      w.thought = `Building ${j.label.toLowerCase()}.`;
      const done = placeUnit(s, j, mat);
      a.ref = (a.ref ?? 0) + 1;
      w.carryCount--;
      if (w.carryCount <= 0) {
        w.carrying = null;
        w.carryCount = 0;
      }
      train(s, w, 'building');
      if (w.carryCount > 0 && !done) {
        a.timer = BUILD.unitTicks;
        return 'running';
      }
    }
    if (w.carrying) {
      // left over: keep it for the next job if anything wants it, else put it down here
      const next = jobsFor(s, scope).find((x) => !x.demolish && stillNeeded(x, w.carrying as BuildMaterial) > 0);
      if (next) {
        a.aim = next.id;
        a.stage = 2;
        return 'running';
      }
      dropCarried(s, w);
    }
    return finishWork(s, w, a.ref ?? 0);
  }
  // stages 5 and 6: taking something apart, one unit at a time
  const j = current();
  if (!j) return finishWork(s, w, a.ref ?? 0);
  if (a.stage === 5) {
    w.thought = `Taking down ${j.label.toLowerCase()}.`;
    const m = moveTo(s, w, jobSpot(j, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failWork(s, w, `Can't reach ${j.label.toLowerCase()}.`);
    a.stage = 6;
    a.timer = BUILD.unitTicks;
  }
  if (--a.timer > 0) return 'running';
  a.ref = (a.ref ?? 0) + 1;
  train(s, w, 'building');
  if (undoUnit(s, j)) return finishWork(s, w, a.ref);
  a.timer = BUILD.unitTicks;
  return 'running';
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
  if (notice && units > 0) sharedJob(s, w, mem.noticeId);
  if (units > 0) judgeWage(s, w, mem.wage);
  if (notice && isSpecialCount(notice.remaining)) {
    // "all" and "forever" notices pay from the treasury as they go
    const pay = units * notice.wage;
    if (pay > 0 && s.gold - s.reserved >= pay) {
      s.gold -= pay;
      w.purse += pay;
      gotPaid(s, w, pay);
    } else if (pay > 0) {
      addMoodlet(s, w, 'unpaid', 'Treasury was empty', -6, MOOD.missedJobTicks);
      unpaidAlert(s, w, `«${orderText(mem.order)}»`);
    }
    w.thought = `Done: ${units} ${mem.order[1]?.t.toLowerCase() ?? ''}.`;
    // "all" is finished once there's nothing left to do
    if (notice.remaining === ALL && units > 0 && allDone(s, notice)) {
      tookNotice(s, w, notice.id);
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
    if (pay > 0) gotPaid(s, w, pay);
    const what = `${counted} ${mem.order[1].t.toLowerCase()}`;
    w.thought = pay > 0 ? `Done! ${what}, +${pay} gold.` : `Done: ${what}.`;
    if (notice.remaining === 0) {
      tookNotice(s, w, notice.id);
      s.notices = s.notices.filter((n) => n.id !== notice.id);
      log(s, `Notice finished: ${orderText(notice.order)}.`);
    }
  } else {
    const penalty = Math.min(MOOD.missedJobCap, MOOD.missedJobBase + mem.wage * MOOD.missedJobPerWage);
    addMoodlet(s, w, 'missed', 'Did a job for nothing', -penalty, MOOD.missedJobTicks);
    w.thought = 'Somebody beat me to it! No pay?!';
    beatenTo(s, w, mem.noticeId);
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

import { addMoodlet, dropCarried, log, moveTo, settle } from './actions';
import { orderText, type Noun, type Verb } from './lang';
import { rand, randInt } from './rng';
import { carryCapacity, expectedUnits, practice, rollYield, SKILL_LABEL, SKILL_OF_VERB, skillLevel } from './skills';
import { ECONOMY, MOOD, NEEDS, POPULATION, SKILLS, WORK } from './tuning';
import type { ActivityKind, Item, ItemType, Notice, SimState, SiteKind, SkillId, Worker } from './types';
import { siteOf, spotFor, standable } from './world';

export type Result = 'running' | 'done' | 'failed';

export function startActivity(w: Worker, kind: ActivityKind): void {
  w.activity = { kind, stage: 0, timer: 0, target: null, ref: null };
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
      n.remaining > 0 &&
      (n.addressee === null || n.addressee === w.id) &&
      !w.avoid.some((av) => av.noticeId === n.id && av.until > s.tick) &&
      !nothingToHaul(s, n),
  );
}

/**
 * On the ground, workers can see whether there's anything lying around, so
 * they don't take a haul job for an empty field.
 */
function nothingToHaul(s: SimState, n: Notice): boolean {
  if (n.order[0].t !== 'HAUL') return false;
  const type = nounItem(n.order[1].t as Noun);
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
  const options = eligibleNotices(s, w);
  if (options.length === 0) {
    w.thought = 'Nothing on the board for me.';
    return 'failed';
  }
  const best = pickNotice(s, w, options);
  w.memory = { noticeId: best.id, order: best.order.map((t) => ({ ...t })), wage: best.wage };
  w.thought = `I'll ${orderText(best.order)}.`;
  return 'done';
}

/**
 * Weighted random pick. Better pay is more likely, never certain, so
 * low-wage jobs still get done. Notices addressed to the worker by name
 * always win: a worker always recognizes their own name.
 */
export function pickNotice(s: SimState, w: Worker, options: Notice[]): Notice {
  const named = options.filter((n) => n.addressee === w.id);
  const pool = named.length > 0 ? named : options;
  let total = 0;
  const weights = pool.map((n) => {
    // wages are per unit, so a skilled worker earns more per trip at their
    // specialty, and likes doing what they're good at besides
    const verb = n.order[0].t as Verb;
    const appeal =
      WORK.boardWeightBase +
      n.wage * w.p.greed * expectedUnits(w, verb) +
      skillLevel(w, SKILL_OF_VERB[verb]) * SKILLS.pickPerLevel;
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
  const verb = mem.order[0]?.t as Verb;
  const noun = mem.order[1]?.t as Noun;
  const prod = PRODUCE[verb];
  if (prod) return produceJob(s, w, prod.site, prod.ticks, prod.doing, nounItem(noun));
  if (verb === 'HAUL') return haulJob(s, w, nounItem(noun));
  if (verb === 'COOK') return cookJob(s, w);
  return failJob(s, w, "I don't know how to do that.");
}

function produceJob(s: SimState, w: Worker, site: SiteKind, ticks: number, doing: string, out: ItemType): Result {
  const a = w.activity;
  if (a.stage === 0) {
    if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
    w.thought = `Heading to the ${site}.`;
    const m = moveTo(s, w, spotFor(siteOf(s, site), w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failJob(s, w, "Can't get there.");
    a.stage = 1;
    a.timer = ticks;
    w.thought = doing;
  }
  if (--a.timer > 0) return 'running';
  const skill = SKILL_OF_VERB[w.memory!.order[0].t as Verb];
  const units = rollYield(s.rng, w, skill, 1);
  for (let i = 0; i < units; i++) s.items.push({ id: s.nextId++, type: out, x: w.x, y: w.y, reservedBy: null });
  train(s, w, skill);
  return completeJob(s, w, units);
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

function haulJob(s: SimState, w: Worker, type: ItemType): Result {
  const a = w.activity;
  const pile = siteOf(s, 'stockpile');
  if (a.stage === 0) {
    if (w.carrying === type) {
      // picking a haul back up after a break: deliver what's in hand
      a.stage = 2;
    } else {
      if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
      if (claimLoad(s, w, type, carryCapacity(w)) === 0) return failJob(s, w, `No ${type} lying around to haul.`);
      a.stage = 1;
      w.thought = `Fetching ${type}.`;
    }
  }
  if (a.stage === 1) {
    const next = nearestClaimed(s, w);
    if (!next) {
      if (w.carryCount === 0) return failJob(s, w, "Couldn't get to it.");
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
    w.thought = w.carryCount > 1 ? `Taking ${w.carryCount} ${type} to the stockpile.` : `Taking ${type} to the stockpile.`;
    const m = moveTo(s, w, spotFor(pile, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return failJob(s, w, "Can't reach the stockpile.");
    a.stage = 3;
    a.timer = WORK.dropTicks;
  }
  if (--a.timer > 0) return 'running';
  const units = w.carryCount;
  pile.store[type] += units;
  w.carrying = null;
  w.carryCount = 0;
  train(s, w, 'hauling');
  return completeJob(s, w, units);
}

function train(s: SimState, w: Worker, skill: SkillId): void {
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
      if (pile.store.grain <= 0) return failJob(s, w, 'No grain in the stockpile.');
      w.thought = 'Fetching grain.';
      const m = moveTo(s, w, spotFor(pile, w.id));
      if (m === 'moving') return 'running';
      if (m === 'unreachable') return failJob(s, w, "Can't reach the stockpile.");
      if (pile.store.grain <= 0) return failJob(s, w, 'Somebody took the last grain.');
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
    if (m === 'unreachable') return failJob(s, w, "Can't reach the kitchen.");
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
  return completeJob(s, w, units);
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
  if (notice && notice.remaining > 0) {
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

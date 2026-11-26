import { releaseReservations } from './actions';
import { cheapestBeer, boardOptions, breadAvailable, runActivity, startActivity } from './activities';
import { rand } from './rng';
import { AI, CONFUSION, ECONOMY, LESSON, MOOD, NEEDS, OVERWORK, SCRIBE } from './tuning';
import { isWorkVerb } from './lang';
import { levelOfRow, updateDrift } from './drift';
import { lessonFor } from './scrolls';
import { tallyGrievances, updateMorale, walkHome } from './morale';
import type { ActivityKind, Score, SimState, Worker } from './types';

// Utility AI. Each think, a worker scores everything they could be doing and
// does the highest. Wages compete directly with needs and personality, which
// is what makes them "work to live" rather than live to work.

function urgency(n: number): number {
  if (n < NEEDS.noticeThreshold) return 0;
  return ((n * n) / 100) * AI.needScale;
}

export function scoreOptions(s: SimState, w: Worker, inProgress: boolean): Score[] {
  const out: Score[] = [];
  const cur = inProgress ? w.activity.kind : null;
  const add = (kind: ActivityKind, label: string, base: number) => {
    let score = base + rand(s.rng) * AI.noise;
    if (kind === cur) score += AI.inertia;
    out.push({ kind, label, score: Math.round(score * 10) / 10 });
  };

  if (w.hunger >= NEEDS.noticeThreshold && (breadAvailable(s) || cur === 'eat')) {
    add('eat', 'Eat', urgency(w.hunger));
  }
  if (w.thirst >= NEEDS.noticeThreshold) add('drink', 'Drink', urgency(w.thirst));

  const asleep = cur === 'sleep' && w.activity.stage >= 1;
  if (asleep) {
    // once asleep, stay asleep until rested unless something is urgent
    add('sleep', 'Keep sleeping', Math.max(urgency(w.fatigue), 30) + 20);
  } else if (w.fatigue >= (waitingForOrders(s) ? AI.openingSleepAbove : NEEDS.noticeThreshold)) {
    add('sleep', 'Sleep', urgency(w.fatigue));
  }

  const wageAppeal = (wage: number) => wage * w.p.greed * AI.wageWeight;
  const scroll = w.held[0];
  if (scroll && scroll.waitUntil <= s.tick && scroll.pc < scroll.orders.length) {
    const line = labelOf(scroll.orders[scroll.pc]);
    add('scroll', `${scroll.kind === 'card' ? 'Card' : 'Scroll'}: ${line}`, AI.workBase * w.p.work + wageAppeal(scroll.wage) + SCRIBE.duty);
  }
  // one current job at a time: a remembered notice, or the line of the
  // scroll in hand. Only someone with neither goes to read the board.
  if (w.memory) {
    add('job', `Work: ${labelOf(w.memory.order)}`, AI.workBase * w.p.work + wageAppeal(w.memory.wage));
  } else if (w.held.length === 0) {
    const options = boardOptions(s, w);
    if (options.length > 0) {
      let best = 0;
      let named = false;
      for (const o of options) {
        best = Math.max(best, o.kind === 'notice' ? o.n.wage : o.c.wage);
        const to = o.kind === 'notice' ? o.n.addressee : o.c.dest.kind === 'board' ? o.c.dest.addressee : null;
        if (to === w.id || (o.kind === 'scroll' && o.c.patron)) named = true;
      }
      add('readBoard', 'Check the board', AI.workBase * w.p.work * 0.9 + wageAppeal(best) + (named ? 30 : 0));
    }
  }

  // a translator on the ground is calling this worker's name
  if (levelOfRow(w.y) === 0 && lessonFor(s, w)) add('lesson', 'Answer the call to a lesson', LESSON.pull);

  const price = cheapestBeer(s);
  if (cur === 'bar' || (price !== null && w.purse >= price)) {
    // how many beers the purse would buy, at the usual price's scale; cheap beer tempts more
    const beers = price === null || price === 0 ? Infinity : w.purse / price;
    const gold = Math.min(AI.barCap, beers * ECONOMY.beerPrice * AI.barPerGold * w.p.spend);
    const blues = Math.max(0, 60 - w.mood) * AI.barMoodWeight;
    // just had one: had their fill for now
    const full = cur !== 'bar' && w.moodlets.some((m) => m.kind === 'bar') ? AI.barAfterDrink : 1;
    add('bar', 'Go to the bar', (gold + blues) * full);
  }

  add('wander', 'Wander', AI.wanderBase);
  add('idle', 'Stand around', AI.wanderBase - 2);

  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * The very start of a new game, before the scriptorium is placed: nobody has
 * been given anything to do yet, so workers mill around (and eat and drink)
 * rather than lie down, unless they're really worn out.
 */
function waitingForOrders(s: SimState): boolean {
  return s.start === 'opening' && !s.sites.some((x) => x.kind === 'scriptorium');
}

function labelOf(order: { t: string }[]): string {
  return order.map((t) => t.t.toLowerCase()).join(' ');
}

export function think(s: SimState, w: Worker, inProgress: boolean): void {
  const scores = scoreOptions(s, w, inProgress);
  w.lastScores = scores;
  w.nextThink = s.tick + AI.thinkInterval;
  const best = scores[0];
  if (inProgress && best.kind === w.activity.kind) return;
  switchTo(s, w, best.kind);
}

function switchTo(s: SimState, w: Worker, kind: ActivityKind): void {
  // leaving a job mid-way keeps it in memory but frees anything claimed
  releaseReservations(s, w);
  startActivity(w, kind);
}

export function updateNeeds(s: SimState, w: Worker): void {
  const asleep = w.activity.kind === 'sleep' && w.activity.stage >= 1;
  const slow = asleep ? 0.5 : 1;
  w.hunger = Math.min(100, w.hunger + NEEDS.hungerRate * w.p.hunger * slow);
  w.thirst = Math.min(100, w.thirst + NEEDS.thirstRate * slow);
  if (!asleep) w.fatigue = Math.min(100, w.fatigue + NEEDS.fatigueRate * w.p.fatigue);

  w.moodlets = w.moodlets.filter((m) => m.until > s.tick);
  if (w.avoid.length > 0) w.avoid = w.avoid.filter((av) => av.until > s.tick);
  let target = MOOD.base + w.p.moodBias;
  for (const m of w.moodlets) target += m.value;
  // what's weighing on them, by kind, so they can say why they're fed up
  const hunger = (w.hunger > 70 ? MOOD.hungryPenalty : 0) + (w.hunger > 90 ? MOOD.desperatePenalty.hunger : 0);
  const thirst = (w.thirst > 70 ? MOOD.thirstyPenalty : 0) + (w.thirst > 90 ? MOOD.desperatePenalty.thirst : 0);
  const tiredness = (w.fatigue > 70 ? MOOD.tiredPenalty : 0) + (w.fatigue > 90 ? MOOD.desperatePenalty.fatigue : 0);
  const confusion = w.confusion > CONFUSION.moodAbove ? CONFUSION.moodPenalty : 0;
  const overwork = updateOverwork(w, asleep);
  target -= hunger + thirst + tiredness + confusion + overwork;
  tallyGrievances(w, { hunger, thirst, tiredness, confusion, overwork });
  target = Math.max(0, Math.min(100, target));
  w.mood += (target - w.mood) * MOOD.smoothing;
}

/**
 * A long stretch of work with no real break wears on a worker. Work is a job
 * or a working line of a scroll (not waiting or checking); a meal, a drink,
 * a wander or a rest takes it down, and sleep wipes it. Returns the mood it
 * costs them now.
 */
function updateOverwork(w: Worker, asleep: boolean): number {
  const k = w.activity.kind;
  let working = k === 'job';
  if (k === 'scroll') {
    const c = w.held[0];
    const verb = c && c.pc < c.orders.length ? c.orders[c.pc][0].t : null;
    working = verb !== null && (isWorkVerb(verb) || verb === 'WRITE' || verb === 'DELIVER' || verb === 'TEACH' || verb === 'LEARN');
  }
  let streak = w.workStreak ?? 0;
  if (asleep) streak = 0;
  else if (working) streak++;
  else if (k === 'eat' || k === 'drink' || k === 'bar' || k === 'wander' || k === 'idle' || k === 'sleep') streak = Math.max(0, streak - OVERWORK.restPerTick);
  w.workStreak = streak;
  return Math.min(OVERWORK.max, Math.max(0, streak - OVERWORK.after) * OVERWORK.perTick);
}

/** Advance one worker. Returns true if they've walked off home for good. */
export function updateWorker(s: SimState, w: Worker): boolean {
  if (w.leaving) return walkHome(s, w);
  updateNeeds(s, w);
  updateDrift(s, w);
  updateMorale(s, w);
  if (w.leaving) return false;
  if (s.tick >= w.nextThink) think(s, w, true);
  const r = runActivity(s, w);
  if (r !== 'running') {
    releaseReservations(s, w);
    think(s, w, false);
  }
  return false;
}

import { releaseReservations } from './actions';
import { boardOptions, runActivity, startActivity } from './activities';
import { rand } from './rng';
import { AI, ECONOMY, MOOD, NEEDS, SCRIBE } from './tuning';
import type { ActivityKind, Score, SimState, Worker } from './types';
import { siteOf } from './world';

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

  const kitchen = siteOf(s, 'kitchen');
  if (w.hunger >= NEEDS.noticeThreshold && (kitchen.store.bread > 0 || cur === 'eat')) {
    add('eat', 'Eat', urgency(w.hunger));
  }
  if (w.thirst >= NEEDS.noticeThreshold) add('drink', 'Drink', urgency(w.thirst));

  const asleep = cur === 'sleep' && w.activity.stage >= 1;
  if (asleep) {
    // once asleep, stay asleep until rested unless something is urgent
    add('sleep', 'Keep sleeping', Math.max(urgency(w.fatigue), 30) + 20);
  } else if (w.fatigue >= NEEDS.noticeThreshold) {
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

  if (w.purse >= ECONOMY.tavernCost) {
    const gold = Math.min(AI.tavernCap, w.purse * AI.tavernPerGold * w.p.spend);
    const blues = Math.max(0, 60 - w.mood) * AI.tavernMoodWeight;
    add('tavern', 'Go to the tavern', gold + blues);
  }

  add('wander', 'Wander', AI.wanderBase);
  add('idle', 'Stand around', AI.wanderBase - 2);

  out.sort((a, b) => b.score - a.score);
  return out;
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
  if (w.hunger > 70) target -= MOOD.hungryPenalty;
  if (w.thirst > 70) target -= MOOD.thirstyPenalty;
  if (w.fatigue > 70) target -= MOOD.tiredPenalty;
  target = Math.max(0, Math.min(100, target));
  w.mood += (target - w.mood) * MOOD.smoothing;
}

export function updateWorker(s: SimState, w: Worker): void {
  updateNeeds(s, w);
  if (s.tick >= w.nextThink) think(s, w, true);
  const r = runActivity(s, w);
  if (r !== 'running') {
    releaseReservations(s, w);
    think(s, w, false);
  }
}

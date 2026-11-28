import { addMoodlet, alert, dropCarried, log, moveTo, releaseReservations } from './actions';
import { startActivity } from './activities';
import { carrierText } from './carriers';
import { dayOf, hourOf } from './time';
import { BONUS, GRIEVANCE_DECAY, QUIT, REMIT, TIME } from './tuning';
import type { Complaint, SimState, Worker } from './types';
import { siteOf } from './world';
import { farewell } from './social';

// Workers work to live. Let someone's mood fall below the quit line and
// they're fed up: you can see it. If it's still that bad at the end of the
// shift, they give notice, and leave when it runs out unless things get
// better. If not, they put down whatever they were doing and walk home down
// the road. Losing the one worker your whole system depends on should hurt.

/** A shift is a quarter of a day: dawn to noon, noon to dusk, dusk to midnight, midnight to dawn. */
export const SHIFT_TICKS = TIME.dayTicks / 4;

/** Did a shift just end (dawn, noon, dusk or midnight came this tick)? */
export function shiftEnded(tick: number): boolean {
  return tick > 0 && Math.floor(hourOf(tick) / 6) !== Math.floor(hourOf(tick - 1) / 6);
}

/** "noon on day 15": a shift boundary as the player reads it. */
export function whenText(tick: number): string {
  const h = Math.round(hourOf(tick)) % 24;
  const name = h === 0 ? 'midnight' : h === 6 ? 'dawn' : h === 12 ? 'noon' : h === 18 ? 'dusk' : `${String(h).padStart(2, '0')}:00`;
  // midnight on its own is ambiguous: say which day it starts
  return h === 0 ? `midnight going into day ${dayOf(tick)}` : `${name} on day ${dayOf(tick)}`;
}

/** How a complaint reads in a sentence: "fed up with hunger and confusing orders". */
export const COMPLAINT_TEXT: Record<Complaint, string> = {
  hunger: 'hunger',
  thirst: 'thirst',
  tiredness: 'tiredness',
  rough: 'sleeping on the ground',
  confusion: 'confusing orders',
  wasted: 'wasted work',
  unpaid: 'going unpaid',
  scrounging: 'scrounging for materials',
  others: 'the people around them',
  overwork: 'overwork',
  lowpay: 'low wages',
  other: 'their lot',
};

/** Which complaint a moodlet counts toward, when it's a bad one. */
const MOODLET_COMPLAINT: Record<string, Complaint> = {
  slept: 'rough',
  unpaid: 'unpaid',
  missed: 'wasted',
  failed: 'wasted',
  scavenged: 'scrounging',
  company: 'others',
  scuffle: 'others',
  farewell: 'others',
  lowpay: 'lowpay',
};

/**
 * Each tick: add what's lowering their mood to their complaints, by kind,
 * and let older complaints fade (by half over about a shift). `penalties`
 * are the mood lost to needs, confusion and overwork this tick.
 */
export function tallyGrievances(w: Worker, penalties: Partial<Record<Complaint, number>>): void {
  const g = (w.grievances ??= {});
  for (const k in g) {
    const v = g[k as Complaint]! * GRIEVANCE_DECAY;
    if (v < 0.01) delete g[k as Complaint];
    else g[k as Complaint] = v;
  }
  for (const [k, v] of Object.entries(penalties)) if (v && v > 0) g[k as Complaint] = (g[k as Complaint] ?? 0) + v;
  for (const m of w.moodlets) {
    if (m.value >= 0) continue;
    const k = MOODLET_COMPLAINT[m.kind] ?? 'other';
    g[k] = (g[k] ?? 0) + -m.value;
  }
}

/** Their biggest complaints lately, worst first. */
export function topComplaints(w: Worker, n = 2): Complaint[] {
  return (Object.entries(w.grievances ?? {}) as [Complaint, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function complaintsText(w: Worker): string {
  const top = topComplaints(w).map((k) => COMPLAINT_TEXT[k]);
  return top.length === 0 ? 'how things are going' : top.length === 1 ? top[0] : `${top[0]} and ${top[1]}`;
}

export function updateMorale(s: SimState, w: Worker): void {
  if (w.leaving) return;
  const line = s.settings.quitBelow;
  if (w.noticeUntil === null) {
    // fed up the moment mood falls below the line; it passes quietly if it's back up before the shift ends
    if (w.mood < line) w.fedUpSince ??= s.tick;
    else w.fedUpSince = null;
    if (w.fedUpSince !== null && w.fedUpSince !== undefined && shiftEnded(s.tick) && s.tick - w.fedUpSince >= QUIT.minFedUpTicks) giveNotice(s, w);
    return;
  }
  if (w.mood >= line) {
    w.noticeUntil = null;
    w.fedUpSince = null;
    log(s, `${w.name} has decided to stay after all.`, w.id);
    return;
  }
  if (s.tick >= w.noticeUntil) startLeaving(s, w);
}

/** It's official: they'll leave at the end of their notice unless their mood is back at the line. */
function giveNotice(s: SimState, w: Worker): void {
  w.noticeUntil = s.tick + s.settings.noticeShifts * SHIFT_TICKS;
  const when = whenText(w.noticeUntil);
  const why = complaintsText(w);
  log(s, `${w.name} has given notice: fed up with ${why}. They'll leave at ${when} unless things get better.`, w.id);
  alert(
    s,
    'notice',
    `${w.name} has put in notice`,
    `${w.name} is fed up with ${why} and has put in notice that they will quit and leave at ${when} unless their mood rises to ${s.settings.quitBelow} or above. Address the issues that ${w.name} is complaining about or if all else fails send them a bonus.`,
    w.id,
  );
}

/**
 * Dawn: workers with a full purse send a good share of it home to their
 * families. One log line for everyone who sent something.
 */
export function sendMoneyHome(s: SimState): void {
  const sent: string[] = [];
  for (const w of s.workers) {
    if (w.leaving) continue;
    const kind = w.traits.includes('frugal') ? 'frugal' : w.traits.includes('spendthrift') ? 'spendthrift' : 'usual';
    if (w.purse < REMIT.fullAt[kind]) continue;
    const gold = Math.floor(w.purse * REMIT.share[kind]);
    if (gold <= 0) continue;
    w.purse -= gold;
    s.sentHome += gold;
    const m = REMIT.mood;
    addMoodlet(s, w, 'remit', `Sent ${gold} gold home`, Math.round(Math.min(m.max, m.base + gold * m.perGold)), REMIT.moodTicks);
    sent.push(`${w.name} ${gold}`);
  }
  if (sent.length) log(s, `Sent home to their families at dawn: ${sent.join(', ')} gold.`);
}

/**
 * How much a bonus of this much gold would lift them, handed over now: less
 * when their purse is already full, more when they're greedy, and never
 * less than BONUS.leastPerGold a gold (100 gold always rescues).
 */
export function bonusLift(w: Worker, gold: number): number {
  const rich = BONUS.purseRef / (BONUS.purseRef + Math.max(0, w.purse));
  const full = gold * BONUS.perGold * w.p.greed * rich;
  return Math.round(Math.min(BONUS.max, Math.max(full, gold * BONUS.leastPerGold)));
}

/**
 * A bonus in hand: the gold goes in their purse and the lift lands at once,
 * lasting a day. Another bonus while that's still warm adds to it, up to
 * BONUS.max. Paid well, they stop grumbling about pay.
 */
export function receiveBonus(s: SimState, w: Worker, gold: number): number {
  const lift = bonusLift(w, gold);
  w.purse += gold;
  const before = w.moodlets.find((m) => m.kind === 'bonus');
  const value = Math.min(BONUS.max, (before?.value ?? 0) + lift);
  addMoodlet(s, w, 'bonus', before ? 'Bonuses lately' : `A bonus of ${gold} gold`, value, BONUS.ticks);
  w.mood = Math.min(100, w.mood + (value - (before?.value ?? 0)));
  if (w.grievances) {
    delete w.grievances.unpaid;
    delete w.grievances.lowpay;
  }
  return value - (before?.value ?? 0);
}

/** Put everything down and head for the road home. */
export function startLeaving(s: SimState, w: Worker, following: Worker | null = null): void {
  w.leaving = true;
  w.noticeUntil = null;
  if (w.stepProgress === 0) dropCarried(s, w);
  if (w.bag.length > 0) {
    s.outbox.push(...w.bag);
    w.bag = [];
  }
  for (const c of w.held) log(s, `${w.name} left their ${c.kind} behind: ${carrierText(c)}.`, w.id);
  w.held = [];
  w.memory = null;
  releaseReservations(s, w);
  startActivity(w, 'idle');
  w.thought = 'Going home.';
  log(s, `${w.name} has quit and is walking home.`, w.id);
  alert(s, 'quit', `${w.name} has quit`, following ? `${w.name} is going home with ${following.name}.` : `${w.name} has quit and is walking home, fed up with ${complaintsText(w)}.`, w.id);
  for (const f of farewell(s, w)) startLeaving(s, f, w);
}

/** A leaving worker walks to the road home and is gone. Returns true once they've left. */
export function walkHome(s: SimState, w: Worker): boolean {
  const road = siteOf(s, 'home');
  if (w.carrying && w.stepProgress === 0) dropCarried(s, w);
  const m = moveTo(s, w, { x: road.x0, y: road.y });
  return m !== 'moving';
}

/** Remove workers who reached the road home. Called once per tick. */
export function removeDeparted(s: SimState, departed: Worker[]): void {
  if (departed.length === 0) return;
  for (const w of departed) {
    s.leftWith += w.purse;
    log(s, `${w.name} has gone home${w.purse > 0 ? `, taking ${w.purse} gold with them` : ''}.`, w.id);
  }
  s.workers = s.workers.filter((w) => !departed.includes(w));
}

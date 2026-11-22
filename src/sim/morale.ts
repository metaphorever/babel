import { dropCarried, log, moveTo, releaseReservations } from './actions';
import { startActivity } from './activities';
import { carrierText } from './carriers';
import { QUIT, TICKS_PER_SECOND } from './tuning';
import type { SimState, Worker } from './types';
import { siteOf } from './world';

// Workers work to live. Keep someone miserable for long enough and they
// give notice; if things get better before it runs out, they stay. If not,
// they put down whatever they were doing and walk home down the road. Losing
// the one worker your whole system depends on should hurt.

export function updateMorale(s: SimState, w: Worker): void {
  if (w.leaving) return;
  if (w.mood < QUIT.lowMood) w.lowMoodTicks++;
  else if (w.lowMoodTicks > 0) w.lowMoodTicks = Math.max(0, w.lowMoodTicks - 2);

  if (w.noticeUntil === null) {
    if (w.lowMoodTicks >= QUIT.sustainTicks) {
      w.noticeUntil = s.tick + QUIT.noticeTicks;
      const secs = Math.round(QUIT.noticeTicks / TICKS_PER_SECOND);
      log(s, `${w.name} has given notice. Unless things get better, they'll leave in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}.`, w.id);
    }
    return;
  }
  if (w.mood > QUIT.stayAbove) {
    w.noticeUntil = null;
    w.lowMoodTicks = 0;
    log(s, `${w.name} has decided to stay after all.`, w.id);
    return;
  }
  if (s.tick >= w.noticeUntil) startLeaving(s, w);
}

/** Put everything down and head for the road home. */
export function startLeaving(s: SimState, w: Worker): void {
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

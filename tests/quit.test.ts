import { describe, expect, it } from 'vitest';
import { createState, step } from '../src/sim/sim';
import { gotPaid, judgeWage } from '../src/sim/actions';
import { SHIFT_TICKS, shiftEnded, topComplaints, whenText } from '../src/sim/morale';
import { hourOf } from '../src/sim/time';
import { OVERWORK, QUIT, TIME } from '../src/sim/tuning';
import type { Difficulty } from '../src/sim/tuning';
import type { SimState, Worker } from '../src/sim/types';

function runUntil(s: SimState, done: () => boolean, maxTicks: number): boolean {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return true;
    step(s);
  }
  return done();
}

/** A worker made miserable by a long-lasting bad moodlet of this kind. */
function miserable(s: SimState, kind = 'test', value = -60): Worker {
  const w = s.workers[3];
  w.moodlets.push({ kind, label: 'Miserable', value, until: 1e9 });
  w.mood = 10;
  return w;
}

describe('session 7: quitting on shifts', () => {
  it('names deadlines by the clock: the day turns over at midnight', () => {
    const hour = TIME.dayTicks / 24;
    const at = (h: number) => (h - TIME.startHour) * hour; // tick of hour h, counted from day 1's start
    expect(whenText(at(12))).toBe('noon on day 1');
    expect(whenText(at(18))).toBe('dusk on day 1');
    expect(whenText(at(24))).toBe('midnight going into day 2');
    expect(whenText(at(30))).toBe('dawn on day 2');
  });

  it('fed up at once, notice only at the end of the shift, on a shift boundary', () => {
    const s = createState(12);
    const w = miserable(s);
    step(s);
    expect(w.fedUpSince).not.toBeNull();
    expect(w.noticeUntil).toBeNull();
    expect(runUntil(s, () => w.noticeUntil !== null, TIME.dayTicks)).toBe(true);
    // given at a shift boundary (the tick before the clock moved on), and due on one
    const given = w.noticeUntil! - QUIT.noticeShifts.normal * SHIFT_TICKS;
    expect(given).toBe(s.tick - 1);
    expect(shiftEnded(given)).toBe(true);
    expect(given - w.fedUpSince!).toBeGreaterThanOrEqual(QUIT.minFedUpTicks);
    expect(Math.round(hourOf(w.noticeUntil!)) % 6).toBe(0);
    // and the player is told why
    const a = s.alerts.find((x) => x.kind === 'notice' && x.workerId === w.id)!;
    expect(a).toBeTruthy();
    expect(a.text).toContain(`unless their mood rises to ${QUIT.lowMood} or above`);
    expect(a.text).toContain(whenText(w.noticeUntil!));
  });

  it('notice lasts a day on easy, two shifts on normal, one on hard', () => {
    for (const [d, shifts] of [['easy', 4], ['normal', 2], ['hard', 1]] as [Difficulty, number][]) {
      const s = createState(12, d);
      const w = miserable(s);
      expect(runUntil(s, () => w.noticeUntil !== null, TIME.dayTicks)).toBe(true);
      expect(w.noticeUntil! - (s.tick - 1)).toBe(shifts * SHIFT_TICKS);
    }
  });

  it('a bad patch that passes before the shift ends passes quietly', () => {
    const s = createState(12);
    const w = s.workers[3];
    w.moodlets.push({ kind: 'test', label: 'Brief upset', value: -60, until: s.tick + 100 });
    w.mood = 10;
    step(s);
    expect(w.fedUpSince).not.toBeNull();
    // cheered up well before the end of the shift
    w.moodlets.push({ kind: 'cheer', label: 'Good news', value: 30, until: 1e9 });
    expect(runUntil(s, () => w.fedUpSince === null, 600)).toBe(true);
    for (let i = 0; i < TIME.dayTicks / 2; i++) step(s);
    expect(w.noticeUntil).toBeNull();
    expect(s.alerts.some((a) => a.kind === 'notice')).toBe(false);
  });

  it('on notice, a mood back at the line means they stay', () => {
    const s = createState(12);
    const w = miserable(s);
    expect(runUntil(s, () => w.noticeUntil !== null, TIME.dayTicks)).toBe(true);
    w.moodlets = w.moodlets.filter((m) => m.kind !== 'test');
    expect(runUntil(s, () => w.noticeUntil === null, 600)).toBe(true);
    expect(w.leaving).toBe(false);
  });

  it('names what they are fed up with: the biggest causes lately', () => {
    const s = createState(12);
    const w = s.workers[3];
    w.hunger = 95;
    w.confusion = 100;
    w.mood = 10;
    for (let i = 0; i < 300; i++) {
      w.hunger = 95;
      w.confusion = 100;
      step(s);
    }
    expect(topComplaints(w)).toEqual(['hunger', 'confusion']);
  });

  it('low wages are a real complaint, judged against their greed', () => {
    const s = createState(12);
    const w = s.workers[3];
    w.p.greed = 1;
    judgeWage(s, w, 5);
    expect(w.moodlets.some((m) => m.kind === 'lowpay')).toBe(false);
    judgeWage(s, w, 0);
    const m = w.moodlets.find((x) => x.kind === 'lowpay')!;
    expect(m.value).toBeLessThan(0);
    expect(m.label).toBe('Working for nothing');
  });

  it('pay cheers more the more it is', () => {
    const s = createState(12);
    const w = s.workers[3];
    gotPaid(s, w, 1);
    const small = w.moodlets.find((x) => x.kind === 'paid')!.value;
    gotPaid(s, w, 50);
    const big = w.moodlets.find((x) => x.kind === 'paid')!.value;
    expect(big).toBeGreaterThan(small);
  });

  it('a long stretch of work with no break wears on them; a break takes it off', () => {
    const s = createState(12);
    const w = s.workers[3];
    w.workStreak = OVERWORK.after + 1500;
    w.activity = { kind: 'job', stage: 0, timer: 0, target: null, ref: null, read: null, aim: null };
    w.memory = { order: [{ t: 'MINE', lang: 'en' }, { t: 'STONE', lang: 'en' }], wage: 1, noticeId: -1 } as never;
    w.mood = 50;
    step(s);
    expect((w.grievances?.overwork ?? 0)).toBeGreaterThan(0);
    w.activity = { kind: 'wander', stage: 0, timer: 0, target: null, ref: null, read: null, aim: null };
    w.memory = null;
    const before = w.workStreak!;
    step(s);
    expect(w.workStreak!).toBeLessThan(before);
  });
});

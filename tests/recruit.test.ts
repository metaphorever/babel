import { describe, expect, it } from 'vitest';
import { applyCommand, availableGold, validateCommand } from '../src/sim/commands';
import { startLeaving } from '../src/sim/morale';
import { goldText, headcount, recruitError, recruitFee } from '../src/sim/recruit';
import { createState, step } from '../src/sim/sim';
import { ARRIVALS, PATRON, POPULATION, RECRUIT } from '../src/sim/tuning';
import { siteOf } from '../src/sim/world';
import type { Command } from '../src/sim/commands';
import type { SimState } from '../src/sim/types';

const recruit: Command = { type: 'recruit', playerId: 0 };

function run(s: SimState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(s);
}

describe('§16.9 step 4: recruiting', () => {
  it('writes big sums with commas', () => {
    expect(goldText(15)).toBe('15');
    expect(goldText(1215)).toBe('1,215');
    expect(goldText(13500)).toBe('13,500');
    expect(goldText(1234567)).toBe('1,234,567');
  });

  it('the fee is perSquare × the headcount with the recruit, cheap when few are left', () => {
    const s = createState(12);
    const n = headcount(s);
    expect(n).toBe(POPULATION.start);
    expect(recruitFee(s)).toBe(RECRUIT.perSquare * (n + 1) * (n + 1));
    // workers on their way home don't count
    for (const w of s.workers.slice(0, n - 1)) startLeaving(s, w);
    expect(headcount(s)).toBe(1);
    expect(recruitFee(s)).toBe(RECRUIT.perSquare * 4);
    startLeaving(s, s.workers[n - 1]);
    expect(headcount(s)).toBe(0);
    // never free: with nobody left, it's the price of one
    expect(recruitFee(s)).toBe(RECRUIT.perSquare);
  });

  it('pays at once and the recruit walks in from the road, with no scribe or courier', () => {
    const s = createState(12);
    s.gold = 5000;
    const fee = recruitFee(s);
    const before = s.workers.length;
    const designs = s.designs.length;
    expect(applyCommand(s, recruit).ok).toBe(true);
    expect(s.gold).toBe(5000 - fee);
    expect(s.workers.length).toBe(before + 1);
    expect(s.designs.length).toBe(designs);
    const w = s.workers[s.workers.length - 1];
    const road = siteOf(s, 'home');
    expect(w.x).toBe(road.x0);
    expect(w.y).toBe(road.y);
    expect(w.leaving).toBe(false);
    // everyone here has a feeling about them, and they about everyone
    for (const o of s.workers) {
      if (o === w) continue;
      expect(o.feel[w.id]).toBeTypeOf('number');
      expect(w.feel[o.id]).toBeTypeOf('number');
    }
    expect(s.events[s.events.length - 1].text).toContain(`recruited for ${goldText(fee)} gold`);
    // the next one costs more
    expect(recruitFee(s)).toBeGreaterThan(fee);
    // and they walk into camp
    run(s, 600);
    expect(w.x).toBeGreaterThan(road.x0);
  });

  it("refuses when the treasury can't pay, counting gold already set aside", () => {
    const s = createState(12);
    const fee = recruitFee(s);
    s.gold = fee - 1;
    s.reserved = 0;
    expect(validateCommand(s, recruit).ok).toBe(false);
    expect(recruitError(s)).toContain(`${goldText(fee)} gold`);
    s.gold = fee + 10;
    s.reserved = 11;
    expect(availableGold(s)).toBe(fee - 1);
    expect(validateCommand(s, recruit).ok).toBe(false);
    s.reserved = 10;
    expect(validateCommand(s, recruit).ok).toBe(true);
    expect(applyCommand(s, recruit).ok).toBe(true);
    expect(s.gold).toBe(10);
  });

  it('not past the population cap', () => {
    const s = createState(12);
    s.gold = 1e7;
    while (headcount(s) < POPULATION.cap) expect(applyCommand(s, recruit).ok).toBe(true);
    expect(recruitError(s)).toContain('full');
    expect(applyCommand(s, recruit).ok).toBe(false);
    // someone quitting makes room again
    startLeaving(s, s.workers[0]);
    expect(recruitError(s)).toBeNull();
  });

  it('with everyone gone, a recruit is still within reach of a little gold', () => {
    const s = createState(12);
    for (const w of s.workers) startLeaving(s, w);
    s.gold = RECRUIT.perSquare;
    s.reserved = 0;
    expect(applyCommand(s, recruit).ok).toBe(true);
    expect(headcount(s)).toBe(1);
    expect(s.gold).toBe(0);
  });

  it('the same game twice: recruiting is a command like any other', () => {
    const play = () => {
      const s = createState(12);
      s.gold = 5000;
      for (let t = 0; t < 1500; t++) step(s, t === 200 || t === 700 ? [recruit] : []);
      return s;
    };
    const a = play();
    expect(headcount(a)).toBe(POPULATION.start + 2);
    expect(JSON.stringify(play())).toBe(JSON.stringify(a));
  });

  it('the patron sends newcomers at a rate set by difficulty', () => {
    expect(ARRIVALS.every.easy).toBeLessThan(ARRIVALS.every.normal);
    expect(ARRIVALS.every.normal).toBeLessThan(ARRIVALS.every.hard);
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = createState(12, d);
      expect(s.nextArrival).toBe(ARRIVALS.every[d]);
      s.floors = 5;
      s.patience = 100;
      const before = headcount(s);
      run(s, ARRIVALS.every[d] - 5);
      expect(headcount(s)).toBe(before);
      run(s, 10);
      expect(headcount(s)).toBe(before + 1);
      expect(s.nextArrival).toBe(ARRIVALS.every[d] * 2);
    }
  });

  it('a recruit counts toward the headcount the patron aims for', () => {
    const s = createState(12);
    s.gold = 1e5;
    s.patience = 100;
    s.floors = 1; // the patron aims for start + 1
    expect(applyCommand(s, recruit).ok).toBe(true);
    const n = headcount(s);
    run(s, ARRIVALS.every.normal + 10);
    expect(headcount(s)).toBe(n);
    expect(s.patience).toBeGreaterThanOrEqual(PATRON.recruitAbove);
  });
});

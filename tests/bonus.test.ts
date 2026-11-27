import { describe, expect, it } from 'vitest';
import { applyCommand, availableGold, validateCommand } from '../src/sim/commands';
import { bonusLift, receiveBonus, startLeaving } from '../src/sim/morale';
import { createState, replay, step } from '../src/sim/sim';
import { BONUS, QUIT } from '../src/sim/tuning';
import type { Command } from '../src/sim/commands';
import type { SimState } from '../src/sim/types';

function runUntil(s: SimState, done: () => boolean, maxTicks: number): boolean {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return true;
    step(s);
  }
  return done();
}

const bonus = (workerId: number, gold: number): Command => ({ type: 'bonus', playerId: 0, workerId, gold });

/** Every letter not yet handed over: being written, in the outbox, or in a courier's bag. */
function lettersOut(s: SimState): number {
  return s.designs.filter((d) => d.carrier.kind === 'letter').length + s.outbox.filter((c) => c.kind === 'letter').length + s.workers.reduce((n, w) => n + w.bag.filter((c) => c.kind === 'letter').length, 0);
}

describe('session 9: the bonus letter', () => {
  it('sets the gold aside when composed, and cancelling gives it back', () => {
    const s = createState(12);
    const w = s.workers[3];
    const gold = s.gold;
    const r0 = s.reserved;
    expect(applyCommand(s, bonus(w.id, 50)).ok).toBe(true);
    expect(s.reserved).toBe(r0 + 50);
    expect(s.gold).toBe(gold);
    expect(availableGold(s)).toBe(gold - r0 - 50);
    const d = s.designs.find((x) => x.carrier.kind === 'letter')!;
    expect(d.carrier.gold).toBe(50);
    expect(d.carrier.dest).toEqual({ kind: 'worker', workerId: w.id });
    expect(applyCommand(s, { type: 'cancelDesign', playerId: 0, designId: d.id }).ok).toBe(true);
    expect(s.reserved).toBe(r0);
    expect(s.gold).toBe(gold);
  });

  it('refuses a bonus nobody can pay, or for someone who has quit', () => {
    const s = createState(12);
    const w = s.workers[3];
    expect(validateCommand(s, bonus(w.id, 0)).ok).toBe(false);
    expect(validateCommand(s, bonus(w.id, 2.5)).ok).toBe(false);
    expect(validateCommand(s, bonus(w.id, BONUS.maxGold + 1)).ok).toBe(false);
    expect(validateCommand(s, bonus(9999, 10)).ok).toBe(false);
    s.gold = s.reserved + 30;
    expect(validateCommand(s, bonus(w.id, 31)).ok).toBe(false);
    expect(validateCommand(s, bonus(w.id, 30)).ok).toBe(true);
    startLeaving(s, w);
    expect(validateCommand(s, bonus(w.id, 10)).ok).toBe(false);
  });

  it('the scribe writes it (the gold leaves the treasury then) and a courier hands it over', () => {
    const s = createState(12);
    const w = s.workers[3];
    w.purse = 0;
    applyCommand(s, bonus(w.id, 40));
    const r1 = s.reserved;
    const lift = bonusLift(w, 40);
    expect(runUntil(s, () => !s.designs.some((d) => d.carrier.kind === 'letter'), 3000)).toBe(true);
    // written: out of the treasury and out of the reserve, in the letter now
    expect(s.reserved).toBeLessThanOrEqual(r1 - 40);
    expect(s.events.some((e) => e.text.includes('The gold has left the treasury'))).toBe(true);
    const purse = w.purse;
    expect(runUntil(s, () => w.moodlets.some((m) => m.kind === 'bonus'), 6000)).toBe(true);
    expect(w.purse).toBe(purse + 40);
    expect(w.moodlets.find((m) => m.kind === 'bonus')!.value).toBe(lift);
    expect(lettersOut(s)).toBe(0);
    expect(s.events.some((e) => e.text.includes(`a bonus of 40 gold (+${lift} mood)`))).toBe(true);
  });

  it('lands at once, and the money complaints go with it', () => {
    const s = createState(12);
    const w = s.workers[3];
    w.mood = 20;
    w.grievances = { unpaid: 5, lowpay: 3, hunger: 2 };
    const lift = receiveBonus(s, w, 50);
    expect(lift).toBeGreaterThan(0);
    expect(w.mood).toBe(20 + lift);
    expect(w.grievances).toEqual({ hunger: 2 });
  });

  it('is sized by the purse and greed, never past the cap', () => {
    const s = createState(12);
    const w = s.workers[3];
    w.p.greed = 1;
    w.purse = 0;
    const poor = bonusLift(w, 30);
    w.purse = 80;
    const rich = bonusLift(w, 30);
    expect(rich).toBeLessThan(poor);
    w.p.greed = 1.6;
    expect(bonusLift(w, 30)).toBeGreaterThan(rich);
    expect(bonusLift(w, BONUS.maxGold)).toBe(BONUS.max);
  });

  it('100 gold rescues anyone: back at the quit line, and they stay', () => {
    const s = createState(12);
    const w = s.workers[3];
    // as unimpressed as a worker can be: least greedy, a fat purse, at rock bottom, on notice
    w.p.greed = 0.8;
    w.purse = 500;
    w.mood = 0;
    w.noticeUntil = s.tick + 3000;
    w.fedUpSince = s.tick - 1000;
    expect(bonusLift(w, 100)).toBeGreaterThanOrEqual(QUIT.lowMood);
    receiveBonus(s, w, 100);
    expect(w.mood).toBeGreaterThanOrEqual(QUIT.lowMood);
    step(s);
    expect(w.noticeUntil).toBeNull();
  });

  it('a second bonus while the first is warm adds to it, up to the cap', () => {
    const s = createState(12);
    const w = s.workers[3];
    w.purse = 0;
    const first = receiveBonus(s, w, 30);
    receiveBonus(s, w, 30);
    const m = w.moodlets.filter((x) => x.kind === 'bonus');
    expect(m.length).toBe(1);
    expect(m[0].value).toBeGreaterThan(first);
    expect(m[0].value).toBeLessThanOrEqual(BONUS.max);
    receiveBonus(s, w, 400);
    expect(w.moodlets.find((x) => x.kind === 'bonus')!.value).toBe(BONUS.max);
  });

  it('a bonus for someone who quits before it arrives comes back to the treasury', () => {
    const s = createState(12);
    const w = s.workers[3];
    const start = s.gold;
    applyCommand(s, bonus(w.id, 60));
    expect(runUntil(s, () => !s.designs.some((d) => d.carrier.kind === 'letter'), 3000)).toBe(true);
    const purse = w.purse;
    startLeaving(s, w);
    expect(runUntil(s, () => lettersOut(s) === 0, 6000)).toBe(true);
    expect(w.purse).toBe(purse);
    // nothing lost: the treasury got the 60 back (it may have moved for other reasons meanwhile)
    expect(s.events.some((e) => e.text.includes('back to the treasury'))).toBe(true);
    const spent = start - s.gold;
    expect(spent).toBeLessThan(60);
  });

  it('gold is conserved, and the game replays the same', () => {
    const s = createState(7);
    const start = s.gold;
    const cmd = bonus(s.workers[2].id, 45);
    step(s, [cmd]);
    // written letters carry their gold until they're handed over
    const written = (st: SimState) => [...st.outbox, ...st.workers.flatMap((w) => w.bag)].reduce((n, c) => n + (c.kind === 'letter' ? (c.gold ?? 0) : 0), 0);
    let sawInFlight = false;
    for (let i = 0; i < 5000; i++) {
      step(s);
      if (written(s) > 0) sawInFlight = true;
      if (i % 250 === 0 || i === 4999) {
        const purses = s.workers.reduce((n, w) => n + w.purse, 0);
        expect(start + s.income).toBe(s.gold + purses + s.leftWith + s.sentHome + written(s));
      }
    }
    expect(sawInFlight).toBe(true);
    expect(lettersOut(s)).toBe(0);
    const again = replay(7, [{ tick: 0, cmd }], s.tick, 'normal', 'prebuilt');
    expect(JSON.stringify(again)).toBe(JSON.stringify(s));
  });
});

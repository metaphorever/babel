import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/sim/commands';
import { patienceAlert, checkGone, checkGoal, checkSupplies, daysPlayed, goodTotal, goneState, score } from '../src/sim/alerts';
import { unpaidAlert } from '../src/sim/actions';
import { makeOrder } from '../src/sim/lang';
import { startLeaving } from '../src/sim/morale';
import { patronFloorDone, updatePatron } from '../src/sim/patron';
import { scrollLineDone, unreadableLine } from '../src/sim/scrolls';
import { scribeLoop } from '../src/sim/carriers';
import { createState, step } from '../src/sim/sim';
import { ALERTS, ARRIVALS, PATRON, RECRUIT, SCRIBE, TIME, TOWER } from '../src/sim/tuning';
import { ITEM_TYPES, type AlertKind, type ItemType, type SimState } from '../src/sim/types';

const kinds = (s: SimState, k: AlertKind) => s.alerts.filter((a) => a.kind === k);

/** Empty a good from every store and the ground. */
function empty(s: SimState, g: ItemType): void {
  for (const x of s.sites) x.store[g] = 0;
  s.items = s.items.filter((it) => it.type !== g);
}

describe('§16.9 step 5: alerts', () => {
  it('the patron losing patience: at 50%, 25% and 0, once each on the way down', () => {
    const s = createState(12);
    for (const [before, now] of [
      [50.5, 49.9],
      [49.9, 40],
      [25.2, 24.9],
      [24.9, 20],
      [0.004, 0],
    ]) {
      s.patience = now;
      patienceAlert(s, before);
    }
    const p = kinds(s, 'patron');
    expect(p.map((a) => a.title)).toEqual(["The patron's patience is at 50%", "The patron's patience is at 25%", 'The patron has lost patience']);
    expect(p[0].text).toContain('stop sending newcomers');
    // and from the patron's own drain, in play
    const t = createState(12);
    t.graceUntil = 0;
    t.patience = 50 + PATRON.patienceDrain.normal / 2;
    updatePatron(t);
    expect(kinds(t, 'patron')).toHaveLength(1);
  });

  it('a supply running out: once, not for what was never there, and not again until it recovers', () => {
    const s = createState(12);
    // nothing alerts at the start, even for goods the camp hasn't made yet
    checkSupplies(s);
    expect(kinds(s, 'supply')).toHaveLength(0);
    expect(s.supplyOut).toEqual(ITEM_TYPES.filter((g) => goodTotal(s, g) < 1));
    expect(goodTotal(s, 'bread')).toBeGreaterThan(0);
    empty(s, 'bread');
    checkSupplies(s);
    checkSupplies(s);
    const a = kinds(s, 'supply');
    expect(a).toHaveLength(1);
    expect(a[0].title).toBe('Bread has run out');
    // a loaf or two doesn't re-arm it
    const pantry = s.sites.find((x) => x.kind === 'pantry')!;
    pantry.store.bread = ALERTS.supplyRearm;
    checkSupplies(s);
    expect(s.supplyOut).toContain('bread');
    pantry.store.bread = 0;
    checkSupplies(s);
    expect(kinds(s, 'supply')).toHaveLength(1);
    // back above the line by supplyRearm, and it can raise another
    pantry.store.bread = 1 + ALERTS.supplyRearm;
    checkSupplies(s);
    expect(s.supplyOut).not.toContain('bread');
    pantry.store.bread = 0;
    checkSupplies(s);
    expect(kinds(s, 'supply')).toHaveLength(2);
  });

  it('a supply alert line of 0 never alerts; a higher one says "running low"', () => {
    const s = createState(12);
    s.alertBelow.bread = 0;
    empty(s, 'bread');
    checkSupplies(s);
    expect(kinds(s, 'supply')).toHaveLength(0);
    s.alertBelow.stone = goodTotal(s, 'stone') + 1;
    checkSupplies(s);
    expect(kinds(s, 'supply')[0].title).toBe('Stone is running low');
  });

  it("the treasury can't pay wages: one alert, then quiet for half a day", () => {
    const s = createState(12);
    const w = s.workers[2];
    unpaidAlert(s, w, '«mine stone»');
    unpaidAlert(s, w, '«mine stone»');
    expect(kinds(s, 'wages')).toHaveLength(1);
    expect(kinds(s, 'wages')[0].workerId).toBe(w.id);
    s.tick += ALERTS.wagesQuietTicks;
    unpaidAlert(s, w, '«mine stone»');
    expect(kinds(s, 'wages')).toHaveLength(2);
  });

  it('an empty treasury raises it when a scroll line is done', () => {
    const s = createState(12);
    const w = s.workers[4];
    const c = scribeLoop(s, { kind: 'worker', workerId: w.id }, false);
    c.wage = 3;
    w.held = [c];
    s.gold = s.reserved; // nothing free
    scrollLineDone(s, w, 1);
    expect(kinds(s, 'wages')).toHaveLength(1);
    expect(w.purse).toBe(0);
  });

  it('a worker giving up on a scroll they can no longer read', () => {
    const s = createState(12);
    const w = s.workers[4];
    const c = scribeLoop(s, { kind: 'worker', workerId: w.id }, false);
    w.held.push(c);
    c.strikes = SCRIBE.giveUpAfter - 1;
    unreadableLine(s, w, c, makeOrder('MINE', 'STONE'));
    const a = kinds(s, 'scroll');
    expect(a).toHaveLength(1);
    expect(a[0].workerId).toBe(w.id);
    expect(a[0].text).toContain('can’t read'.replace('’', "'"));
  });

  it('a newcomer arriving and a level finished are raised (the UI mutes them by default)', () => {
    const s = createState(12);
    s.floors = 3;
    s.patience = 100;
    for (let i = 0; i < ARRIVALS.every.normal + 5; i++) step(s);
    expect(kinds(s, 'newcomer')).toHaveLength(1);
    patronFloorDone(s, 4);
    expect(kinds(s, 'level')[0].title).toBe('Tower Level 4 is finished');
  });

  it("the patron's goal: once, with the score", () => {
    const s = createState(12);
    expect(s.goal).toBe(TOWER.goal);
    s.floors = s.goal - 1;
    checkGoal(s);
    expect(kinds(s, 'goal')).toHaveLength(0);
    s.floors = s.goal;
    s.tick = TIME.dayTicks * 20;
    s.gold = 512;
    checkGoal(s);
    checkGoal(s);
    expect(kinds(s, 'goal')).toHaveLength(1);
    expect(daysPlayed(s)).toBe(20);
    expect(score(s)).toBe((s.goal * 1000) / 20 + 512);
    expect(kinds(s, 'goal')[0].text).toContain(`Your score is 2,012`);
    expect(s.won).toBe(true);
  });

  it('everyone gone: recruit if the treasury can, wait for the patron, or the end', () => {
    const s = createState(12);
    checkGone(s);
    expect(kinds(s, 'gone')).toHaveLength(0);
    for (const w of s.workers) startLeaving(s, w);
    s.gold = s.reserved + RECRUIT.perSquare;
    checkGone(s);
    checkGone(s);
    expect(kinds(s, 'gone')).toHaveLength(1);
    expect(goneState(s)).toBe('recruit');
    expect(kinds(s, 'gone')[0].text).toContain('recruit new workers from the Workers window');
    // can't pay, but the patron still pays (or sends someone): wait
    s.gold = s.reserved;
    s.patience = 30;
    checkGone(s);
    expect(goneState(s)).toBe('wait');
    expect(kinds(s, 'gone')).toHaveLength(2);
    expect(kinds(s, 'gone')[1].text).toContain('stipend comes at dawn');
    // no money and none coming: the end
    s.patience = 0;
    checkGone(s);
    expect(goneState(s)).toBe('end');
    expect(kinds(s, 'gone')[2].title).toBe('The end of the work');
    // a recruit resets it
    s.gold = s.reserved + 100;
    expect(applyCommand(s, { type: 'recruit', playerId: 0 }).ok).toBe(true);
    checkGone(s);
    expect(s.gone).toBeNull();
    expect(PATRON.recruitAbove).toBeGreaterThan(30);
  });

  it('everyone quitting in play raises it from the sim', () => {
    const s = createState(12);
    for (const w of s.workers) startLeaving(s, w);
    step(s);
    expect(kinds(s, 'gone')).toHaveLength(1);
  });
});

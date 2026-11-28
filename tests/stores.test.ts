import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/sim/commands';
import { checkSupplies, goodHoldings, goodTotal } from '../src/sim/alerts';
import { createState, replay, Sim } from '../src/sim/sim';
import { ALERTS } from '../src/sim/tuning';
import { ITEM_TYPES, type SimState } from '../src/sim/types';

const supplyAlerts = (s: SimState) => s.alerts.filter((a) => a.kind === 'supply');

describe('§16.9 step 6: the Stores window', () => {
  it('each good: every store holding some, most first, plus what is lying around, adding up to the total', () => {
    const s = createState(12);
    for (const g of ITEM_TYPES) {
      const { stores, loose } = goodHoldings(s, g);
      expect(stores.reduce((n, x) => n + x.n, 0) + loose).toBe(goodTotal(s, g));
      for (const x of stores) expect(x.n).toBeGreaterThan(0);
      for (let i = 1; i < stores.length; i++) expect(stores[i - 1].n).toBeGreaterThanOrEqual(stores[i].n);
    }
    // a store still being built doesn't count, even with goods delivered to it
    const pile = s.sites.find((x) => x.kind === 'stockpile' && !x.supplies)!;
    pile.store.stone = 7;
    expect(goodHoldings(s, 'stone').stores.some((x) => x.site === pile)).toBe(true);
    pile.build = { needs: { stone: 1, wood: 0 }, placed: { stone: 0, wood: 0 }, undone: 0, since: 0 };
    expect(goodHoldings(s, 'stone').stores.some((x) => x.site === pile)).toBe(false);
  });

  it('setting an alert line: a command, checked, and quiet at the moment it is set', () => {
    const s = createState(12);
    for (const bad of [-1, 1.5, ALERTS.supplyBelowMax + 1]) expect(applyCommand(s, { type: 'setAlertBelow', playerId: 0, good: 'bread', below: bad }).ok).toBe(false);
    expect(applyCommand(s, { type: 'setAlertBelow', playerId: 0, good: 'gold' as never, below: 3 }).ok).toBe(false);
    // set above what there is: no alert now (the player is looking at the number)...
    const have = goodTotal(s, 'bread');
    expect(have).toBeGreaterThan(0);
    expect(applyCommand(s, { type: 'setAlertBelow', playerId: 0, good: 'bread', below: have + 1 }).ok).toBe(true);
    expect(s.alertBelow.bread).toBe(have + 1);
    checkSupplies(s);
    expect(supplyAlerts(s)).toHaveLength(0);
    expect(s.supplyOut).toContain('bread');
    // ...but once it recovers past the line and dips again, it speaks up: "running low"
    const pantry = s.sites.find((x) => x.kind === 'pantry')!;
    pantry.store.bread += 1 + ALERTS.supplyRearm;
    checkSupplies(s);
    expect(s.supplyOut).not.toContain('bread');
    pantry.store.bread -= 1 + ALERTS.supplyRearm;
    checkSupplies(s);
    expect(supplyAlerts(s).map((a) => a.title)).toEqual(['Bread is running low']);
    // lowering the line well under what there is re-arms it
    expect(applyCommand(s, { type: 'setAlertBelow', playerId: 0, good: 'bread', below: 0 }).ok).toBe(true);
    expect(s.supplyOut).not.toContain('bread');
  });

  it('replays: the alert line is in the command log', () => {
    const sim = new Sim(5, 'normal', 'prebuilt');
    sim.enqueue({ type: 'setAlertBelow', playerId: 0, good: 'stone', below: 40 });
    for (let i = 0; i < 300; i++) sim.step();
    expect(sim.state.alertBelow.stone).toBe(40);
    const again = replay(5, sim.history, 300, sim.state.settings);
    expect(JSON.stringify(again)).toBe(JSON.stringify(sim.state));
  });
});

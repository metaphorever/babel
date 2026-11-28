import { describe, expect, it } from 'vitest';
import { createState, step } from '../src/sim/sim';
import { gameSettings } from '../src/sim/settings';
import { pinNotice } from '../src/sim/carriers';
import { makeOrder } from '../src/sim/lang';
import { depotFor, freeRoom, incoming, sitesOf, storedTotal } from '../src/sim/world';
import { TIME } from '../src/sim/tuning';
import type { SimState } from '../src/sim/types';

/** The most any store has ever held over what it holds, while the game runs. */
function worstOver(s: SimState, ticks: number): number {
  let worst = 0;
  for (let i = 0; i < ticks; i++) {
    step(s);
    for (const x of s.sites) if (x.capacity !== null && x.capacity > 0) worst = Math.max(worst, storedTotal(x) - x.capacity);
  }
  return worst;
}

describe('stores never overfill', () => {
  it('no store holds more than it can, in any camp, the sandbox included', () => {
    // before the fix, pantries reached 35 of 20 in these games within half a day
    for (const g of [gameSettings('normal', 'prebuilt'), gameSettings('normal', 'large'), gameSettings('sandbox', 'large'), gameSettings('easy', 'opening')]) {
      for (const seed of [1, 2, 3]) {
        const s = createState(seed, g);
        expect(worstOver(s, TIME.dayTicks * 2)).toBe(0);
        // and no batch left on the ground for want of room: a cook speaks for the pantry's room when they start baking
        expect(s.items.filter((x) => x.type === 'bread' || x.type === 'beer').length).toBe(0);
      }
    }
  });

  it('goods on their way count against a store’s room', () => {
    const s = createState(4);
    const pantry = sitesOf(s, 'pantry')[0];
    pantry.store.bread = 17; // room for 3
    const [a, b] = s.workers;
    a.carrying = 'bread';
    a.carryCount = 2;
    a.activity.into = pantry.id;
    a.activity.bringing = 2;
    expect(incoming(s, pantry)).toBe(2);
    expect(freeRoom(s, pantry)).toBe(1);
    // a's own load doesn't count against a
    expect(freeRoom(s, pantry, a)).toBe(3);
    // nobody else is sent there with more than the 1 left (there's only one pantry, so a smaller load still goes)
    expect(depotFor(s, null, 'bread', b, [], 2)).toBe(pantry);
    a.activity.bringing = 3;
    expect(depotFor(s, null, 'bread', b)).toBeNull();
  });

  it('cooks wait while every pantry is full, and bake again once there is room', () => {
    const s = createState(5);
    const pantry = sitesOf(s, 'pantry')[0];
    for (let i = 0; i < 400; i++) {
      pantry.store.bread = pantry.capacity!;
      step(s);
    }
    // plenty of cook notices up and grain to spare, but nothing baked: nowhere to keep it
    expect(s.items.filter((x) => x.type === 'bread').length).toBe(0);
    expect(s.workers.some((w) => w.carrying === 'bread')).toBe(false);
    pinNotice(s, makeOrder('COOK', 'BREAD'), 10, 1, null);
    pantry.store.bread = 0;
    let baked = false;
    for (let i = 0; i < 3000 && !baked; i++) {
      step(s);
      baked = pantry.store.bread > 0;
    }
    expect(baked).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { Sim, createState, hashState, replay, step } from '../src/sim/sim';
import { findPath } from '../src/sim/path';
import { setTile } from '../src/sim/world';
import { Tile } from '../src/sim/types';
import { siteOf } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';

function run(s: ReturnType<typeof createState>, ticks: number) {
  for (let i = 0; i < ticks; i++) step(s);
}

describe('determinism', () => {
  it('same seed gives the same game', () => {
    const a = createState(1234);
    const b = createState(1234);
    run(a, 3000);
    run(b, 3000);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('different seeds give different games', () => {
    const a = createState(1);
    const b = createState(2);
    run(a, 200);
    run(b, 200);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('replaying the command history reproduces a live game', () => {
    const live = new Sim(99);
    for (let i = 0; i < 2000; i++) {
      if (i === 100) live.enqueue({ type: 'postNotice', playerId: 0, verb: 'CHOP', noun: 'WOOD', count: 5, wage: 4, addressee: null });
      if (i === 700) live.enqueue({ type: 'removeNotice', playerId: 0, noticeId: live.state.notices[0].id });
      live.step();
    }
    const again = replay(99, live.history, live.state.tick);
    expect(hashState(again)).toBe(hashState(live.state));
  });

  it('state survives a JSON round trip', () => {
    const s = createState(5);
    run(s, 500);
    const copy = JSON.parse(JSON.stringify(s));
    run(s, 500);
    run(copy, 500);
    expect(hashState(copy)).toBe(hashState(s));
  });
});

describe('pathfinding', () => {
  it('walks along the ground', () => {
    const s = createState(1);
    const y = siteOf(s, 'beds').y;
    const p = findPath(s, { x: 10, y }, { x: 20, y });
    expect(p).not.toBeNull();
    expect(p!.length).toBe(10);
  });

  it('climbs a ladder through a deck', () => {
    const s = createState(1);
    const ground = siteOf(s, 'beds').y; // standing row
    const deckRow = ground - 4;
    for (let x = 76; x <= 90; x++) setTile(s, x, deckRow, Tile.Deck);
    // ladder from the ground up through a hole in the deck
    for (let y = deckRow; y <= ground; y++) setTile(s, 80, y, Tile.Ladder);
    const p = findPath(s, { x: 70, y: ground }, { x: 88, y: deckRow - 1 });
    expect(p).not.toBeNull();
    expect(p![p!.length - 1]).toEqual({ x: 88, y: deckRow - 1 });
    // without the ladder it can't be reached
    for (let y = deckRow; y <= ground; y++) setTile(s, 80, y, y === deckRow ? Tile.Deck : Tile.Air);
    expect(findPath(s, { x: 70, y: ground }, { x: 88, y: deckRow - 1 })).toBeNull();
  });
});

describe('notices and jobs', () => {
  it('posting reserves gold; removing refunds it', () => {
    const s = createState(1);
    const before = s.reserved;
    applyCommand(s, { type: 'postNotice', playerId: 0, verb: 'MINE', noun: 'STONE', count: 10, wage: 3, addressee: null });
    expect(s.reserved).toBe(before + 30);
    const n = s.notices[s.notices.length - 1];
    applyCommand(s, { type: 'removeNotice', playerId: 0, noticeId: n.id });
    expect(s.reserved).toBe(before);
  });

  it('rejects notices you cannot afford', () => {
    const s = createState(1);
    const r = applyCommand(s, { type: 'postNotice', playerId: 0, verb: 'MINE', noun: 'STONE', count: 999, wage: 50, addressee: null });
    expect(r.ok).toBe(false);
  });

  it('workers mine stone and haul it to the stockpile', () => {
    const s = createState(7);
    run(s, 20 * 120); // two minutes at 1x
    const pile = siteOf(s, 'stockpile');
    expect(pile.store.stone).toBeGreaterThan(0);
    expect(s.workers.reduce((a, w) => a + w.jobsDone, 0)).toBeGreaterThan(5);
  });

  it('counts go down on completion; late workers miss out', () => {
    const s = createState(3);
    s.notices = [];
    s.reserved = 0;
    applyCommand(s, { type: 'postNotice', playerId: 0, verb: 'MINE', noun: 'STONE', count: 1, wage: 5, addressee: null });
    // run until the notice is gone
    let t = 0;
    while (s.notices.length > 0 && t++ < 5000) step(s);
    expect(s.notices.length).toBe(0);
    expect(s.reserved).toBe(0);
    // anyone who also took it and finishes later gets nothing and a bad mood
    for (let i = 0; i < 2000; i++) step(s);
    const paid = s.workers.filter((w) => w.jobsDone > 0);
    expect(paid.length).toBe(1);
  });

  it('gold is conserved: treasury + purses + tavern spending', () => {
    const s = createState(11);
    const start = s.gold;
    run(s, 4000);
    const purses = s.workers.reduce((a, w) => a + w.purse, 0);
    const spent = start - s.gold - purses;
    expect(spent).toBeGreaterThanOrEqual(0);
    expect(spent % 5).toBe(0); // only the tavern takes gold out, 5 at a time
  });
});

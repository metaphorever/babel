import { describe, expect, it } from 'vitest';
import { Sim, createState, hashState, replay, step } from '../src/sim/sim';
import { findPath } from '../src/sim/path';
import { setTile } from '../src/sim/world';
import { Tile } from '../src/sim/types';
import { siteOf } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';
import { levelOf } from '../src/sim/skills';
import { pinNotice } from '../src/sim/carriers';
import { makeOrder, type Noun, type WorkVerb } from '../src/sim/lang';
import { SKILLS } from '../src/sim/tuning';

type State = ReturnType<typeof createState>;

function run(s: State, ticks: number) {
  for (let i = 0; i < ticks; i++) step(s);
}

/** Pin a notice straight onto the board, skipping the scribe (for testing notice mechanics). */
function post(s: State, verb: WorkVerb, noun: Noun, count: number, wage: number, addressee: number | null = null) {
  pinNotice(s, makeOrder(verb, noun), count, wage, addressee);
  s.reserved += count * wage;
}

/** Run until a condition holds or the tick budget runs out. */
function runUntil(s: State, done: () => boolean, maxTicks: number): boolean {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return true;
    step(s);
  }
  return done();
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
  it('posting queues a design and reserves gold; scrapping it refunds', () => {
    const s = createState(1);
    const before = s.reserved;
    const notices = s.notices.length;
    applyCommand(s, { type: 'postNotice', playerId: 0, verb: 'MINE', noun: 'STONE', count: 10, wage: 3, addressee: null });
    expect(s.reserved).toBe(before + 30);
    expect(s.notices.length).toBe(notices); // nothing on the board until it's written and carried
    expect(s.designs.length).toBe(1);
    applyCommand(s, { type: 'cancelDesign', playerId: 0, designId: s.designs[0].id });
    expect(s.reserved).toBe(before);
    expect(s.designs.length).toBe(0);
  });

  it('taking a notice down refunds what is left', () => {
    const s = createState(1);
    const before = s.reserved;
    post(s, 'MINE', 'STONE', 10, 3);
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
    const startGold = s.gold;
    post(s, 'MINE', 'STONE', 1, 5);
    // run until the notice is gone
    let t = 0;
    while (s.notices.length > 0 && t++ < 5000) step(s);
    expect(s.notices.length).toBe(0);
    expect(s.reserved).toBe(0);
    // anyone who also took it and finishes later gets nothing
    for (let i = 0; i < 2000; i++) step(s);
    expect(startGold - s.gold).toBe(5); // paid exactly once
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

describe('skills and multi-unit work', () => {
  it('levels follow the XP table', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(SKILLS.levelXp[1])).toBe(1);
    expect(levelOf(SKILLS.levelXp[1] - 1)).toBe(0);
    expect(levelOf(10_000)).toBe(SKILLS.levelXp.length - 1);
  });

  it('every worker starts with a knack', () => {
    const s = createState(8);
    for (const w of s.workers) expect(w.skills[w.knack]).toBe(SKILLS.knackStartXp);
  });

  it('a strong worker hauls two in one trip and is paid for both', () => {
    const s = createState(21);
    s.notices = [];
    s.reserved = 0;
    const w = s.workers[1];
    if (!w.traits.includes('strong')) w.traits.push('strong');
    w.skills.hauling = 0;
    w.hunger = w.thirst = w.fatigue = 0;
    const y = siteOf(s, 'beds').y;
    s.items.push({ id: s.nextId++, type: 'stone', x: w.x, y, reservedBy: null });
    s.items.push({ id: s.nextId++, type: 'stone', x: w.x + 1, y, reservedBy: null });
    const gold = s.gold;
    post(s, 'HAUL', 'STONE', 2, 3, w.id);
    let t = 0;
    while (s.notices.length > 0 && t++ < 4000) step(s);
    expect(siteOf(s, 'stockpile').store.stone).toBe(2);
    expect(w.jobsDone).toBe(1); // one trip
    expect(gold - s.gold).toBe(6);
  });

  it('a master miner often brings back extra stone', () => {
    const s = createState(33);
    s.notices = [];
    s.reserved = 0;
    const w = s.workers[1];
    w.skills.mining = 10_000;
    post(s, 'MINE', 'STONE', 200, 0, w.id);
    for (let i = 0; i < 20 * 600; i++) step(s);
    const notice = s.notices[0];
    const units = 200 - notice.remaining;
    expect(w.jobsDone).toBeGreaterThan(5);
    // with a 60% bonus chance, the average should be well above one per trip
    expect(units / w.jobsDone).toBeGreaterThan(1.3);
  });
});

describe('scribes, scrolls and the charter', () => {
  it('the game starts with a scribe holding the charter', () => {
    const s = createState(4);
    const scribe = s.workers[0];
    expect(scribe.knack).toBe('writing');
    expect(scribe.held.length).toBe(1);
    expect(scribe.held[0].orders.map((o) => o[0].t)).toEqual(['WRITE', 'DELIVER', 'REPEAT']);
  });

  it('a posted notice is written and pinned up by the scribe', () => {
    const s = createState(4);
    applyCommand(s, { type: 'postNotice', playerId: 0, verb: 'CHOP', noun: 'WOOD', count: 5, wage: 2, addressee: null });
    const pinned = runUntil(s, () => s.notices.some((n) => n.order[0].t === 'CHOP'), 3000);
    expect(pinned).toBe(true);
    expect(s.designs.length).toBe(0);
  });

  it('a scroll is handed to a worker by name and loops', () => {
    const s = createState(4);
    const miner = s.workers[3];
    applyCommand(s, {
      type: 'sendScroll',
      playerId: 0,
      lines: [
        { verb: 'MINE', noun: 'STONE' },
        { verb: 'HAUL', noun: 'STONE' },
        { verb: 'REPEAT', noun: null },
      ],
      wage: 1,
      to: miner.id,
    });
    expect(runUntil(s, () => miner.held.length > 0, 4000)).toBe(true);
    expect(runUntil(s, () => miner.held[0]?.loops >= 2, 20 * 300)).toBe(true);
    expect(siteOf(s, 'stockpile').store.stone).toBeGreaterThan(0);
  });

  it('a scroll with the scribe loop makes a second scribe', () => {
    const s = createState(4);
    const second = s.workers[5];
    applyCommand(s, {
      type: 'sendScroll',
      playerId: 0,
      lines: [
        { verb: 'WRITE', noun: null },
        { verb: 'DELIVER', noun: null },
        { verb: 'REPEAT', noun: null },
      ],
      wage: 1,
      to: second.id,
    });
    expect(runUntil(s, () => second.held.length > 0, 4000)).toBe(true);
    // give them plenty to write
    for (let i = 0; i < 6; i++) applyCommand(s, { type: 'postNotice', playerId: 0, verb: 'CHOP', noun: 'WOOD', count: 1, wage: 1, addressee: null });
    expect(runUntil(s, () => second.skills.writing > 0, 20 * 300)).toBe(true);
  });

  it('a line that cannot be done is skipped, not stuck on', () => {
    const s = createState(4);
    const w = s.workers[2];
    s.items = [];
    w.held.push({ id: s.nextId++, kind: 'scroll', orders: [makeOrder('HAUL', 'WOOD'), makeOrder('CHOP', 'WOOD')], wage: 0, dest: { kind: 'worker', workerId: w.id }, pc: 0, loops: 0, waitUntil: 0, retryAfter: 0 });
    expect(runUntil(s, () => w.held.length === 0, 20 * 200)).toBe(true);
  });
});

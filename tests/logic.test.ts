import { describe, expect, it } from 'vitest';
import { createState, step } from '../src/sim/sim';
import { applyCommand, validateCommand, type ComposeLine } from '../src/sim/commands';
import { jobsFor } from '../src/sim/build';
import { evalCondition } from '../src/sim/logic';
import { newProject, placeMaterial } from '../src/sim/tower';
import { isNoticeCard, lineText, newCarrier } from '../src/sim/carriers';
import { giveCarrier } from '../src/sim/scrolls';
import { FOREVER, makeOrder, orderText, parseCondition, parseOrder, type Condition, type Order, type TokenId } from '../src/sim/lang';
import { hourOf } from '../src/sim/time';
import { TIME } from '../src/sim/tuning';
import type { Carrier, SimState, Worker } from '../src/sim/types';
import { groundRow } from '../src/sim/world';

function runUntil(s: SimState, done: () => boolean, maxTicks: number): boolean {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return true;
    step(s);
  }
  return done();
}

/** A quiet colony: no notices, nothing loose, nobody needing anything. */
function quiet(): SimState {
  const s = createState(3);
  s.notices = [];
  s.boardScrolls = [];
  s.designs = [];
  s.reserved = 0;
  s.items = [];
  for (const w of s.workers) {
    w.hunger = 0;
    w.thirst = 0;
    w.fatigue = 0;
  }
  return s;
}

/** The first stockpile that isn't the patron's supplies, emptied out, with no limit. */
function emptyPile(s: SimState) {
  const p = s.sites.find((x) => x.kind === 'stockpile' && !x.supplies)!;
  for (const k in p.store) p.store[k as keyof typeof p.store] = 0;
  p.capacity = null;
  return p;
}

function hand(s: SimState, w: Worker, lines: { order: Order; count?: number }[]): Carrier {
  const c = newCarrier(s, lines.map((l) => ({ order: l.order, count: l.count ?? 1 })), 0, { kind: 'worker', workerId: w.id });
  giveCarrier(s, w, c);
  return c;
}

function forget(w: Worker, t: TokenId) {
  w.vocab.en = (w.vocab.en ?? []).filter((x) => x !== t);
}

const has = (n: number, pile: number, cmp: 'least' | 'fewer' | 'none' = 'least'): Condition => ({ kind: 'has', place: { fixture: 'STOCKPILE', n: pile }, cmp, n, noun: 'STONE' });
const night: Condition = { kind: 'state', state: 'DUSK', not: false };

describe('session 6: conditions, IF / OTHERWISE, UNTIL, WAIT', () => {
  const compose = (s: SimState, lines: Partial<ComposeLine>[]) =>
    validateCommand(s, { type: 'compose', playerId: 0, lines: lines.map((l) => ({ count: 1, noun: null, ...l }) as ComposeLine), wage: 0, dest: { kind: 'worker', workerId: s.workers[0].id } });

  it('writes and reads conditions', () => {
    const iff = makeOrder('IF', null, { cond: has(20, 3, 'fewer') });
    expect(orderText(iff)).toBe('if stockpile 3 has fewer than 20 stone');
    expect(parseOrder(iff).cond).toEqual(has(20, 3, 'fewer'));
    expect(orderText(makeOrder('IF', null, { cond: has(0, 2, 'none') }))).toBe('if stockpile 2 has no stone');
    expect(orderText(makeOrder('IF', null, { cond: { kind: 'state', state: 'HUNGRY', not: true } }))).toBe('if not hungry');
    expect(orderText(makeOrder('WAIT', null, { cond: { kind: 'state', state: 'DAWN', not: false } }))).toBe('wait until dawn');
    const mine = makeOrder('MINE', 'STONE', { cond: night });
    expect(orderText(mine)).toBe('mine stone until dusk');
    expect(parseOrder(mine)).toMatchObject({ verb: 'MINE', noun: 'STONE', cond: night });
    expect(orderText(makeOrder('HAUL', 'STONE', { to: { name: 'Counter' }, cond: { kind: 'has', place: { name: 'Counter' }, cmp: 'least', n: 40, noun: 'STONE' } }, 'fr'))).toBe('porter pierre à Counter jusqu’à Counter contient 40 pierre');
    // numbers are the same in every language
    expect(orderText(makeOrder('IF', null, { cond: has(7, 1) }, 'el'))).toBe('αν σωρός 1 έχει 7 πέτρα');
    expect(parseCondition(makeOrder('IF', null, { cond: has(7, 1) }).slice(1))).toEqual(has(7, 1));
  });

  it('shows the count before the UNTIL, and drops "forever" there', () => {
    const s = quiet();
    const c = newCarrier(s, [{ order: makeOrder('MINE', 'STONE', { cond: night }), count: 20 }, { order: makeOrder('MINE', 'STONE', { cond: night }), count: FOREVER }], 0, { kind: 'board', addressee: null });
    expect(lineText(c, 0)).toBe('mine stone ×20 until dusk');
    expect(lineText(c, 1)).toBe('mine stone until dusk');
  });

  it('a card with an UNTIL is carried out by one worker, not posted as a notice', () => {
    const s = quiet();
    const plain = newCarrier(s, [{ order: makeOrder('MINE', 'STONE'), count: 5 }], 0, { kind: 'board', addressee: null });
    const until = newCarrier(s, [{ order: makeOrder('MINE', 'STONE', { cond: night }), count: FOREVER }], 0, { kind: 'board', addressee: null });
    expect(isNoticeCard(plain)).toBe(true);
    expect(isNoticeCard(until)).toBe(false);
  });

  it('checks how IF and OTHERWISE are laid out', () => {
    const s = quiet();
    const ifLine = { verb: 'IF' as const, cond: night };
    const work = { verb: 'MINE' as const, noun: 'STONE' as const };
    expect(compose(s, [ifLine, work]).ok).toBe(true);
    expect(compose(s, [ifLine, work, { verb: 'OTHERWISE' }, { verb: 'WAIT', count: 2 }]).ok).toBe(true);
    // else-if
    expect(compose(s, [ifLine, work, { verb: 'OTHERWISE' }, ifLine, work, { verb: 'OTHERWISE' }, work]).ok).toBe(true);
    // two IFs in a row are an AND
    expect(compose(s, [ifLine, ifLine, work, { verb: 'OTHERWISE' }, work]).ok).toBe(true);
    expect(compose(s, [{ verb: 'IF' }, work]).ok).toBe(false);
    expect(compose(s, [work, ifLine]).ok).toBe(false);
    expect(compose(s, [ifLine, { verb: 'OTHERWISE' }, work]).ok).toBe(false);
    expect(compose(s, [work, { verb: 'OTHERWISE' }, work]).ok).toBe(false);
    expect(compose(s, [ifLine, work, { verb: 'OTHERWISE' }]).ok).toBe(false);
    expect(compose(s, [ifLine, work, { verb: 'OTHERWISE' }, work, { verb: 'OTHERWISE' }, work]).ok).toBe(false);
  });

  it('checks conditions and waits', () => {
    const s = quiet();
    const work = { verb: 'MINE' as const, noun: 'STONE' as const };
    expect(compose(s, [{ verb: 'MINE', noun: 'STONE', cond: night, count: FOREVER }]).ok).toBe(true);
    expect(compose(s, [{ verb: 'WRITE', cond: night }]).ok).toBe(false);
    expect(compose(s, [{ verb: 'IF', cond: { kind: 'has', place: 0, cmp: 'least', n: 5, noun: 'STONE' } }, work]).ok).toBe(false);
    expect(compose(s, [{ verb: 'IF', cond: { kind: 'has', place: { fixture: 'PANTRY', n: 1 }, cmp: 'least', n: 5, noun: 'STONE' } }, work]).ok).toBe(false);
    expect(compose(s, [{ verb: 'IF', cond: { kind: 'has', place: { fixture: 'PANTRY', n: 1 }, cmp: 'least', n: 5, noun: 'BREAD' } }, work]).ok).toBe(true);
    expect(compose(s, [{ verb: 'IF', cond: { kind: 'has', place: 4, cmp: 'fewer', n: 10, noun: 'WOOD' } }, work]).ok).toBe(true);
    expect(compose(s, [{ verb: 'IF', cond: has(0, 1) }, work]).ok).toBe(false);
    expect(compose(s, [{ verb: 'WAIT', count: 3 }]).ok).toBe(true);
    expect(compose(s, [{ verb: 'WAIT', count: 99 }]).ok).toBe(false);
    expect(compose(s, [{ verb: 'WAIT', cond: night }]).ok).toBe(true);
  });

  it('IF walks over to look at a store, then takes the right branch', () => {
    for (const stone of [10, 2]) {
      const s = quiet();
      const pile = emptyPile(s);
      pile.store.stone = stone;
      const w = s.workers[0];
      // start well away from it
      w.x = pile.x0 > 60 ? pile.x0 - 40 : pile.x1 + 40;
      w.y = groundRow();
      const c = hand(s, w, [
        { order: makeOrder('IF', null, { cond: has(5, pile.num) }) },
        { order: makeOrder('WAIT'), count: 3 },
        { order: makeOrder('OTHERWISE') },
        { order: makeOrder('WAIT'), count: 3 },
      ]);
      expect(runUntil(s, () => c.pc === 1 || c.pc === 3, 3000)).toBe(true);
      expect(c.pc).toBe(stone >= 5 ? 1 : 3);
      expect(c.branch).toBe(stone >= 5);
      // they went to look
      expect(Math.abs(w.x - pile.x0)).toBeLessThan(12);
    }
  });

  it('OTHERWISE skips its line after an IF that held', () => {
    const s = quiet();
    const w = s.workers[0];
    w.carrying = null;
    const c = hand(s, w, [
      { order: makeOrder('IF', null, { cond: { kind: 'state', state: 'CARRYING', not: true } }) },
      { order: makeOrder('WAIT'), count: 1 },
      { order: makeOrder('OTHERWISE') },
      { order: makeOrder('MINE', 'STONE'), count: 5 },
      { order: makeOrder('WAIT'), count: 2 },
    ]);
    expect(runUntil(s, () => c.pc === 4, 2000)).toBe(true);
    expect(s.items.length).toBe(0);
  });

  it('UNTIL stops a haul once the store has enough', () => {
    const s = quiet();
    const pile = emptyPile(s);
    const gy = groundRow();
    for (let i = 0; i < 10; i++) s.items.push({ id: s.nextId++, type: 'stone', x: pile.x1 + 4 + i, y: gy, reservedBy: null });
    const w = s.workers[0];
    const to = { fixture: 'STOCKPILE' as const, n: pile.num };
    const c = hand(s, w, [{ order: makeOrder('HAUL', 'STONE', { to, cond: has(3, pile.num) }), count: FOREVER }]);
    expect(runUntil(s, () => !w.held.includes(c), 20000)).toBe(true);
    expect(pile.store.stone).toBeGreaterThanOrEqual(3);
    expect(s.items.filter((x) => x.type === 'stone').length).toBeGreaterThan(0);
  });

  it('WAIT counts hours; WAIT UNTIL waits for the condition', () => {
    const s = quiet();
    const w = s.workers[0];
    const hour = TIME.dayTicks / 24;
    const c = hand(s, w, [{ order: makeOrder('WAIT'), count: 2 }, { order: makeOrder('WAIT', null, { cond: night }) }, { order: makeOrder('WAIT'), count: 1 }]);
    const start = s.tick;
    expect(runUntil(s, () => c.pc === 1, 3 * hour)).toBe(true);
    expect(s.tick - start).toBeGreaterThanOrEqual(2 * hour - 2);
    expect(hourOf(s.tick)).toBeLessThan(18);
    expect(runUntil(s, () => c.pc === 2, TIME.dayTicks)).toBe(true);
    expect(hourOf(s.tick)).toBeGreaterThanOrEqual(18);
  });

  it('drift: an unreadable IF is no condition, an unreadable OTHERWISE runs both, an unreadable NOT is dropped', () => {
    // can't read IF: they wait (the guarded line) even though it's day
    let s = quiet();
    let w = s.workers[0];
    forget(w, 'IF');
    let c = hand(s, w, [{ order: makeOrder('IF', null, { cond: night }) }, { order: makeOrder('WAIT'), count: 1 }, { order: makeOrder('WAIT'), count: 1 }]);
    expect(runUntil(s, () => c.pc !== 0, 100)).toBe(true);
    expect(c.pc).toBe(1);
    // can't read OTHERWISE: after a failed IF they still do the OTHERWISE line... and after one that held, too
    s = quiet();
    w = s.workers[0];
    forget(w, 'OTHERWISE');
    c = hand(s, w, [{ order: makeOrder('IF', null, { cond: { kind: 'state', state: 'DUSK', not: true } }) }, { order: makeOrder('WAIT'), count: 1 }, { order: makeOrder('OTHERWISE') }, { order: makeOrder('WAIT'), count: 1 }, { order: makeOrder('WAIT'), count: 1 }]);
    expect(runUntil(s, () => c.pc === 2, TIME.dayTicks)).toBe(true);
    expect(runUntil(s, () => c.pc !== 2, 100)).toBe(true);
    expect(c.pc).toBe(3);
    // can't read NOT: "if not night" by day reads as "if night", so the line is skipped
    s = quiet();
    w = s.workers[0];
    forget(w, 'NOT');
    c = hand(s, w, [{ order: makeOrder('IF', null, { cond: { kind: 'state', state: 'DUSK', not: true } }) }, { order: makeOrder('WAIT'), count: 1 }, { order: makeOrder('WAIT'), count: 1 }]);
    expect(runUntil(s, () => c.pc !== 0, 100)).toBe(true);
    expect(c.pc).toBe(2);
    expect(w.confusion).toBeGreaterThan(0);
  });
});

describe('session 6: build orders by place, planning ahead in the tower', () => {
  const placeFix = (s: SimState, fixture: 'ladder' | 'bed', x0: number, story: number) => applyCommand(s, { type: 'place', playerId: 0, place: { what: 'fixture', fixture, x0, story } });
  function finishFloor(s: SimState, level: number) {
    const p = s.projects.find((x) => x.level === level) ?? newProject(s, level);
    if (!s.projects.includes(p)) s.projects.push(p);
    for (let i = 0; i < p.needs.stone; i++) placeMaterial(s, p, 'stone');
    for (let i = 0; i < p.needs.wood; i++) placeMaterial(s, p, 'wood');
  }

  it('reads and writes the new build lines', () => {
    expect(orderText(makeOrder('BUILD', 'FIXTURES', { within: 'tower' }))).toBe('build fixtures in tower');
    expect(orderText(makeOrder('BUILD', 'FIXTURES', { within: 'camp' }, 'fr'))).toBe('bâtir installations dans camp');
    expect(parseOrder(makeOrder('BUILD', 'FIXTURES', { within: 3 }))).toMatchObject({ noun: 'FIXTURES', within: 3 });
    expect(parseOrder(makeOrder('BUILD', 'CAMP'))).toMatchObject({ noun: 'CAMP', target: null, within: null });
    const s = quiet();
    const ok = (l: Partial<ComposeLine>) => validateCommand(s, { type: 'compose', playerId: 0, lines: [{ verb: 'BUILD', noun: null, count: 1, ...l } as ComposeLine], wage: 0, dest: { kind: 'board', addressee: null } }).ok;
    expect(ok({ noun: 'BUILDINGS' })).toBe(true);
    expect(ok({ noun: 'FIXTURES', within: 'tower' })).toBe(true);
    expect(ok({ noun: 'FIXTURES', within: { name: 'Kitchen' } })).toBe(true);
    expect(ok({ noun: 'FIXTURES', within: { fixture: 'BED', n: 1 } })).toBe(false);
    expect(ok({ noun: 'CAMP', within: 'tower' })).toBe(false);
  });

  it('each build order covers its own place', () => {
    const s = createState(7);
    const t = s.tower!;
    finishFloor(s, 1);
    expect(placeFix(s, 'ladder', t.x0 + 2, 0).ok).toBe(true);
    const ladder = s.sites[s.sites.length - 1];
    const house = s.buildings.find((b) => b.kind === 'house')!;
    // a house still to build, with a bed planned in it, and a bed on open ground in a finished building
    const ids = (scope: Parameters<typeof jobsFor>[1]) => jobsFor(s, scope).map((j) => `${j.kind}:${j.id}`);
    const ladderJob = `site:${ladder.id}`;
    expect(ids({ kind: 'fixtures', within: 'tower' })).toContain(ladderJob);
    expect(ids({ kind: 'fixtures', within: null })).toContain(ladderJob);
    expect(ids({ kind: 'camp' })).not.toContain(ladderJob);
    expect(ids({ kind: 'buildings' })).not.toContain(ladderJob);
    expect(ids({ kind: 'fixtures', within: 'camp' })).not.toContain(ladderJob);
    expect(house).toBeTruthy();
  });

  it('a level being built can be planned ahead; what is planned there waits for it', () => {
    const s = createState(7);
    const t = s.tower!;
    finishFloor(s, 1);
    // floor 2 not started: no ladder off the Ground Level's roof yet
    expect(placeFix(s, 'ladder', t.x0 + 2, 1).ok).toBe(false);
    s.projects.push(newProject(s, 2));
    expect(placeFix(s, 'ladder', t.x0 + 2, 1).ok).toBe(true);
    const ladder = s.sites[s.sites.length - 1];
    expect(jobsFor(s, { kind: 'fixtures', within: 'tower' }).some((j) => j.id === ladder.id)).toBe(false);
    finishFloor(s, 2);
    expect(s.floors).toBe(2);
    expect(jobsFor(s, { kind: 'fixtures', within: 'tower' }).some((j) => j.id === ladder.id)).toBe(true);
  });

  it('the time of day comes in quarters', () => {
    const s = quiet();
    const w = s.workers[0];
    const at = (hour: number) => {
      s.tick = Math.round((((hour - TIME.startHour + 24) % 24) / 24) * TIME.dayTicks);
    };
    const holds = (state: 'DAWN' | 'NOON' | 'DUSK' | 'MIDNIGHT') => evalCondition(s, w, { kind: 'state', state, not: false });
    at(7);
    expect([holds('DAWN'), holds('NOON'), holds('DUSK'), holds('MIDNIGHT')]).toEqual([true, false, false, false]);
    at(13);
    expect(holds('NOON')).toBe(true);
    at(19);
    expect(holds('DUSK')).toBe(true);
    at(2);
    expect(holds('MIDNIGHT')).toBe(true);
    expect(orderText(makeOrder('WAIT', null, { cond: { kind: 'state', state: 'NOON', not: false } }, 'el'))).toBe('περίμενε μέχρι μεσημέρι');
  });
});

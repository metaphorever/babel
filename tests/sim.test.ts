import { describe, expect, it } from 'vitest';
import { Sim, createState, hashState, replay, step } from '../src/sim/sim';
import { findPath } from '../src/sim/path';
import { setTile } from '../src/sim/world';
import { Tile } from '../src/sim/types';
import { siteOf, stockpileOn, tileAt } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';
import { levelOf } from '../src/sim/skills';
import { newCarrier, pinNotice } from '../src/sim/carriers';
import type { Command } from '../src/sim/commands';
import { giveCarrier, writingCostFor } from '../src/sim/scrolls';
import { addConfusion, allWords, readOrder, updateDrift } from '../src/sim/drift';
import { eligibleNotices } from '../src/sim/activities';
import { ALL, FOREVER, makeOrder, orderText, parseOrder, type Noun, type Verb, type WorkVerb } from '../src/sim/lang';
import { deckRow, newProject, placeMaterial } from '../src/sim/tower';

import type { Dest } from '../src/sim/types';
import { ARRIVALS, PATRON, QUIT, SKILLS, TOWER, WORLD } from '../src/sim/tuning';
import { currentStipend, patronFloorDone } from '../src/sim/patron';

type State = ReturnType<typeof createState>;

function run(s: State, ticks: number) {
  for (let i = 0; i < ticks; i++) step(s);
}

/** Pin a notice straight onto the board, skipping the scribe (for testing notice mechanics). */
function post(s: State, verb: WorkVerb, noun: Noun, count: number, wage: number, addressee: number | null = null) {
  pinNotice(s, makeOrder(verb, noun), count, wage, addressee);
  s.reserved += count * wage;
}

/** Compose a one-line notice for the board (for Anyone unless addressed). */
function noticeCmd(verb: WorkVerb, noun: Noun, count: number, wage: number, addressee: number | null = null): Command {
  return { type: 'compose', playerId: 0, lines: [{ verb, noun, count }], wage, dest: { kind: 'board', addressee } };
}

/** Compose a carrier with the given lines. */
function scrollCmd(lines: [Verb, Noun | null, number][], wage: number, dest: Dest): Command {
  return { type: 'compose', playerId: 0, lines: lines.map(([verb, noun, count]) => ({ verb, noun, count })), wage, dest };
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
      if (i === 100) live.enqueue(noticeCmd('CHOP', 'WOOD', 5, 4));
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
    applyCommand(s, noticeCmd('MINE', 'STONE', 10, 3));
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
    const r = applyCommand(s, noticeCmd('MINE', 'STONE', 999, 50));
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
    expect(startGold + s.income - s.gold).toBe(5); // paid exactly once (the patron's stipend aside)
  });

  it('gold is conserved: treasury + purses + tavern spending', () => {
    const s = createState(11);
    const start = s.gold;
    run(s, 4000);
    const purses = s.workers.reduce((a, w) => a + w.purse, 0);
    // gold comes in from the patron, and leaves with workers who go home or at the tavern
    const spent = start + s.income - s.gold - purses - s.leftWith;
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
    const stoneBefore = siteOf(s, 'stockpile').store.stone;
    post(s, 'HAUL', 'STONE', 2, 3, w.id);
    let t = 0;
    while (s.notices.length > 0 && t++ < 4000) step(s);
    expect(siteOf(s, 'stockpile').store.stone - stoneBefore).toBe(2);
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
    applyCommand(s, noticeCmd('CHOP', 'WOOD', 5, 2));
    const pinned = runUntil(s, () => s.notices.some((n) => n.order[0].t === 'CHOP'), 3000);
    expect(pinned).toBe(true);
    expect(s.designs.length).toBe(0);
  });

  it('a scroll is handed to a worker by name and loops', () => {
    const s = createState(4);
    const miner = s.workers[3];
    applyCommand(s, {
      type: 'compose',
      playerId: 0,
      lines: [
        { verb: 'MINE', noun: 'STONE', count: 1 },
        { verb: 'HAUL', noun: 'STONE', count: 1 },
        { verb: 'REPEAT', noun: null, count: 1 },
      ],
      wage: 1,
      dest: { kind: 'worker', workerId: miner.id },
    });
    expect(runUntil(s, () => miner.held.length > 0, 4000)).toBe(true);
    expect(runUntil(s, () => miner.held[0]?.loops >= 2, 20 * 300)).toBe(true);
    expect(siteOf(s, 'stockpile').store.stone).toBeGreaterThan(0);
  });

  it('a scroll with the scribe loop makes a second scribe', () => {
    const s = createState(4);
    const second = s.workers[5];
    applyCommand(s, {
      type: 'compose',
      playerId: 0,
      lines: [
        { verb: 'WRITE', noun: null, count: 1 },
        { verb: 'DELIVER', noun: null, count: 1 },
        { verb: 'REPEAT', noun: null, count: 1 },
      ],
      wage: 1,
      dest: { kind: 'worker', workerId: second.id },
    });
    expect(runUntil(s, () => second.held.length > 0, 4000)).toBe(true);
    // give them plenty to write
    for (let i = 0; i < 6; i++) applyCommand(s, noticeCmd('CHOP', 'WOOD', 1, 1));
    expect(runUntil(s, () => second.skills.writing > 0, 20 * 300)).toBe(true);
  });

  it('a line that cannot be done is skipped, not stuck on', () => {
    const s = createState(4);
    const w = s.workers[2];
    s.items = [];
    w.held.push(newCarrier(s, [{ order: makeOrder('HAUL', 'WOOD'), count: 1 }, { order: makeOrder('CHOP', 'WOOD'), count: 1 }], 0, { kind: 'worker', workerId: w.id }));
    expect(runUntil(s, () => w.held.length === 0, 20 * 200)).toBe(true);
  });
});

describe('the board, hand delivery and the standing charter', () => {
  it('a scroll posted for Anyone is taken down by whoever is free', () => {
    const s = createState(4);
    applyCommand(s, scrollCmd([['MINE', 'STONE', 2], ['HAUL', 'STONE', 2], ['REPEAT', null, 1]], 1, { kind: 'board', addressee: null }));
    expect(runUntil(s, () => s.boardScrolls.length > 0, 3000)).toBe(true);
    expect(runUntil(s, () => s.boardScrolls.length === 0, 3000)).toBe(true);
    const taker = s.workers.find((w) => w.held[0]?.orders[0][0].t === 'MINE');
    expect(taker).toBeDefined();
  });

  it('a card with a count is worked until the count is done', () => {
    const s = createState(4);
    const w = s.workers[3];
    applyCommand(s, scrollCmd([['CHOP', 'WOOD', 5]], 0, { kind: 'worker', workerId: w.id }));
    expect(runUntil(s, () => w.held.length > 0, 3000)).toBe(true);
    const card = w.held[0];
    expect(runUntil(s, () => w.held.length === 0, 20 * 400)).toBe(true);
    expect(card.lineDone + card.counts[0]).toBeGreaterThanOrEqual(5); // finished its count
    const wood = s.items.filter((it) => it.type === 'wood').length + siteOf(s, 'stockpile').store.wood;
    expect(wood).toBeGreaterThanOrEqual(5);
  });

  it('something addressed to you by name always wins at the board', () => {
    const s = createState(4);
    const w = s.workers[2];
    applyCommand(s, noticeCmd('CHOP', 'WOOD', 50, 0, w.id));
    expect(runUntil(s, () => s.notices.some((n) => n.addressee === w.id), 3000)).toBe(true);
    // when they next read the board, they take their own notice over the high-paying ones for Anyone
    // (first let them finish whatever job they were already on)
    expect(runUntil(s, () => w.memory === null, 3000)).toBe(true);
    expect(runUntil(s, () => w.memory !== null, 3000)).toBe(true);
    expect(w.memory!.order[0].t).toBe('CHOP');
  });

  it('handing someone an order replaces their scroll', () => {
    const s = createState(4);
    const scribe = s.workers[0];
    applyCommand(s, scrollCmd([['CHOP', 'WOOD', 3]], 0, { kind: 'worker', workerId: scribe.id }));
    expect(runUntil(s, () => scribe.held[0]?.orders[0][0].t === 'CHOP', 3000)).toBe(true);
    expect(scribe.held.length).toBe(1);
  });

  it('the standing charter posts a scribe loop when no one is writing', () => {
    const s = createState(4);
    const scribe = s.workers[0];
    // release the scribe: hand them a card that sends them to the board
    applyCommand(s, scrollCmd([['CHECK', 'BOARD', 1]], 0, { kind: 'worker', workerId: scribe.id }));
    expect(runUntil(s, () => s.boardScrolls.some((c) => c.patron) || s.events.some((e) => e.text.includes("patron's charter posts")), 4000)).toBe(true);
    // and someone picks it up, so writing goes on
    expect(runUntil(s, () => s.workers.some((w) => w.held.some((c) => c.patron)), 3000)).toBe(true);
  });

  it('a released courier leaves undelivered carriers in the outbox for the next one', () => {
    const s = createState(4);
    const scribe = s.workers[0];
    const other = s.workers[4];
    scribe.bag.push(newCarrier(s, [{ order: makeOrder('CHOP', 'WOOD'), count: 2 }], 0, { kind: 'worker', workerId: other.id }));
    giveCarrier(s, scribe, newCarrier(s, [{ order: makeOrder('MINE', 'STONE'), count: 1 }], 0, { kind: 'worker', workerId: scribe.id }));
    expect(scribe.bag.length).toBe(0);
    expect(s.outbox.length).toBe(1);
    // the charter re-hires a scribe, who collects it from the outbox and delivers it
    expect(runUntil(s, () => other.held.some((c) => c.orders[0][0].t === 'CHOP') || s.outbox.length === 0, 20 * 300)).toBe(true);
  });
});

describe('the tower', () => {
  it('a finished deck covers exactly the tower footprint', () => {
    const s = createState(7);
    s.projects.push(newProject(s, 1));
    const p = s.projects[0];
    for (let i = 0; i < p.needs.stone; i++) placeMaterial(s, p, 'stone');
    for (let i = 0; i < p.needs.wood; i++) placeMaterial(s, p, 'wood');
    const row = deckRow(1);
    for (let x = TOWER.x0; x <= TOWER.x1; x++) {
      const t = tileAt(s, x, row);
      expect(t === Tile.Deck || t === Tile.Ladder).toBe(true);
    }
    expect(tileAt(s, TOWER.x0 - 1, row)).toBe(Tile.Air);
    expect(tileAt(s, TOWER.x1 + 1, row)).toBe(Tile.Air);
  });

  it('a blueprint carried up starts a floor; builders finish it with a ladder', () => {
    const s = createState(7);
    applyCommand(s, { type: 'blueprint', playerId: 0 });
    applyCommand(s, noticeCmd('BUILD', 'TOWER', 40, 1));
    expect(runUntil(s, () => s.projects.length > 0, 3000)).toBe(true);
    expect(runUntil(s, () => s.floors === 1, 20 * 400)).toBe(true);
    // the new floor is walkable: there's a path from the ground to its stockpile
    const top = stockpileOn(s, 1)!;
    expect(top).not.toBeNull();
    const ground = siteOf(s, 'beds');
    expect(findPath(s, { x: ground.x0, y: ground.y }, { x: top.x0, y: top.y })).not.toBeNull();
  });

  it('nobody builds without a blueprint', () => {
    const s = createState(7);
    applyCommand(s, noticeCmd('BUILD', 'TOWER', 40, 5));
    run(s, 3000);
    expect(s.floors).toBe(0);
    expect(s.projects.length).toBe(0);
  });

  it('haul can move goods between stockpiles', () => {
    const s = createState(7);
    // build floor 1 quickly by hand, then haul stone up to it
    s.projects.push(newProject(s, 1));
    const p = s.projects[0];
    for (let i = 0; i < p.needs.stone; i++) placeMaterial(s, p, 'stone');
    for (let i = 0; i < p.needs.wood; i++) placeMaterial(s, p, 'wood');
    expect(s.floors).toBe(1);
    const w = s.workers[2];
    applyCommand(s, scrollCmdPlaces('HAUL', 'STONE', 0, 1, 3, w.id));
    expect(runUntil(s, () => (stockpileOn(s, 1)?.store.stone ?? 0) >= 3, 20 * 300)).toBe(true);
  });

  it('orders with places read back the way they were written', () => {
    const o = makeOrder('HAUL', 'STONE', { from: 0, to: 3 });
    expect(orderText(o)).toBe('haul stone from base to floor 3');
    expect(parseOrder(o)).toEqual({ verb: 'HAUL', noun: 'STONE', who: null, from: 0, to: 3 });
  });

  it('only hauling takes places', () => {
    const s = createState(7);
    const r = applyCommand(s, { type: 'compose', playerId: 0, lines: [{ verb: 'MINE', noun: 'STONE', from: 0, to: 1, count: 1 }], wage: 0, dest: { kind: 'board', addressee: null } });
    expect(r.ok).toBe(false);
  });
});

function scrollCmdPlaces(verb: Verb, noun: Noun, from: number, to: number, count: number, workerId: number): Command {
  return { type: 'compose', playerId: 0, lines: [{ verb, noun, from, to, count }], wage: 0, dest: { kind: 'worker', workerId } };
}

describe('language drift', () => {
  /** Put a worker on a floor and keep them there (needs off) until a condition holds. */
  function strand(s: State, w: (typeof s.workers)[number], level: number) {
    w.x = TOWER.x0 + 5;
    w.y = WORLD.groundRow - 1 - level * TOWER.floorHeight;
    w.hunger = w.thirst = w.fatigue = 0;
  }

  it('nobody drifts until the tower is tall enough to open a language', () => {
    const s = createState(3);
    const w = s.workers[2];
    strand(s, w, 3);
    for (let i = 0; i < 5000; i++) updateDrift(s, w);
    expect(w.driftTongue).toBeNull();
    expect(w.vocab.en!.length).toBe(allWords().length);
  });

  it('high up, words drift one at a time into a fixed tongue from the open pool', () => {
    const s = createState(3);
    s.floors = 3; // French is open, Greek isn't yet
    const w = s.workers[2];
    strand(s, w, 3);
    for (let i = 0; i < 5000; i++) updateDrift(s, w);
    expect(w.driftTongue).toBe('fr');
    const moved = w.vocab.fr!.length;
    expect(moved).toBeGreaterThan(1);
    expect(w.vocab.en!.length + moved).toBe(allWords().length); // nothing lost, just moved
  });

  it('a worker can’t take a notice they can’t read, unless it has their name', () => {
    const s = createState(3);
    const w = s.workers[2];
    w.vocab.en = w.vocab.en!.filter((t) => t !== 'CHOP');
    post(s, 'CHOP', 'WOOD', 10, 50);
    expect(eligibleNotices(s, w).some((n) => n.order[0].t === 'CHOP')).toBe(false);
    post(s, 'CHOP', 'WOOD', 10, 1, w.id);
    expect(eligibleNotices(s, w).some((n) => n.addressee === w.id)).toBe(true);
  });

  it('an unknown object gets a guess, and guessing is confusing', () => {
    const s = createState(3);
    const w = s.workers[2];
    w.vocab.en = w.vocab.en!.filter((t) => t !== 'STONE');
    const r = readOrder(s, w, makeOrder('HAUL', 'STONE'));
    expect(r.order).not.toBeNull();
    expect(r.guesses).toBe(1);
    addConfusion(w, r);
    expect(w.confusion).toBeGreaterThan(0);
    // an unknown verb can't be read at all
    w.vocab.en = w.vocab.en!.filter((t) => t !== 'MINE');
    expect(readOrder(s, w, makeOrder('MINE', 'STONE')).order).toBeNull();
  });

  it('LEARN teaches you to write a word; TEACH gives a drifted worker their words back', () => {
    const s = createState(3);
    const translator = s.workers[1];
    const student = s.workers[4];
    // the student lost "stone" to French
    student.vocab.en = student.vocab.en!.filter((t) => t !== 'STONE');
    student.vocab.fr = ['STONE'];
    student.driftTongue = 'fr';
    applyCommand(s, scrollLearn('LEARN', student.id, translator.id));
    expect(runUntil(s, () => (s.lexicon.fr ?? []).includes('STONE'), 20 * 400)).toBe(true);
    applyCommand(s, scrollLearn('TEACH', student.id, translator.id));
    expect(runUntil(s, () => student.vocab.en!.includes('STONE'), 20 * 400)).toBe(true);
  });

  it('you can only write words you know in a language', () => {
    const s = createState(3);
    const bad = applyCommand(s, { type: 'compose', playerId: 0, lines: [{ verb: 'MINE', noun: 'STONE', count: 1 }], wage: 0, dest: { kind: 'board', addressee: null }, lang: 'fr' });
    expect(bad.ok).toBe(false);
    s.lexicon.fr = ['MINE', 'STONE'];
    const good = applyCommand(s, { type: 'compose', playerId: 0, lines: [{ verb: 'MINE', noun: 'STONE', count: 1 }], wage: 0, dest: { kind: 'board', addressee: null }, lang: 'fr' });
    expect(good.ok).toBe(true);
    expect(orderText(s.designs[s.designs.length - 1].carrier.orders[0])).toBe('creuser pierre');
  });

  it('a scribe is much slower at words they don’t know', () => {
    const s = createState(3);
    const scribe = s.workers[0];
    const c = newCarrier(s, [{ order: makeOrder('MINE', 'STONE', {}, 'fr'), count: 1 }], 0, { kind: 'board', addressee: null });
    const fast = writingCostFor(c, { ...scribe, vocab: { fr: ['MINE', 'STONE'] } });
    const slow = writingCostFor(c, scribe);
    expect(slow).toBeGreaterThan(fast * 2);
  });
});

function scrollLearn(verb: 'TEACH' | 'LEARN', studentId: number, translatorId: number): Command {
  return { type: 'compose', playerId: 0, lines: [{ verb, noun: null, who: studentId, count: 3 }], wage: 0, dest: { kind: 'worker', workerId: translatorId } };
}

describe('the patron and quitting', () => {
  it('the stipend shrinks with patience, and a finished floor wins patience back', () => {
    const s = createState(12, 'normal');
    expect(currentStipend(s)).toBe(PATRON.stipendBase);
    s.patience = 50;
    expect(currentStipend(s)).toBe(Math.round(PATRON.stipendBase / 2));
    const gold = s.gold;
    patronFloorDone(s, 1);
    expect(s.patience).toBe(50 + PATRON.floorPatience);
    expect(s.gold).toBe(gold + PATRON.floorBonusBase + PATRON.floorBonusPerLevel);
  });

  it('patience drains faster on hard', () => {
    const easy = createState(12, 'easy');
    const hard = createState(12, 'hard');
    run(easy, 3000);
    run(hard, 3000);
    expect(hard.patience).toBeLessThan(easy.patience);
  });

  it('a miserable worker gives notice, walks home and is gone', () => {
    const s = createState(12);
    const w = s.workers[3];
    w.moodlets.push({ kind: 'test', label: 'Miserable', value: -60, until: 1e9 });
    w.mood = 0;
    expect(runUntil(s, () => w.noticeUntil !== null, QUIT.sustainTicks + 200)).toBe(true);
    expect(runUntil(s, () => w.leaving, QUIT.noticeTicks + 200)).toBe(true);
    expect(runUntil(s, () => !s.workers.includes(w), 20 * 120)).toBe(true);
  });

  it('a worker on notice who cheers up decides to stay', () => {
    const s = createState(12);
    const w = s.workers[3];
    w.noticeUntil = s.tick + QUIT.noticeTicks;
    w.lowMoodTicks = QUIT.sustainTicks;
    w.moodlets.push({ kind: 'test', label: 'Delighted', value: 40, until: 1e9 });
    w.mood = 90;
    step(s);
    expect(w.noticeUntil).toBeNull();
    expect(w.leaving).toBe(false);
  });

  it('while the patron is pleased and the tower grows, newcomers arrive', () => {
    const s = createState(12);
    s.floors = 3; // room for a few more workers
    const before = s.workers.length;
    run(s, ARRIVALS.every + 10);
    expect(s.workers.length).toBe(before + 1);
    // an impatient patron sends nobody
    const t = createState(12);
    t.floors = 3;
    t.patience = PATRON.recruitAbove - 1;
    t.difficulty = 'easy';
    run(t, ARRIVALS.every + 10);
    expect(t.workers.length).toBe(before);
  });
});

describe('recovering from a drifted scribe', () => {
  it('when the scribe can no longer read "write", the charter posts a new scribe loop and someone takes it', () => {
    const s = createState(5);
    const scribe = s.workers[0];
    scribe.vocab.en = scribe.vocab.en!.filter((t) => t !== 'WRITE');
    scribe.vocab.fr = ['WRITE'];
    scribe.driftTongue = 'fr';
    expect(runUntil(s, () => s.boardScrolls.some((c) => c.patron), PATRON.charterCheckTicks + 5)).toBe(true);
    // a worker who can read it becomes the new scribe
    expect(runUntil(s, () => s.workers.some((w) => w !== scribe && w.held.some((c) => c.patron)), 4000)).toBe(true);
  });

  it('a worker who keeps failing to read their scroll gives up on it', () => {
    const s = createState(5);
    const scribe = s.workers[0];
    scribe.vocab.en = scribe.vocab.en!.filter((t) => t !== 'WRITE');
    expect(runUntil(s, () => !scribe.held.some((c) => c.orders[0][0].t === 'WRITE' && c !== s.boardScrolls[0]), 20 * 300)).toBe(true);
  });
});

describe('all and forever counts', () => {
  it('"all" isn’t allowed for work that never runs out', () => {
    const s = createState(6);
    expect(applyCommand(s, noticeCmd('MINE', 'STONE', ALL, 1)).ok).toBe(false);
    expect(applyCommand(s, noticeCmd('MINE', 'STONE', FOREVER, 1)).ok).toBe(true);
    expect(applyCommand(s, noticeCmd('HAUL', 'STONE', ALL, 1)).ok).toBe(true);
  });

  it('a haul-all notice moves everything lying around, then comes down', () => {
    const s = createState(6);
    s.notices = [];
    s.reserved = 0;
    const y = siteOf(s, 'beds').y;
    for (let i = 0; i < 4; i++) s.items.push({ id: s.nextId++, type: 'stone', x: 60 + i, y, reservedBy: null });
    pinNotice(s, makeOrder('HAUL', 'STONE'), ALL, 1, null);
    const before = siteOf(s, 'stockpile').store.stone;
    expect(runUntil(s, () => s.notices.length === 0, 20 * 300)).toBe(true);
    expect(siteOf(s, 'stockpile').store.stone - before).toBe(4);
  });

  it('a scroll line set to all finishes when there is nothing left, with no hard feelings', () => {
    const s = createState(6);
    const w = s.workers[3];
    s.items = [];
    const y = siteOf(s, 'beds').y;
    s.items.push({ id: s.nextId++, type: 'wood', x: w.x, y, reservedBy: null });
    giveCarrier(s, w, newCarrier(s, [{ order: makeOrder('HAUL', 'WOOD'), count: ALL }, { order: makeOrder('CHOP', 'WOOD'), count: 1 }], 0, { kind: 'worker', workerId: w.id }));
    const card = w.held[0];
    expect(runUntil(s, () => card.pc === 1, 20 * 200)).toBe(true);
    expect(w.moodlets.some((m) => m.kind === 'failed')).toBe(false);
  });

  it('teach all passes on every missing word', () => {
    const s = createState(6);
    const translator = s.workers[1];
    const student = s.workers[4];
    const lost = ['STONE', 'WOOD', 'HAUL', 'MINE'] as const;
    student.vocab.en = student.vocab.en!.filter((t) => !(lost as readonly string[]).includes(t));
    applyCommand(s, { type: 'compose', playerId: 0, lines: [{ verb: 'TEACH', noun: null, who: student.id, count: ALL }], wage: 0, dest: { kind: 'worker', workerId: translator.id } });
    expect(runUntil(s, () => lost.every((t) => student.vocab.en!.includes(t)), 20 * 600)).toBe(true);
  });
});

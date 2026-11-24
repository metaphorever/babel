import { describe, expect, it } from 'vitest';
import { createState, hashState, replay, step, Sim } from '../src/sim/sim';
import { applyCommand, validateCommand, type Command } from '../src/sim/commands';
import { campJobs, footprint, groundUse, type PlaceRequest } from '../src/sim/build';
import { pinNotice } from '../src/sim/carriers';
import { ALL, makeOrder } from '../src/sim/lang';
import { findPath } from '../src/sim/path';
import { deckRow } from '../src/sim/tower';
import { BUILD, MAP, PATRON, TIME } from '../src/sim/tuning';
import { Tile, type FixtureKind, type SimState } from '../src/sim/types';
import { groundRow, sitesOf, storyRow, tileAt } from '../src/sim/world';

function run(s: SimState, ticks: number) {
  for (let i = 0; i < ticks; i++) step(s);
}

function runUntil(s: SimState, done: () => boolean, maxTicks: number): boolean {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return true;
    step(s);
  }
  return done();
}

const place = (p: PlaceRequest): Command => ({ type: 'place', playerId: 0, place: p });

/** The first stretch of open ground at least this wide, from the left. */
function freeSpot(s: SimState, width: number, from = 0): number {
  const use = groundUse(s);
  let run0 = -1;
  for (let x = from; x < s.width; x++) {
    if (use[x] === null) {
      if (run0 < 0) run0 = x;
      if (x - run0 + 1 >= width) return run0;
    } else run0 = -1;
  }
  throw new Error('no room');
}

/** Post a "build camp, all of it" notice straight onto the board. */
function postBuildCamp(s: SimState) {
  pinNotice(s, makeOrder('BUILD', 'CAMP'), ALL, 1, null);
}

/** Plenty of stone and wood in one of the base stockpiles. */
function stockUp(s: SimState) {
  const pile = s.sites.filter((x) => x.kind === 'stockpile' && !x.supplies)[1];
  pile.capacity = null;
  pile.store.wood = 100;
  pile.store.stone = 50;
}

/** Add a finished building to a prebuilt colony (built by workers on a build-camp notice). */
function withHouse(s: SimState, width: number, stories: 1 | 2 = 1): number {
  stockUp(s);
  const x0 = freeSpot(s, width, 100);
  expect(applyCommand(s, place({ what: 'house', x0, width, stories, name: 'Test house' })).ok).toBe(true);
  postBuildCamp(s);
  const b = s.buildings.find((x) => x.name === 'Test house')!;
  expect(runUntil(s, () => b.build === null, 20 * 600)).toBe(true);
  return x0;
}

describe('the P1 map', () => {
  it('is the same for the same seed and different for another', () => {
    const a = createState(42, 'normal', 'opening');
    const b = createState(42, 'normal', 'opening');
    const c = createState(43, 'normal', 'opening');
    expect(hashState(a)).toBe(hashState(b));
    const layout = (s: SimState) => s.sites.map((x) => `${x.kind}@${x.x0}`).join(',');
    expect(layout(a)).not.toBe(layout(c));
  });

  it('puts the road home on the left, keeps the right edge clear, and never overlaps', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = createState(seed, 'normal', 'opening');
      const road = s.sites.find((x) => x.kind === 'home')!;
      expect(road.x0).toBe(0);
      const ground = [...s.sites.filter((x) => x.buildingId === null), ...s.buildings];
      const taken = new Array(s.width).fill(0);
      for (const g of ground) for (let x = g.x0; x <= g.x1; x++) taken[x]++;
      expect(taken.every((n) => n <= 1)).toBe(true);
      expect(Math.max(...ground.map((g) => g.x1))).toBeLessThan(s.width - MAP.reservedRight);
      // the old shack with its broken oven, and the patron's supplies
      expect(s.buildings.some((b) => b.kind === 'shack')).toBe(true);
      expect(s.sites.some((x) => x.kind === 'oven' && x.broken)).toBe(true);
      expect(s.sites.find((x) => x.supplies)!.store.stone).toBe(BUILD.supplies.stone);
    }
  });

  it('starts with nothing built: no charter, no board, no tower', () => {
    const s = createState(7, 'normal', 'opening');
    expect(s.charter).toBe(false);
    expect(s.tower).toBeNull();
    expect(s.notices.length).toBe(0);
    expect(s.sites.some((x) => x.kind === 'scriptorium' || x.kind === 'board')).toBe(false);
    // the game runs fine like this: workers eat from the supplies and sleep rough
    run(s, 3000);
    expect(s.workers.length).toBe(8);
  });
});

describe('the opening', () => {
  it('the scriptorium and board go up together, then the charter is decreed', () => {
    const s = createState(7, 'normal', 'opening');
    const x0 = freeSpot(s, 9);
    expect(applyCommand(s, place({ what: 'scriptorium', x0 })).ok).toBe(true);
    const board = s.sites.find((x) => x.kind === 'board')!;
    expect(board.x0).toBe(x0 + BUILD.scriptorium.width + BUILD.boardGap);
    // the patron's clerk hands out the build orders: nobody had to write them
    expect(s.workers.filter((w) => w.held.some((c) => c.patron && c.orders[0][1].t === 'CAMP')).length).toBeGreaterThan(0);
    expect(runUntil(s, () => s.charter, 20 * 600)).toBe(true);
    const scribe = s.workers.find((w) => w.held.some((c) => c.orders[0][0].t === 'WRITE'));
    expect(scribe).toBeDefined();
    expect(s.notices.length).toBeGreaterThan(0);
  });

  it('can’t place on top of something, or a second scriptorium', () => {
    const s = createState(7, 'normal', 'opening');
    const field = s.sites.find((x) => x.kind === 'field')!;
    const r = validateCommand(s, place({ what: 'scriptorium', x0: field.x0 }));
    expect(r.ok).toBe(false);
    expect(footprint(s, { what: 'scriptorium', x0: field.x0 }).blocked.some(Boolean)).toBe(true);
    const x0 = freeSpot(s, 9);
    applyCommand(s, place({ what: 'scriptorium', x0 }));
    expect(validateCommand(s, place({ what: 'scriptorium', x0: freeSpot(s, 9) })).ok).toBe(false);
  });

  it('the tower site comes after the scriptorium, and only once', () => {
    const s = createState(7, 'normal', 'opening');
    expect(validateCommand(s, place({ what: 'tower', x0: freeSpot(s, 16) })).ok).toBe(false);
    applyCommand(s, place({ what: 'scriptorium', x0: freeSpot(s, 9) }));
    const tx = freeSpot(s, 16);
    expect(applyCommand(s, place({ what: 'tower', x0: tx })).ok).toBe(true);
    expect(s.tower).toEqual({ x0: tx, x1: tx + 15 });
    expect(validateCommand(s, place({ what: 'tower', x0: freeSpot(s, 16) })).ok).toBe(false);
    expect(validateCommand(s, { type: 'demolish', playerId: 0, target: { kind: 'site', id: s.sites.find((x) => x.kind === 'foundation')!.id } }).ok).toBe(false);
  });

  it('replays exactly, placement commands and all', () => {
    const live = new Sim(5, 'normal', 'opening');
    for (let i = 0; i < 3000; i++) {
      if (i === 10) live.enqueue(place({ what: 'scriptorium', x0: freeSpot(live.state, 9) }));
      if (i === 20) live.enqueue(place({ what: 'tower', x0: freeSpot(live.state, 16) }));
      live.step();
    }
    expect(hashState(replay(5, live.history, live.state.tick, 'normal', 'opening'))).toBe(hashState(live.state));
  });

  it('the patron’s grace period: no drain until day 3, unless floor 1 is done', () => {
    const s = createState(7, 'normal', 'opening');
    s.tick = TIME.dayTicks * PATRON.graceDays - 50;
    run(s, 40);
    expect(s.patience).toBe(100);
    run(s, 200);
    expect(s.patience).toBeLessThan(100);
  });
});

describe('buildings and fixtures', () => {
  it('a building is built by "build camp" workers from the stockpiles', () => {
    const s = createState(3);
    const wood = s.sites.filter((x) => x.kind === 'stockpile').reduce((n, x) => n + x.store.wood, 0) + 100 - 8; // stockUp sets the 8 to 100
    withHouse(s, 4);
    const after = s.sites.filter((x) => x.kind === 'stockpile').reduce((n, x) => n + x.store.wood, 0);
    expect(wood - after).toBe(4); // one wood per tile
  });

  it('fixtures only go inside a finished building, and can’t overlap', () => {
    const s = createState(3);
    stockUp(s);
    const x0 = freeSpot(s, 6, 100);
    expect(validateCommand(s, place({ what: 'fixture', fixture: 'bed', x0, story: 0 })).ok).toBe(false);
    applyCommand(s, place({ what: 'house', x0, width: 6, stories: 1, name: 'Dorm' }));
    const early = validateCommand(s, place({ what: 'fixture', fixture: 'bed', x0, story: 0 }));
    expect(early.ok).toBe(false);
    postBuildCamp(s);
    const b = s.buildings.find((x) => x.name === 'Dorm')!;
    expect(runUntil(s, () => b.build === null, 20 * 600)).toBe(true);
    expect(applyCommand(s, place({ what: 'fixture', fixture: 'bed', x0, story: 0 })).ok).toBe(true);
    expect(validateCommand(s, place({ what: 'fixture', fixture: 'bed', x0: x0 + 1, story: 0 })).ok).toBe(false);
    expect(validateCommand(s, place({ what: 'fixture', fixture: 'bed', x0: x0 + 5, story: 0 })).ok).toBe(false); // sticks out
    expect(applyCommand(s, place({ what: 'fixture', fixture: 'pantry', x0: x0 + 2, story: 0 })).ok).toBe(true);
    // "build camp, all of it" came down when the building was done; new plans need new work
    expect(s.notices.some((n) => n.order[1].t === 'CAMP')).toBe(false);
    postBuildCamp(s);
    expect(runUntil(s, () => campJobs(s).length === 0, 20 * 600)).toBe(true);
    const dorm = s.buildings.find((x) => x.name === 'Dorm')!;
    const inside = s.sites.filter((x) => x.buildingId === dorm.id).map((x) => x.label);
    expect(inside).toEqual(['Bed', 'Pantry']);
  });

  it('a stockpile goes on open ground and holds the same as one indoors', () => {
    const s = createState(3);
    const x0 = freeSpot(s, 2, 100);
    expect(applyCommand(s, place({ what: 'fixture', fixture: 'stockpile', x0, story: 0 })).ok).toBe(true);
    const pile = s.sites[s.sites.length - 1];
    expect(pile.capacity).toBe(BUILD.capacity.stockpile);
    expect(pile.build).toBeNull();
  });

  it('a full stockpile takes no more', () => {
    const s = createState(3);
    s.notices = [];
    s.reserved = 0;
    for (const p of s.sites.filter((x) => x.kind === 'stockpile')) p.store.stone = (p.capacity ?? 0) - p.store.wood - p.store.grain;
    const y = groundRow();
    for (let i = 0; i < 4; i++) s.items.push({ id: s.nextId++, type: 'stone', x: 60 + i, y, reservedBy: null });
    pinNotice(s, makeOrder('HAUL', 'STONE'), 4, 1, null);
    run(s, 20 * 120);
    expect(s.items.filter((it) => it.type === 'stone').length).toBe(4);
  });

  it('a two-story building gets a deck and a ladder, and its upstairs can be reached', () => {
    const s = createState(3);
    const x0 = withHouse(s, 6, 2);
    expect(tileAt(s, x0 + 3, deckRow(1))).toBe(Tile.Deck);
    expect(tileAt(s, x0, deckRow(1))).toBe(Tile.Ladder);
    expect(findPath(s, { x: x0 - 3, y: groundRow() }, { x: x0 + 4, y: storyRow(1) })).not.toBeNull();
    // fixtures can't block the ladder
    expect(validateCommand(s, place({ what: 'fixture', fixture: 'bed', x0, story: 1 })).ok).toBe(false);
    expect(applyCommand(s, place({ what: 'fixture', fixture: 'bed', x0: x0 + 2, story: 1 })).ok).toBe(true);
  });

  it('bread is baked at the oven and lands in the pantry', () => {
    const s = createState(3);
    const pantry = sitesOf(s, 'pantry')[0];
    pantry.store.bread = 0;
    expect(runUntil(s, () => pantry.store.bread > 0, 20 * 300)).toBe(true);
  });

  it('without an oven, nobody takes the cooking notice', () => {
    const s = createState(3);
    s.sites = s.sites.filter((x) => x.kind !== 'oven' || x.broken);
    run(s, 20 * 120);
    expect(s.workers.some((w) => w.memory?.order[0].t === 'COOK')).toBe(false);
  });

  it('workers sleep in beds when there are beds, and on the ground when not', () => {
    const s = createState(3);
    const w = s.workers[2];
    w.fatigue = 99;
    expect(runUntil(s, () => w.activity.kind === 'sleep' && w.activity.stage >= 1, 2000)).toBe(true);
    expect(sitesOf(s, 'bed').some((b) => b.id === w.activity.ref)).toBe(true);
    const t = createState(3);
    t.sites = t.sites.filter((x) => x.kind !== 'bed');
    const v = t.workers[2];
    v.fatigue = 99;
    expect(runUntil(t, () => v.activity.kind === 'sleep' && v.activity.stage >= 1, 2000)).toBe(true);
    expect(v.activity.ref).toBe(-1);
  });

  it('beer is brewed into the bar, and what workers pay there comes back', () => {
    const s = createState(3);
    const bar = sitesOf(s, 'bar')[0];
    bar.store.beer = 0;
    pinNotice(s, makeOrder('BREW', 'BEER'), 4, 1, null);
    expect(runUntil(s, () => bar.store.beer > 0, 20 * 400)).toBe(true);
    const w = s.workers[3];
    w.purse = 50;
    w.mood = 20;
    expect(runUntil(s, () => s.takings > 0, 20 * 400)).toBe(true);
  });
});

describe('demolishing', () => {
  it('the broken oven, then the empty shack: half the materials come back', () => {
    const s = createState(3);
    const oven = s.sites.find((x) => x.kind === 'oven' && x.broken)!;
    const shack = s.buildings.find((x) => x.kind === 'shack')!;
    // the shack can be marked while the oven is in it, but waits for it
    expect(applyCommand(s, { type: 'demolish', playerId: 0, target: { kind: 'building', id: shack.id } }).ok).toBe(true);
    expect(campJobs(s).some((j) => j.id === shack.id)).toBe(false);
    expect(applyCommand(s, { type: 'demolish', playerId: 0, target: { kind: 'site', id: oven.id } }).ok).toBe(true);
    postBuildCamp(s);
    expect(runUntil(s, () => !s.buildings.includes(shack), 20 * 900)).toBe(true);
    expect(s.sites.includes(oven)).toBe(false);
    const stone = Math.floor(BUILD.fixtures.oven.cost.stone * BUILD.salvage);
    const wood = Math.floor(BUILD.house.woodPerTilePerStory * MAP.shack * BUILD.salvage);
    expect(s.events.some((e) => e.text.startsWith(`Broken oven is taken down: ${stone} units`))).toBe(true);
    expect(s.events.some((e) => e.text.startsWith(`Old shack is taken down: ${wood} units`))).toBe(true);
  });

  it('a pantry with bread in it waits until it is empty', () => {
    const s = createState(3);
    const pantry = sitesOf(s, 'pantry')[0];
    pantry.store.bread = 5;
    applyCommand(s, { type: 'demolish', playerId: 0, target: { kind: 'site', id: pantry.id } });
    expect(campJobs(s).some((j) => j.id === pantry.id)).toBe(false);
    pantry.store.bread = 0;
    expect(campJobs(s).some((j) => j.id === pantry.id)).toBe(true);
  });

  it('the scriptorium, tower site and land can’t be demolished', () => {
    const s = createState(3);
    for (const kind of ['scriptorium', 'foundation', 'forest'] as const) {
      const site = s.sites.find((x) => x.kind === kind)!;
      expect(validateCommand(s, { type: 'demolish', playerId: 0, target: { kind: 'site', id: site.id } }).ok).toBe(false);
    }
  });

  it('a building nobody has started is simply called off', () => {
    const s = createState(3);
    const x0 = freeSpot(s, 5, 100);
    applyCommand(s, place({ what: 'house', x0, width: 5, stories: 1, name: 'Mistake' }));
    const b = s.buildings.find((x) => x.name === 'Mistake')!;
    applyCommand(s, { type: 'demolish', playerId: 0, target: { kind: 'building', id: b.id } });
    expect(s.buildings.includes(b)).toBe(false);
  });
});

describe('a whole opening, start to first floor', () => {
  it('runs from nothing to a camp and a tower floor without getting stuck', () => {
    const s = createState(11, 'normal', 'opening');
    applyCommand(s, place({ what: 'scriptorium', x0: freeSpot(s, 9) }));
    expect(runUntil(s, () => s.charter, 20 * 600)).toBe(true);
    applyCommand(s, place({ what: 'tower', x0: freeSpot(s, 16) }));
    const hx = freeSpot(s, 8);
    applyCommand(s, place({ what: 'house', x0: hx, width: 8, stories: 1, name: 'Camp' }));
    // the player's orders now go through the scribe like any other
    applyCommand(s, { type: 'compose', playerId: 0, lines: [{ verb: 'BUILD', noun: 'CAMP', count: ALL }], wage: 1, dest: { kind: 'board', addressee: null } });
    expect(runUntil(s, () => s.buildings.some((b) => b.name === 'Camp' && !b.build), 20 * 900)).toBe(true);
    for (const [fixture, dx] of [['oven', 0], ['pantry', 2], ['stockpile', 4]] as const) applyCommand(s, place({ what: 'fixture', fixture, x0: hx + dx, story: 0 }));
    applyCommand(s, { type: 'compose', playerId: 0, lines: [{ verb: 'BUILD', noun: 'CAMP', count: ALL }], wage: 1, dest: { kind: 'board', addressee: null } });
    applyCommand(s, { type: 'blueprint', playerId: 0 });
    applyCommand(s, { type: 'compose', playerId: 0, lines: [{ verb: 'BUILD', noun: 'TOWER', count: ALL }], wage: 1, dest: { kind: 'board', addressee: null } });
    expect(runUntil(s, () => s.floors >= 1, 20 * 60 * 8)).toBe(true);
    expect(sitesOf(s, 'oven').filter((x) => !x.broken).length).toBe(1);
    expect(s.workers.length).toBeGreaterThanOrEqual(8);
  });
});

describe('fixtures', () => {
  it('every fixture kind can be placed', () => {
    const s = createState(3);
    const x0 = withHouse(s, 12);
    const kinds: FixtureKind[] = ['bed', 'oven', 'pantry', 'brewery', 'bar', 'stockpile'];
    kinds.forEach((fixture, i) => expect(applyCommand(s, place({ what: 'fixture', fixture, x0: x0 + i * 2, story: 0 })).ok).toBe(true));
    const indoor = s.sites[s.sites.length - 1];
    expect(indoor.capacity).toBe(BUILD.capacity.stockpile);
  });
});

describe('session 3: shelves, cancelling, renaming, loose materials', () => {
  it('storage shelves go indoors only and hold twice a stockpile', () => {
    const s = createState(3);
    const out = freeSpot(s, 2, 100);
    expect(applyCommand(s, place({ what: 'fixture', fixture: 'shelves', x0: out, story: 0 })).ok).toBe(false);
    const x0 = withHouse(s, 6);
    expect(applyCommand(s, place({ what: 'fixture', fixture: 'shelves', x0, story: 0 })).ok).toBe(true);
    const shelves = s.sites[s.sites.length - 1];
    expect(shelves.capacity).toBe(BUILD.capacity.shelves);
    expect(BUILD.capacity.shelves).toBe(BUILD.capacity.stockpile * 2);
    expect(shelves.build).not.toBeNull();
  });

  it('cancelling something part-built gives back everything set in place, at once', () => {
    const s = createState(3);
    const x0 = freeSpot(s, 6, 100);
    applyCommand(s, place({ what: 'house', x0, width: 6, stories: 1, name: 'Half' }));
    const b = s.buildings.find((x) => x.name === 'Half')!;
    b.build!.placed.wood = 4;
    const before = s.items.filter((it) => it.type === 'wood').length;
    expect(applyCommand(s, { type: 'demolish', playerId: 0, target: { kind: 'building', id: b.id } }).ok).toBe(true);
    expect(s.buildings.some((x) => x.id === b.id)).toBe(false);
    expect(s.items.filter((it) => it.type === 'wood').length).toBe(before + 4);
  });

  it('cancelling something not started leaves nothing behind', () => {
    const s = createState(3);
    const x0 = freeSpot(s, 6, 100);
    applyCommand(s, place({ what: 'house', x0, width: 6, stories: 1, name: 'Never' }));
    const b = s.buildings.find((x) => x.name === 'Never')!;
    const items = s.items.length;
    applyCommand(s, { type: 'demolish', playerId: 0, target: { kind: 'building', id: b.id } });
    expect(s.buildings.some((x) => x.id === b.id)).toBe(false);
    expect(s.items.length).toBe(items);
  });

  it('buildings can be renamed, but not to nothing', () => {
    const s = createState(3);
    const b = s.buildings.find((x) => x.kind === 'house')!;
    expect(applyCommand(s, { type: 'rename', playerId: 0, buildingId: b.id, name: '  Mess Hall ' }).ok).toBe(true);
    expect(b.name).toBe('Mess Hall');
    expect(applyCommand(s, { type: 'rename', playerId: 0, buildingId: b.id, name: '   ' }).ok).toBe(false);
  });

  it('builders use loose materials when nothing is stored, and grumble about it', () => {
    const s = createState(3);
    const x0 = withHouse(s, 6);
    s.notices = [];
    s.reserved = 0;
    for (const site of s.sites) site.store.wood = 0;
    const gy = groundRow();
    for (let i = 0; i < 4; i++) s.items.push({ id: s.nextId++, type: 'wood', x: x0 - 3 - i, y: gy, reservedBy: null });
    applyCommand(s, place({ what: 'fixture', fixture: 'bed', x0, story: 0 }));
    const bed = s.sites[s.sites.length - 1];
    postBuildCamp(s);
    expect(runUntil(s, () => bed.build === null, 20 * 600)).toBe(true);
    expect(s.workers.some((w) => w.moodlets.some((m) => m.kind === 'scavenged'))).toBe(true);
  });

  it('builders take from a stockpile before anything lying around', () => {
    const s = createState(3);
    const x0 = withHouse(s, 6);
    s.notices = [];
    s.reserved = 0;
    const gy = groundRow();
    for (let i = 0; i < 4; i++) s.items.push({ id: s.nextId++, type: 'wood', x: x0 - 3 - i, y: gy, reservedBy: null });
    const loose = s.items.filter((it) => it.type === 'wood').length;
    applyCommand(s, place({ what: 'fixture', fixture: 'bed', x0, story: 0 }));
    const bed = s.sites[s.sites.length - 1];
    postBuildCamp(s);
    expect(runUntil(s, () => bed.build === null, 20 * 600)).toBe(true);
    expect(s.items.filter((it) => it.type === 'wood').length).toBe(loose);
    expect(s.workers.some((w) => w.moodlets.some((m) => m.kind === 'scavenged'))).toBe(false);
  });
});

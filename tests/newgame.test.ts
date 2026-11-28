import { describe, expect, it } from 'vitest';
import { createState, hashState, replay, Sim, step } from '../src/sim/sim';
import { clampSettings, gameSettings, presetKnobs } from '../src/sim/settings';
import { driftLine, driftPool, driftRate, langFromFloor, updateDrift } from '../src/sim/drift';
import { makeSave, readSave } from '../src/sim/save';
import { findPath } from '../src/sim/path';
import { recruitFee } from '../src/sim/recruit';
import { currentStipend, refillStores } from '../src/sim/patron';
import { deckRow, standRow } from '../src/sim/tower';
import { groundRow, sitesOf, towerRoom } from '../src/sim/world';
import { ARRIVALS, DRIFT, NEW_GAME, PATRON, POPULATION, QUIT, TIME, TOWER, mapHeight, towerRoomFor, type Difficulty } from '../src/sim/tuning';
import type { Command } from '../src/sim/commands';
import type { SimState } from '../src/sim/types';

const run = (s: SimState, n: number) => {
  for (let i = 0; i < n; i++) step(s);
};

describe('§16.9 step 8: game settings', () => {
  it('createState(seed) is still the game it always was: Medium, the small camp, a goal of 30', () => {
    const s = createState(4);
    expect(s.settings).toEqual(gameSettings('normal', 'prebuilt'));
    expect(s.settings.goal).toBe(TOWER.goal);
    expect(s.settings.patienceDrain).toBe(PATRON.patienceDrain.normal);
    expect(s.settings.noticeShifts).toBe(QUIT.noticeShifts.normal);
    expect(s.settings.arrivalEvery).toBe(ARRIVALS.every.normal);
    expect(s.workers.length).toBe(POPULATION.start);
    expect(s.gold).toBe(400);
  });

  it('each preset takes its numbers from the tuning tables, exactly', () => {
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const k = presetKnobs(d);
      expect(k.patienceDrain).toBe(PATRON.patienceDrain[d]);
      expect(k.noticeShifts).toBe(QUIT.noticeShifts[d]);
      expect(k.arrivalEvery).toBe(ARRIVALS.every[d]);
      // a preset passes through the limits untouched
      expect(gameSettings(d)).toEqual({ difficulty: d, goal: TOWER.goal, start: 'prebuilt', ...k });
    }
    // custom starts from Medium; the sandbox from Easy, rich and with full stores
    expect(gameSettings('custom').patienceDrain).toBe(PATRON.patienceDrain.normal);
    const sb = gameSettings('sandbox');
    expect(sb.patienceDrain).toBe(PATRON.patienceDrain.easy);
    expect(sb.fullStores).toBe(true);
    expect(sb.gold).toBe(NEW_GAME.sandbox.gold);
  });

  it('custom knobs are kept within the New Game limits', () => {
    const g = clampSettings({ ...gameSettings('custom'), workers: 99, quitBelow: -5, supplies: 1.5, noticeShifts: 2.6, patienceDrain: 1, arrivalEvery: -3, goal: 5000, towerLevels: 9999 });
    expect(g.workers).toBe(30);
    expect(g.quitBelow).toBe(0);
    expect(g.supplies).toBe(1.5);
    expect(g.noticeShifts).toBe(3);
    expect(g.patienceDrain).toBe(NEW_GAME.limits.patiencePerDay[1] / TIME.dayTicks);
    expect(g.arrivalEvery).toBe(0);
    expect(g.goal).toBe(1000);
    expect(g.towerLevels).toBe(1000);
    // no tower to build on at the opening
    expect(clampSettings({ ...gameSettings('sandbox', 'opening'), towerLevels: 5 }).towerLevels).toBe(0);
  });

  it('every knob reaches the game', () => {
    const g = gameSettings('custom', 'prebuilt', { stipend: 1000, quitBelow: 45, noticeShifts: 6, gold: 1234, recruitFee: 2, workers: 3, supplies: 2, arrivalEvery: 0 });
    const s = createState(5, g);
    expect(s.workers.length).toBe(3);
    expect(s.gold).toBe(1234);
    expect(currentStipend(s)).toBe(1000);
    expect(recruitFee(s)).toBe(2 * 4 * 4);
    expect(sitesOf(s, 'pantry')[0].store.bread).toBe(20); // 16 × 2, but a pantry holds 20
    expect(sitesOf(s, 'stockpile')[1].store.wood).toBe(16);
    // the quit line: at 40, fed up below 45 but not below the usual 30
    const w = s.workers[1];
    w.mood = 40;
    step(s);
    expect(w.fedUpSince).not.toBeNull();
    const usual = createState(5);
    usual.workers[1].mood = 40;
    step(usual);
    expect(usual.workers[1].fedUpSince).toBeNull();
    // six shifts' notice
    w.moodlets.push({ kind: 'test', label: 'Miserable', value: -60, until: 1e9 });
    w.mood = 10;
    for (let i = 0; i < TIME.dayTicks && w.noticeUntil === null; i++) step(s);
    expect(w.noticeUntil).not.toBeNull();
    expect(w.noticeUntil! - (s.tick - 1)).toBe(6 * (TIME.dayTicks / 4));
    // no arrivals, ever
    s.floors = 5;
    run(s, ARRIVALS.every.easy * 2);
    expect(s.workers.length).toBe(3);
  });

  it('the opening with no starting supplies has an empty patron’s pile', () => {
    const s = createState(6, gameSettings('custom', 'opening', { supplies: 0 }));
    const pile = s.sites.find((x) => x.supplies)!;
    expect(Object.values(pile.store).every((n) => n === 0)).toBe(true);
  });

  it('the same seed and settings and commands give the same game', () => {
    const g = gameSettings('custom', 'large', { goal: 100, workers: 11, driftSpeed: 2.5, stipend: 77 });
    const cmd: Command = { type: 'compose', playerId: 0, lines: [{ verb: 'MINE', noun: 'STONE', count: 5 }], wage: 2, dest: { kind: 'board', addressee: null } };
    const a = new Sim(31, g);
    const b = new Sim(31, g);
    a.enqueue(cmd);
    b.enqueue(cmd);
    for (let i = 0; i < 1500; i++) {
      a.step();
      b.step();
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(replay(31, a.history, 1500, g))).toBe(hashState(a.state));
    // and a different setting is a different game
    expect(hashState(createState(31, { ...g, stipend: 78 }))).not.toBe(hashState(createState(31, g)));
  });
});

describe('§16.9 step 8: the map follows the goal', () => {
  it('each goal gets a map with room for it and a little more', () => {
    for (const { levels } of NEW_GAME.goals) {
      const s = createState(7, gameSettings('normal', 'opening', { goal: levels }));
      expect(s.height).toBe(mapHeight(levels));
      expect(towerRoom(s)).toBe(towerRoomFor(levels));
      expect(towerRoom(s)).toBeGreaterThanOrEqual(levels + 3);
      expect(groundRow(s)).toBe(s.height - 17);
      // the top level the map has room for still has sky above its deck
      expect(standRow(s, towerRoom(s))).toBeGreaterThan(0);
    }
    expect(towerRoomFor(30)).toBe(33);
    expect(towerRoomFor(1000)).toBe(1100);
  });

  it('a 1,000-level game runs, paths from the ground, and saves small', () => {
    const s = createState(8, gameSettings('normal', 'prebuilt', { goal: 1000 }));
    run(s, 600);
    const board = s.sites.find((x) => x.kind === 'board')!;
    expect(findPath(s, { x: 10, y: groundRow(s) }, { x: board.x0, y: groundRow(s) })).not.toBeNull();
    const text = JSON.stringify(makeSave(s, 'Tall', ''));
    expect(text.length).toBeLessThan(200_000);
    const r = readSave(text);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.tiles.length).toBe(s.tiles.length);
    expect(hashState(r.state)).toBe(hashState(s));
  });
});

describe('§16.9 step 8: drift scales with the goal', () => {
  it('against a goal of 30 it is what it was: from level 3 at 0.08, 0.03 more a level, 0.89 at the top', () => {
    const s = createState(9);
    expect(driftLine(s)).toBe(3);
    expect(langFromFloor(s, 'fr')).toBe(3);
    expect(langFromFloor(s, 'el')).toBe(5);
    expect(driftRate(s, 2)).toBe(0);
    for (let level = 3; level <= 30; level++) expect(driftRate(s, level)).toBeCloseTo(0.08 + (level - 3) * 0.03, 12);
    // and no faster above the goal
    expect(driftRate(s, 33)).toBe(driftRate(s, 30));
  });

  it('starts at a tenth of the goal and tops out at the goal, for every goal', () => {
    for (const { levels } of NEW_GAME.goals) {
      const s = createState(9, gameSettings('normal', 'opening', { goal: levels }));
      const line = driftLine(s);
      expect(line).toBe(Math.max(1, Math.round(levels / 10)));
      expect(driftRate(s, line - 1)).toBe(0);
      expect(driftRate(s, line)).toBeCloseTo(DRIFT.rate, 12);
      expect(driftRate(s, levels)).toBeCloseTo(DRIFT.rateAtGoal, 12);
      expect(driftRate(s, levels + 50)).toBeCloseTo(DRIFT.rateAtGoal, 12);
      const fr = langFromFloor(s, 'fr');
      const el = langFromFloor(s, 'el');
      expect(fr).toBe(line);
      expect(el).toBeGreaterThan(fr);
      expect(Math.abs(el - levels / 6)).toBeLessThanOrEqual(1);
    }
    const huge = createState(9, gameSettings('normal', 'opening', { goal: 1000 }));
    expect([driftLine(huge), langFromFloor(huge, 'fr'), langFromFloor(huge, 'el')]).toEqual([100, 100, 167]);
  });

  it('nothing drifts in a 100-level game until the tower is ten tall', () => {
    const s = createState(9, gameSettings('normal', 'prebuilt', { goal: 100 }));
    s.floors = 9;
    expect(driftPool(s)).toEqual([]);
    s.floors = 10;
    expect(driftPool(s)).toEqual(['fr']);
    s.floors = 17;
    expect(driftPool(s)).toEqual(['fr', 'el']);
  });

  it('drift speed scales it, and 0 turns it off', () => {
    const fast = createState(9, gameSettings('custom', 'prebuilt', { driftSpeed: 2 }));
    const normal = createState(9);
    expect(driftRate(fast, 10)).toBeCloseTo(driftRate(normal, 10) * 2, 12);
    const none = createState(9, gameSettings('custom', 'prebuilt', { driftSpeed: 0 }));
    none.floors = 10;
    const w = none.workers[2];
    w.x = none.tower!.x0 + 5;
    w.y = standRow(none, 8);
    for (let i = 0; i < 3000; i++) updateDrift(none, w);
    expect(w.exposure).toBe(0);
    expect(w.driftTongue).toBeNull();
  });
});

describe('§16.9 step 8: the sandbox', () => {
  it('builds the tower to the chosen level, with a ladder up from every level, and nothing owed for it', () => {
    const s = createState(10, gameSettings('sandbox', 'prebuilt', { towerLevels: 6, goal: 20 }));
    expect(s.floors).toBe(6);
    expect(s.projects).toEqual([]);
    const ladders = sitesOf(s, 'ladder');
    expect(ladders.map((l) => l.level).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s.gold).toBe(NEW_GAME.sandbox.gold);
    expect(s.patience).toBe(PATRON.patienceStart);
    expect(s.alerts).toEqual([]);
    // a worker can walk from the ground to the roof of the top level
    const t = s.tower!;
    expect(findPath(s, { x: 40, y: groundRow(s) }, { x: t.x0 + 6, y: standRow(s, 6) })).not.toBeNull();
    expect(deckRow(s, 6)).toBe(standRow(s, 6) + 1);
  });

  it('a tall sandbox tower is quick to make', () => {
    const t0 = performance.now();
    const s = createState(10, gameSettings('sandbox', 'prebuilt', { towerLevels: 1000, goal: 1000 }));
    expect(s.floors).toBe(1000);
    expect(performance.now() - t0).toBeLessThan(5000);
  });

  it('keeps every store full', () => {
    const s = createState(11, gameSettings('sandbox', 'prebuilt'));
    run(s, 1);
    const pantry = sitesOf(s, 'pantry')[0];
    const pile = sitesOf(s, 'stockpile')[0];
    pantry.store.bread = 0;
    pile.store.stone = 0;
    pile.store.wood = 0;
    while (s.tick % NEW_GAME.sandbox.refillTicks !== 0) step(s);
    step(s);
    expect(pantry.store.bread).toBe(pantry.capacity);
    // a third of the room each, as far as it goes: the grain already there takes its share
    expect(pile.store.stone).toBe(8);
    expect(pile.store.stone + pile.store.wood + pile.store.grain).toBe(pile.capacity);
    // a normal game doesn't
    const n = createState(11);
    sitesOf(n, 'pantry')[0].store.bread = 0;
    run(n, NEW_GAME.sandbox.refillTicks + 1);
    expect(sitesOf(n, 'pantry')[0].store.bread).toBeLessThan(20);
    // and the refill alone never overfills
    refillStores(s);
    for (const site of s.sites) if (site.capacity) expect(Object.values(site.store).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(site.capacity);
  });
});

describe('§16.9 step 8: the large camp', () => {
  it('lays out a bigger camp, all finished and stocked', () => {
    const s = createState(12, 'normal', 'large');
    expect(s.settings.start).toBe('large');
    expect(s.buildings.filter((b) => b.kind === 'house').map((b) => b.name)).toEqual(['Kitchen', 'Bunkhouse', 'Tavern', 'Storehouse', 'Bunkhouse 2']);
    expect(s.buildings.every((b) => b.build === null)).toBe(true);
    expect(s.sites.every((x) => x.build === null)).toBe(true);
    expect(sitesOf(s, 'bed').length).toBe(17);
    expect(sitesOf(s, 'bed').filter((b) => b.y < groundRow(s)).length).toBe(5); // upstairs in Bunkhouse 2
    expect(sitesOf(s, 'oven').length).toBe(2);
    expect(sitesOf(s, 'bar').length).toBe(2);
    expect(sitesOf(s, 'pantry').length).toBe(2);
    expect(sitesOf(s, 'shelves').length).toBe(5);
    expect(sitesOf(s, 'wheelbarrow').length).toBe(1);
    expect(sitesOf(s, 'cart').length).toBe(1);
    expect(s.tower).not.toBeNull();
    expect(s.floors).toBe(0);
    expect(s.charter).toBe(true);
    const total = (k: 'stone' | 'wood' | 'grain' | 'bread' | 'beer') => s.sites.reduce((n, x) => n + x.store[k], 0);
    expect([total('stone'), total('wood'), total('grain'), total('bread'), total('beer')]).toEqual([42, 46, 42, 32, 24]);
  });

  it('runs a day without getting stuck, and the workers use it', () => {
    const s = createState(12, gameSettings('normal', 'large', { workers: 12 }));
    run(s, TIME.dayTicks);
    expect(s.workers.length).toBeGreaterThanOrEqual(12);
    expect(s.workers.some((w) => w.jobsDone > 0)).toBe(true);
    // someone slept upstairs in Bunkhouse 2, or at least can get there
    const upstairs = sitesOf(s, 'bed').find((b) => b.y < groundRow(s))!;
    expect(findPath(s, { x: 40, y: groundRow(s) }, { x: upstairs.x0, y: upstairs.y })).not.toBeNull();
  });
});

describe('§16.9 step 8: saves from before the New Game screen', () => {
  it('a version 12 save loads with the settings it was played with', () => {
    for (const [d, start] of [['hard', 'opening'], ['easy', 'prebuilt'], ['normal', 'prebuilt']] as const) {
      const s = createState(13, d, start);
      run(s, 200);
      // make it look as it did at version 12: the difficulty, start and goal at the top, no settings
      const save = makeSave(s, 'Old', '') as unknown as { state: Record<string, unknown> };
      const st = save.state;
      st.version = 12;
      st.difficulty = d;
      st.start = start;
      st.goal = 30;
      delete st.settings;
      const r = readSave(JSON.stringify(save));
      if (!r.ok) throw new Error(r.error);
      expect(r.filled).toEqual([]);
      expect(r.state.version).toBe(13);
      expect(r.state.settings).toEqual(gameSettings(d, start));
      expect('difficulty' in r.state || 'start' in r.state || 'goal' in r.state).toBe(false);
      expect(hashState(r.state)).toBe(hashState(s));
      // and it plays on as the same game
      run(s, 300);
      run(r.state, 300);
      expect(hashState(r.state)).toBe(hashState(s));
    }
  });

  it('a version 12 save made on the old 30-level map keeps its map', () => {
    const s = createState(14);
    const save = makeSave(s, 'Old', '') as unknown as { state: Record<string, unknown> };
    // the old map: 144 rows (30 levels of room), the same ground under it
    const st = save.state;
    st.version = 12;
    st.difficulty = 'normal';
    st.start = 'prebuilt';
    st.goal = 30;
    delete st.settings;
    const rows = (s.height - 144) * s.width;
    const tiles = s.tiles.slice(rows);
    st.height = 144;
    st.tilesRle = tiles.map(String).join(',');
    for (const key of ['workers', 'sites', 'items'] as const) for (const o of st[key] as { y: number }[]) o.y -= s.height - 144;
    const r = readSave(save);
    if (!r.ok) throw new Error(r.error);
    expect(towerRoom(r.state)).toBe(30);
    expect(groundRow(r.state)).toBe(127);
    run(r.state, 600);
    expect(r.state.workers.every((w) => w.y <= groundRow(r.state))).toBe(true);
  });
});

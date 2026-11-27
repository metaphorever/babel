import { describe, expect, it } from 'vitest';
import { decodeTiles, encodeTiles, makeSave, readSave, SAVE_FORMAT } from '../src/sim/save';
import { createState, Sim } from '../src/sim/sim';
import { TIME } from '../src/sim/tuning';

const run = (sim: Sim, n: number) => {
  for (let i = 0; i < n; i++) sim.step();
};

describe('§16.9 step 7: saves', () => {
  it('tiles run-length encode and decode exactly, and small', () => {
    const s = createState(3);
    const text = encodeTiles(s.tiles);
    expect(decodeTiles(text)).toEqual(s.tiles);
    expect(text.length).toBeLessThan(JSON.stringify(s.tiles).length / 4);
    expect(decodeTiles('')).toEqual([]);
    expect(decodeTiles('1*0')).toBeNull();
    expect(decodeTiles('x')).toBeNull();
  });

  it('a loaded game carries on exactly as the one it was saved from', () => {
    for (const start of ['prebuilt', 'opening'] as const) {
      const sim = new Sim(21, 'hard', start);
      run(sim, TIME.dayTicks / 2);
      const text = JSON.stringify(makeSave(sim.state, 'Test', '2026-11-27T00:00:00Z', { alertsSeen: [1, 2], tutorial: 3 }));
      const r = readSave(text);
      if (!r.ok) throw new Error(r.error);
      expect(r.filled).toEqual([]);
      expect(r.save.name).toBe('Test');
      expect(r.save.ui).toEqual({ alertsSeen: [1, 2], tutorial: 3 });
      expect(JSON.stringify(r.state)).toBe(JSON.stringify(sim.state));
      const loaded = Sim.fromState(r.state);
      run(sim, 600);
      run(loaded, 600);
      expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(sim.state));
    }
  });

  it('a save is a snapshot: playing on does not change it', () => {
    const sim = new Sim(4, 'normal', 'prebuilt');
    const save = makeSave(sim.state, 'Before', '');
    const gold = save.state.gold;
    run(sim, 300);
    sim.state.gold += 999;
    expect(save.state.gold).toBe(gold);
    expect(save.summary.day).toBe(1);
  });

  it('turns away what is not a save, a damaged one, or one from a newer game', () => {
    const good = makeSave(createState(8), 'Ok', '');
    expect(readSave('not json').ok).toBe(false);
    expect(readSave('{"hello":1}').ok).toBe(false);
    expect(readSave({ ...good, format: 'other' }).ok).toBe(false);
    expect(readSave({ ...good, saveVersion: 99 }).ok).toBe(false);
    expect(readSave({ ...good, state: { ...good.state, version: 99 } }).ok).toBe(false);
    expect(readSave({ ...good, state: { ...good.state, version: 3 } }).ok).toBe(false);
    expect(readSave({ ...good, state: { ...good.state, tilesRle: '0*5' } }).ok).toBe(false);
    expect(readSave({ ...good, state: { ...good.state, workers: undefined } }).ok).toBe(false);
    expect(good.format).toBe(SAVE_FORMAT);
  });

  it('fills fields an older save never had from a new game of the same seed', () => {
    const s = createState(9);
    const save = makeSave(s, 'Old', '') as unknown as { state: Record<string, unknown> };
    delete save.state.alertBelow;
    delete save.state.wagesQuietUntil;
    const r = readSave(save);
    if (!r.ok) throw new Error(r.error);
    expect(r.filled.sort()).toEqual(['alertBelow', 'wagesQuietUntil']);
    expect(r.state.alertBelow.bread).toBe(s.alertBelow.bread);
  });
});

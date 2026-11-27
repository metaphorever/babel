import { createState, STATE_VERSION } from './sim';
import { dayOf } from './time';
import type { SimState } from './types';

// Saves (§16.9 step 7). The game state is plain data, so a save is a
// snapshot of it, wrapped with what the save list shows. Pure, like the rest
// of the sim: the browser side (slots, files) is in src/ui/saves.ts.
//
// When SimState changes shape, bump its `version` and add a step to
// MIGRATIONS that brings the version before it up to date. Fields missing
// from an old save are also filled from a new game of the same seed, which
// covers plain additions at the top level.

export const SAVE_FORMAT = 'babel-save';
/** The wrapper's own version (not the state's). */
export const SAVE_VERSION = 1;

/** What a save list shows without reading the whole state. */
export interface SaveSummary {
  day: number;
  floors: number;
  workers: number;
  gold: number;
  difficulty: SimState['difficulty'];
}

/** The interface's part of a game: kept with the save, never read by the sim. */
export interface SaveUi {
  /** Alerts already shown, so a loaded game doesn't show them again. */
  alertsSeen?: number[];
  /** The tutorial step (-1: not running). */
  tutorial?: number;
  /** Where the view was, in world pixels, and the zoom. */
  camera?: { x: number; y: number; zoom: number };
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  saveVersion: number;
  /** The player's name for it. */
  name: string;
  /** When it was saved, in the real world (ISO), passed in by the interface. */
  savedAt: string;
  summary: SaveSummary;
  ui: SaveUi;
  /** The state, with `tiles` run-length encoded in `tilesRle` (the map is most of a save). */
  state: Omit<SimState, 'tiles'> & { tiles: []; tilesRle: string };
}

export function saveSummary(s: SimState): SaveSummary {
  return { day: dayOf(s.tick), floors: s.floors, workers: s.workers.filter((w) => !w.leaving).length, gold: s.gold, difficulty: s.difficulty };
}

/** Tiles as "value*run" pairs: "0*4210,3*192,…". */
export function encodeTiles(tiles: readonly number[]): string {
  const out: string[] = [];
  for (let i = 0; i < tiles.length; ) {
    let j = i + 1;
    while (j < tiles.length && tiles[j] === tiles[i]) j++;
    out.push(j - i === 1 ? String(tiles[i]) : `${tiles[i]}*${j - i}`);
    i = j;
  }
  return out.join(',');
}

export function decodeTiles(text: string): number[] | null {
  const tiles: number[] = [];
  if (text === '') return tiles;
  for (const part of text.split(',')) {
    const [v, n] = part.split('*');
    const value = Number(v);
    const run = n === undefined ? 1 : Number(n);
    if (!Number.isInteger(value) || !Number.isInteger(run) || run < 1) return null;
    for (let k = 0; k < run; k++) tiles.push(value);
  }
  return tiles;
}

/** A snapshot of the game, ready to be written out as JSON. */
export function makeSave(s: SimState, name: string, savedAt: string, ui: SaveUi = {}): SaveFile {
  const copy = JSON.parse(JSON.stringify(s)) as SimState;
  const tilesRle = encodeTiles(copy.tiles);
  const state = { ...copy, tiles: [] as [], tilesRle };
  return { format: SAVE_FORMAT, saveVersion: SAVE_VERSION, name, savedAt, summary: saveSummary(s), ui, state };
}

/** One step per SimState version: MIGRATIONS[n] brings a version-n state up to n + 1. */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => void> = {};

/** The oldest state version a save can be brought up from. */
export const OLDEST_STATE_VERSION = 12;

export type ReadResult = { ok: true; save: SaveFile; state: SimState; filled: string[] } | { ok: false; error: string };

/** Read a save (as text or parsed), check it, bring it up to date, and unpack the state. */
export function readSave(input: string | unknown): ReadResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, error: 'That isn’t a Babel save: it can’t be read.' };
    }
  }
  const f = raw as Partial<SaveFile> | null;
  if (!f || typeof f !== 'object' || f.format !== SAVE_FORMAT || !f.state || typeof f.state !== 'object') return { ok: false, error: 'That isn’t a Babel save.' };
  if (typeof f.saveVersion !== 'number' || f.saveVersion > SAVE_VERSION) return { ok: false, error: 'That save is from a newer version of Babel. Reload the page to get the latest.' };
  const st = JSON.parse(JSON.stringify(f.state)) as Record<string, unknown>;
  const current: number = STATE_VERSION;
  let v = st.version;
  if (typeof v !== 'number') return { ok: false, error: 'That save is damaged: it has no version.' };
  if (v > current) return { ok: false, error: 'That save is from a newer version of Babel. Reload the page to get the latest.' };
  if (v < OLDEST_STATE_VERSION) return { ok: false, error: 'That save is from an older version of Babel that can’t be loaded any more.' };
  while (v < current) {
    MIGRATIONS[v]?.(st);
    v++;
  }
  st.version = current;
  // the map
  const tiles = typeof st.tilesRle === 'string' ? decodeTiles(st.tilesRle) : Array.isArray(st.tiles) ? (st.tiles as number[]) : null;
  delete st.tilesRle;
  if (!tiles || typeof st.width !== 'number' || typeof st.height !== 'number' || tiles.length !== st.width * st.height) return { ok: false, error: 'That save is damaged: its map doesn’t add up.' };
  st.tiles = tiles;
  for (const key of ['workers', 'sites', 'buildings', 'items', 'alerts', 'events']) if (!Array.isArray(st[key])) return { ok: false, error: `That save is damaged: it has no ${key}.` };
  if (typeof st.seed !== 'number' || typeof st.tick !== 'number') return { ok: false, error: 'That save is damaged.' };
  // anything newer than the save, from a fresh game of the same seed
  const fresh = createState(st.seed, (st.difficulty as SimState['difficulty']) ?? 'normal', (st.start as SimState['start']) ?? 'prebuilt') as unknown as Record<string, unknown>;
  const filled: string[] = [];
  for (const k of Object.keys(fresh)) {
    if (!(k in st)) {
      st[k] = fresh[k];
      filled.push(k);
    }
  }
  const state = st as unknown as SimState;
  const save: SaveFile = {
    format: SAVE_FORMAT,
    saveVersion: SAVE_VERSION,
    name: typeof f.name === 'string' && f.name.trim() ? f.name.trim().slice(0, 60) : 'Untitled',
    savedAt: typeof f.savedAt === 'string' ? f.savedAt : '',
    summary: saveSummary(state),
    ui: f.ui && typeof f.ui === 'object' ? f.ui : {},
    state: f.state as SaveFile['state'],
  };
  return { ok: true, save, state, filled };
}

import type { LangId } from '../sim';

// The player's settings (§16.9 step 9): theirs, not the world's, so they're
// kept in this browser (localStorage), never in a game or a save.

export interface Prefs {
  /** The language the scriptorium starts new orders in, once you can write in it. */
  writeLang: LangId;
  /** Sound levels, 0..100. Babel has no sound yet: kept for when it does. */
  effects: number;
  music: number;
  /** The interface's size: 1, 1.25, 1.5 or 2. */
  uiScale: number;
  /** No scrambling title, no drifting clouds. */
  reduceMotion: boolean;
}

export const UI_SCALES = [1, 1.25, 1.5, 2] as const;

const KEY = 'babel.prefs';

/** Fired on the window when a setting changes. */
export const PREFS_EVENT = 'babel-prefs';

/** What a new player gets: reduce motion follows the system's own setting until they change it. */
function defaults(): Prefs {
  let reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // no media queries: leave it off
  }
  return { writeLang: 'en', effects: 70, music: 50, uiScale: 1, reduceMotion: reduce };
}

let current: Prefs | null = null;

export function prefs(): Prefs {
  if (current) return current;
  const d = defaults();
  let saved: Partial<Prefs> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  const level = (v: unknown, fallback: number) => (typeof v === 'number' && v >= 0 && v <= 100 ? Math.round(v) : fallback);
  current = {
    writeLang: saved.writeLang === 'en' || saved.writeLang === 'fr' || saved.writeLang === 'el' ? saved.writeLang : d.writeLang,
    effects: level(saved.effects, d.effects),
    music: level(saved.music, d.music),
    uiScale: (UI_SCALES as readonly number[]).includes(saved.uiScale as number) ? (saved.uiScale as number) : d.uiScale,
    reduceMotion: typeof saved.reduceMotion === 'boolean' ? saved.reduceMotion : d.reduceMotion,
  };
  return current;
}

export function setPrefs(change: Partial<Prefs>): void {
  current = { ...prefs(), ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // a browser that won't keep it: it still holds for this visit
  }
  applyPrefs();
  window.dispatchEvent(new Event(PREFS_EVENT));
}

/** The interface's size, for code that measures windows against the screen. */
export function uiScale(): number {
  return prefs().uiScale;
}

/** Put the settings that show on the page into effect. */
export function applyPrefs(): void {
  const ui = document.getElementById('ui');
  if (ui) ui.style.setProperty('zoom', String(prefs().uiScale));
  document.documentElement.style.setProperty('--ui-scale', String(prefs().uiScale));
}

import { FOREVER, createState, gameSettings, makeOrder, type GameSettings, type SimState } from '../sim';
import { applyPlace, campJobs, finishNow } from '../sim/build';
import { pinNotice } from '../sim/carriers';
import { newProject, placeMaterial } from '../sim/tower';

// The title screen's colony and words (§16.9 step 9), apart from the page so
// the tests can run them: the showcase colony that runs behind the menu, and
// the scramble from one "Welcome" to the next.

/** "Welcome", in the game's three languages first, then others. Kept to scripts the browser draws well at 13 px. */
export const WELCOMES = ['Welcome', 'Bienvenue', 'Καλώς ήρθατε', 'Willkommen', 'Benvenuti', 'Bienvenidos', 'Welkom', 'Добро пожаловать', 'ברוכים הבאים', 'Salvete'];

/** Letters to scramble through: Latin, Greek, Cyrillic and Hebrew. */
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψωБГДЖЗИЛПФЦЧШЩЭЮЯбвгджзклмнптфцчшюяאבגדהוזחטיכלמנסעפצקרשת';

/**
 * The showcase colony's settings: the large camp, a sandbox's full stores,
 * the tower built to Level 9, nobody quitting or leaving, no newcomers. Its
 * seed is fixed, so it's the same colony every time.
 */
const SHOWCASE = { seed: 11, levels: 9, maxLevels: 16, workers: 14 };

export function showcaseSettings(): GameSettings {
  return gameSettings('custom', 'large', {
    goal: 20,
    towerLevels: SHOWCASE.levels,
    fullStores: true,
    quitBelow: 0,
    patienceDrain: 0,
    arrivalEvery: 0,
    workers: SHOWCASE.workers,
    gold: 5000,
  });
}

/** The showcase colony: its camp and tower, builders on the next level (already a third done), and the usual work. */
export function showcaseState(): SimState {
  const s = createState(SHOWCASE.seed, showcaseSettings());
  pinNotice(s, makeOrder('BUILD', 'TOWER'), FOREVER, 2, null);
  for (const [verb, noun] of [['MINE', 'STONE'], ['CHOP', 'WOOD'], ['HARVEST', 'GRAIN'], ['COOK', 'BREAD'], ['BREW', 'BEER']] as const) pinNotice(s, makeOrder(verb, noun), FOREVER, 1, null);
  const p = newProject(s, s.floors + 1);
  s.projects.push(p);
  for (let i = 0; i < 4; i++) placeMaterial(s, p, 'stone');
  return s;
}

/** Keep the showcase's tower going up: once a level is done, a ladder onto it and the next one planned, up to maxLevels. */
export function keepBuilding(s: SimState): void {
  if (s.projects.length > 0 || s.floors >= SHOWCASE.maxLevels || !s.tower) return;
  const k = s.floors - 1;
  applyPlace(s, { what: 'fixture', fixture: 'ladder', x0: k % 2 === 0 ? s.tower.x0 + 2 : s.tower.x1 - 3, story: k });
  for (const j of campJobs(s)) if (!j.demolish) finishNow(s, j);
  s.projects.push(newProject(s, s.floors + 1));
}

/** One step of the scramble from one word to the next: settled letters from the left, the rest any letter. */
export function scrambled(from: string, to: string, t: number, rand: () => number): string {
  const a = [...from];
  const b = [...to];
  const n = Math.max(a.length, b.length);
  let out = '';
  for (let i = 0; i < n; i++) {
    const settle = 0.25 + (0.7 * i) / n;
    if (t >= settle) out += b[i] ?? '';
    else if (t < 0.12) out += a[i] ?? '';
    else out += SCRAMBLE[Math.floor(rand() * SCRAMBLE.length)];
  }
  return out;
}

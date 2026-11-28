import { ARRIVALS, ECONOMY, NEW_GAME, PATRON, POPULATION, QUIT, RECRUIT, TIME, TOWER, towerRoomFor, type Difficulty, type DifficultyChoice } from './tuning';
import type { GameSettings, StartMode } from './types';

// The settings a game is made with (§16.9 step 8): the New Game screen's
// difficulty, goal and starting camp, and the knobs a difficulty sets. They
// live in the state (`s.settings`), so saves carry them and a replay from the
// seed and the settings gives the same game.

const PRESETS: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export function isPreset(d: unknown): d is Difficulty {
  return (PRESETS as readonly unknown[]).includes(d);
}

/** A preset's knobs. Medium ('normal') is the game as it was before the New Game screen. */
export function presetKnobs(d: Difficulty): Omit<GameSettings, 'difficulty' | 'goal' | 'start'> {
  return {
    stipend: PATRON.stipendPerDay,
    patienceDrain: PATRON.patienceDrain[d],
    quitBelow: QUIT.lowMood,
    noticeShifts: QUIT.noticeShifts[d],
    supplies: 1,
    gold: ECONOMY.startingGold,
    arrivalEvery: ARRIVALS.every[d],
    recruitFee: RECRUIT.perSquare,
    driftSpeed: 1,
    workers: POPULATION.start,
    fullStores: false,
    towerLevels: 0,
  };
}

/**
 * Settings for a new game: a difficulty's knobs (Custom starts from Medium's,
 * the sandbox from Easy's with plenty of gold and full stores), then anything
 * in `more`, kept within the New Game screen's limits.
 */
export function gameSettings(difficulty: DifficultyChoice = 'normal', start: StartMode = 'prebuilt', more: Partial<GameSettings> = {}): GameSettings {
  const base = difficulty === 'custom' ? 'normal' : difficulty === 'sandbox' ? 'easy' : difficulty;
  const g: GameSettings = { difficulty, goal: TOWER.goal, start, ...presetKnobs(base) };
  if (difficulty === 'sandbox') {
    g.gold = NEW_GAME.sandbox.gold;
    g.fullStores = true;
  }
  return clampSettings({ ...g, ...more });
}

/** Every knob within its limits, whole numbers where they have to be. */
export function clampSettings(g: GameSettings): GameSettings {
  const L = NEW_GAME.limits;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const clamp = (v: unknown, [lo, hi]: [number, number], fallback: number, whole = true) => {
    const n = Math.min(hi, Math.max(lo, num(v, fallback)));
    return whole ? Math.round(n) : n;
  };
  const d = presetKnobs('normal');
  const goal = clamp(g.goal, [1, 1000], TOWER.goal);
  // kept per tick and in ticks, as the preset tables have them, so a preset's value passes through exactly
  const day = TIME.dayTicks;
  const drain = Math.min(L.patiencePerDay[1] / day, Math.max(L.patiencePerDay[0] / day, num(g.patienceDrain, d.patienceDrain)));
  const arrivals = Math.round(Math.min(L.arrivalHours[1] * ticksPerHour(), Math.max(0, num(g.arrivalEvery, d.arrivalEvery))));
  return {
    difficulty: g.difficulty,
    goal,
    start: g.start === 'opening' || g.start === 'large' ? g.start : 'prebuilt',
    stipend: clamp(g.stipend, L.stipend, d.stipend),
    patienceDrain: drain,
    quitBelow: clamp(g.quitBelow, L.quitBelow, d.quitBelow),
    noticeShifts: clamp(g.noticeShifts, L.noticeShifts, d.noticeShifts),
    supplies: clamp(g.supplies, L.supplies, 1, false),
    gold: clamp(g.gold, L.gold, d.gold),
    arrivalEvery: arrivals,
    recruitFee: clamp(g.recruitFee, L.recruitFee, d.recruitFee),
    driftSpeed: clamp(g.driftSpeed, L.driftSpeed, 1, false),
    workers: clamp(g.workers, L.workers, d.workers),
    fullStores: g.fullStores === true,
    towerLevels: g.start === 'opening' ? 0 : clamp(g.towerLevels, [0, goal], 0),
  };
}

export function ticksPerHour(): number {
  return TIME.dayTicks / 24;
}

/** Levels of tower the map for these settings has room for. */
export function settingsRoom(g: GameSettings): number {
  return towerRoomFor(g.goal);
}

const DIFFICULTY_LABEL: Record<DifficultyChoice, string> = { easy: 'Easy', normal: 'Medium', hard: 'Hard', custom: 'Custom', sandbox: 'Sandbox' };

export function difficultyLabel(d: DifficultyChoice): string {
  return DIFFICULTY_LABEL[d] ?? String(d);
}

const START_LABEL: Record<StartMode, string> = { opening: 'Nothing', prebuilt: 'Small', large: 'Large' };

export function startLabel(m: StartMode): string {
  return START_LABEL[m] ?? String(m);
}

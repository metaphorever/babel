import { NEW_GAME, TIME, driftLine, floorName, gameSettings, goldText, isPreset, levelName, ticksPerHour, type DifficultyChoice, type GameSettings, type SimState, type StartMode } from '../sim';
import { clear, h } from './dom';

// The New Game screen (§16.9 step 8): a System 7 dialog over the title
// screen's colony (step 9), before any game exists. Difficulty, the patron's
// goal, the starting camp, every knob a difficulty sets, and the sandbox's
// extras. Cancel goes back to the title.

const DIFFICULTIES: { id: DifficultyChoice; label: string; text: string }[] = [
  { id: 'easy', label: 'Easy', text: 'A patient patron, a whole day’s notice before anyone quits, and newcomers often.' },
  { id: 'normal', label: 'Medium', text: 'The patron’s patience wears at a steady pace; two shifts’ notice.' },
  { id: 'hard', label: 'Hard', text: 'An impatient patron, a single shift’s notice, and newcomers seldom.' },
  { id: 'custom', label: 'Custom', text: 'Every knob below is yours to set.' },
  { id: 'sandbox', label: 'Sandbox', text: 'Stores the patron keeps full, gold to spare, and a tower already as tall as you like.' },
];

const CAMPS: { id: StartMode; label: string; text: string }[] = [
  { id: 'opening', label: 'Nothing', text: 'Your workers at the roadside with the patron’s supplies. You choose where everything goes, with a guide to start you off.' },
  { id: 'prebuilt', label: 'Small', text: 'A working camp: a kitchen, a bunkhouse, the scriptorium, two stockpiles, a tavern, and the tower’s site chosen.' },
  { id: 'large', label: 'Large', text: 'A bigger camp: two ovens, seventeen beds, two bars, a storehouse of shelves, a wheelbarrow and a cart.' },
];

interface Knob {
  key: string;
  label: string;
  unit: string;
  step: number;
  get: (g: GameSettings) => number;
  set: (g: GameSettings, v: number) => void;
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

const KNOBS: Knob[] = [
  { key: 'stipend', label: 'The patron’s stipend', unit: 'gold a day', step: 10, get: (g) => g.stipend, set: (g, v) => (g.stipend = v) },
  { key: 'patiencePerDay', label: 'The patron’s patience', unit: 'lost a day, of 100', step: 1, get: (g) => round(g.patienceDrain * TIME.dayTicks, 1), set: (g, v) => (g.patienceDrain = v / TIME.dayTicks) },
  { key: 'quitBelow', label: 'Workers are fed up', unit: 'below this mood', step: 1, get: (g) => g.quitBelow, set: (g, v) => (g.quitBelow = v) },
  { key: 'noticeShifts', label: 'Notice before quitting', unit: 'shifts (4 a day)', step: 1, get: (g) => g.noticeShifts, set: (g, v) => (g.noticeShifts = v) },
  { key: 'supplies', label: 'Starting supplies', unit: '× the usual', step: 0.5, get: (g) => g.supplies, set: (g, v) => (g.supplies = v) },
  { key: 'gold', label: 'Starting gold', unit: 'gold', step: 50, get: (g) => g.gold, set: (g, v) => (g.gold = v) },
  { key: 'arrivalHours', label: 'The patron may send a worker', unit: 'every so many hours (0: never)', step: 0.5, get: (g) => round(g.arrivalEvery / ticksPerHour(), 1), set: (g, v) => (g.arrivalEvery = Math.round(v * ticksPerHour())) },
  { key: 'recruitFee', label: 'Recruiting fee', unit: 'gold × the headcount, squared', step: 1, get: (g) => g.recruitFee, set: (g, v) => (g.recruitFee = v) },
  { key: 'driftSpeed', label: 'Drift speed', unit: '× the usual (0: none)', step: 0.25, get: (g) => g.driftSpeed, set: (g, v) => (g.driftSpeed = v) },
  { key: 'workers', label: 'Starting workers', unit: 'workers', step: 1, get: (g) => g.workers, set: (g, v) => (g.workers = v) },
];

export interface NewGameOptions {
  /** Shown at the top: why the screen is here instead of a loaded game. */
  error?: string | null;
  /** Back to the title screen. */
  cancel: () => void;
  /** Start the game. */
  start: (seed: number, settings: GameSettings) => void;
}

/** A game state is just enough to ask where drift starts for a goal. */
function lineFor(goal: number): number {
  return driftLine({ settings: { goal } } as SimState);
}

export function showNewGame(root: HTMLElement, opts: NewGameOptions): void {
  let g: GameSettings = gameSettings('normal', 'opening', { goal: NEW_GAME.defaultGoal });
  let seed = 1 + Math.floor(Math.random() * 1e9);

  const back = h('div', { class: 'modal-back' });
  const dialog = h('div', { class: 'dialog newgame', role: 'dialog', 'aria-label': 'New Game' });
  back.append(dialog);
  root.append(back);

  /** A row of radio buttons. */
  const radios = <T extends string | number>(name: string, items: { id: T; label: string }[], on: T, pick: (id: T) => void) =>
    h(
      'div',
      { class: 'radio-row' },
      ...items.map((it) => {
        const input = h('input', { type: 'radio', name, value: String(it.id), checked: it.id === on });
        input.addEventListener('change', () => pick(it.id));
        return h('label', { class: 'radio' }, input, it.label);
      }),
    );

  const add = (...children: (HTMLElement | null)[]) => dialog.append(...children.filter((c): c is HTMLElement => c !== null));
  const group = (title: string, ...children: (HTMLElement | string | null)[]) => h('fieldset', { class: 'group' }, h('legend', {}, title), ...children);

  function startGame(): void {
    back.remove();
    // the sandbox's extras only come with the sandbox
    const extras = g.difficulty === 'sandbox' ? {} : { fullStores: false, towerLevels: 0 };
    opts.start(seed, gameSettings(g.difficulty, g.start, { ...g, ...extras }));
  }

  function draw(): void {
    clear(dialog);
    const diff = DIFFICULTIES.find((d) => d.id === g.difficulty)!;
    const camp = CAMPS.find((c) => c.id === g.start)!;
    const line = lineFor(g.goal);

    // the knobs: always shown, so a preset's numbers can be read; changing one makes the game Custom (the sandbox stays the sandbox)
    const knobs = h('div', { class: 'knobs' });
    for (const k of KNOBS) {
      const [lo, hi] = NEW_GAME.limits[k.key];
      const input = h('input', { type: 'number', min: lo, max: hi, step: k.step, value: k.get(g), 'aria-label': k.label });
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return draw();
        k.set(g, Math.min(hi, Math.max(lo, v)));
        if (isPreset(g.difficulty)) g.difficulty = 'custom';
        draw();
      });
      knobs.append(h('label', { class: 'knob' }, h('span', { class: 'knob-label' }, k.label), input, h('span', { class: 'knob-unit' }, k.unit)));
    }
    const seedIn = h('input', { type: 'number', min: 1, step: 1, value: seed, 'aria-label': 'Seed', class: 'seed-in' });
    seedIn.addEventListener('change', () => {
      const v = Math.floor(Number(seedIn.value));
      if (Number.isFinite(v) && v > 0) seed = v;
      seedIn.value = String(seed);
    });
    knobs.append(
      h(
        'label',
        { class: 'knob' },
        h('span', { class: 'knob-label' }, 'Seed'),
        seedIn,
        h('button', { class: 'btn btn-small', onclick: () => ((seed = 1 + Math.floor(Math.random() * 1e9)), draw()) }, 'Another'),
      ),
    );

    let sandbox: HTMLElement | null = null;
    if (g.difficulty === 'sandbox') {
      const full = h('input', { type: 'checkbox', checked: g.fullStores });
      full.addEventListener('change', () => (g.fullStores = full.checked));
      const noCamp = g.start === 'opening';
      const levels = h('input', { type: 'number', min: 0, max: g.goal, step: 1, value: noCamp ? 0 : g.towerLevels, disabled: noCamp, 'aria-label': 'Tower already built to' });
      levels.addEventListener('change', () => {
        const v = Math.round(Number(levels.value));
        g.towerLevels = Number.isFinite(v) ? Math.min(g.goal, Math.max(0, v)) : 0;
        draw();
      });
      sandbox = group(
        'Sandbox',
        h('label', { class: 'check' }, full, 'Stores always full (the patron tops them up)'),
        h('label', { class: 'knob' }, h('span', { class: 'knob-label' }, 'Tower already built'), levels, h('span', { class: 'knob-unit' }, g.towerLevels > 0 && !noCamp ? `levels, up to ${floorName(g.towerLevels, true)}` : 'levels')),
        noCamp ? h('p', { class: 'hint' }, 'A tower already built needs a camp to stand in: choose a Small or Large camp.') : null,
      );
    }

    add(
      h('div', { class: 'dialog-title' }, 'New Game'),
      opts.error ? h('p', { class: 'error' }, opts.error) : null,
      group(
        'Difficulty',
        radios('difficulty', DIFFICULTIES, g.difficulty, (id) => {
          const keep = { goal: g.goal, start: g.start, towerLevels: g.towerLevels };
          // a preset sets every knob; Custom keeps what's showing
          g = id === 'custom' ? { ...g, difficulty: 'custom' } : gameSettings(id, keep.start, keep);
          draw();
        }),
        h('p', { class: 'hint' }, diff.text),
      ),
      group(
        'The patron’s goal',
        radios(
          'goal',
          NEW_GAME.goals.map((x) => ({ id: x.levels, label: `${x.label} (${goldText(x.levels)})` })),
          g.goal,
          (levels) => {
            g.goal = levels;
            g.towerLevels = Math.min(g.towerLevels, levels);
            draw();
          },
        ),
        h('p', { class: 'hint' }, `A tower ${goldText(g.goal)} levels tall. Words start to drift from ${levelName(line)} up.`),
      ),
      group(
        'Starting camp',
        radios('camp', CAMPS, g.start, (id) => {
          g.start = id;
          draw();
        }),
        h('p', { class: 'hint' }, camp.text),
      ),
      sandbox,
      group(diff.id === 'custom' || diff.id === 'sandbox' ? 'Settings' : `Settings (${diff.label}; change any to make it Custom)`, knobs),
      h(
        'div',
        { class: 'row dialog-buttons newgame-buttons' },
        h('button', { class: 'btn', onclick: () => (back.remove(), opts.cancel()) }, 'Cancel'),
        h('span', { class: 'menu-spacer' }),
        h('button', { class: 'btn btn-default', onclick: startGame }, 'Start'),
      ),
    );
  }

  back.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      back.remove();
      opts.cancel();
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement && e.target.type === 'number')) {
      e.preventDefault();
      (dialog.querySelector('.btn-default') as HTMLButtonElement | null)?.click();
    }
  });
  draw();
  (dialog.querySelector('.btn-default') as HTMLButtonElement | null)?.focus();
}

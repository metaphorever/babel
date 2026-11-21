import {
  availableGold,
  orderText,
  NOUNS,
  TICKS_PER_SECOND,
  TRAITS,
  VALID_JOBS,
  VERBS,
  type ActivityKind,
  type Noun,
  type Sim,
  type SimState,
  type Verb,
  type Worker,
} from '../sim';
import { bar, clear, h } from './dom';
import { WindowManager } from './windows';

const DOING: Record<ActivityKind, string> = {
  idle: 'Standing around',
  wander: 'Wandering',
  eat: 'Eating',
  drink: 'Drinking',
  sleep: 'Sleeping',
  readBoard: 'Reading the board',
  job: 'Working',
  tavern: 'At the tavern',
};

export function formatTime(tick: number): string {
  const total = Math.floor(tick / TICKS_PER_SECOND);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface UiHooks {
  getSpeed(): number;
  setSpeed(n: number): void;
  centerOnWorker(id: number): void;
}

export class Ui {
  selected: number | null = null;
  wm: WindowManager;

  private gold!: HTMLElement;
  private clock!: HTMLElement;
  private speedBtns: HTMLButtonElement[] = [];
  private noticeList!: HTMLElement;
  private formError!: HTMLElement;
  private verbSel!: HTMLSelectElement;
  private nounSel!: HTMLSelectElement;
  private countIn!: HTMLInputElement;
  private wageIn!: HTMLInputElement;
  private forSel!: HTMLSelectElement;
  private costLine!: HTMLElement;
  private forCount = -1;
  private debugOpen = true;
  /** Rebuilding panels mid-click would swallow the click, so wait. */
  private mouseDown = false;

  constructor(
    private root: HTMLElement,
    private sim: Sim,
    private hooks: UiHooks,
  ) {
    this.wm = new WindowManager(root);
    this.buildMenubar();
    this.buildBoard();
    this.wm.create('inspector', 'Worker', -336, 34, 320);
    this.wm.create('roster', 'Workers', -656, 34, 300);
    this.wm.create('stores', 'Stores', 390, 34, 220);
    this.wm.create('log', 'Log', 16, -220, 440);
    this.buildHelp();
    this.wm.show('board');
    this.wm.show('help');
    window.addEventListener('resize', () => this.wm.keepAllOnScreen());
    window.addEventListener('mousedown', () => (this.mouseDown = true), true);
    window.addEventListener('mouseup', () => (this.mouseDown = false), true);
  }

  private get s(): SimState {
    return this.sim.state;
  }

  // -------------------------------------------------------------- menubar

  private buildMenubar(): void {
    const menu = (label: string, id: string) =>
      h('button', { class: 'menu-item', onclick: () => this.wm.toggle(id) }, label);
    this.gold = h('span', { class: 'menu-stat' });
    this.clock = h('span', { class: 'menu-stat' });
    const speeds = h('span', { class: 'speeds' });
    ['❚❚', '▶', '▶▶', '▶▶▶'].forEach((label, i) => {
      const b = h('button', { class: 'speed', title: i === 0 ? 'Pause (Space)' : `Speed ${i} (${i})`, onclick: () => this.hooks.setSpeed(i) }, label);
      this.speedBtns.push(b);
      speeds.append(b);
    });
    const bar = h(
      'div',
      { class: 'menubar' },
      h('span', { class: 'menu-apple' }, 'Babel'),
      menu('Job Board', 'board'),
      menu('Workers', 'roster'),
      menu('Stores', 'stores'),
      menu('Log', 'log'),
      menu('Help', 'help'),
      h('span', { class: 'menu-spacer' }),
      this.gold,
      this.clock,
      speeds,
    );
    this.root.append(bar);
  }

  // ---------------------------------------------------------------- board

  private buildBoard(): void {
    const win = this.wm.create('board', 'Job Board', 16, 40, 360);
    this.noticeList = h('div', { class: 'notices' });
    this.verbSel = h('select', { 'aria-label': 'Verb', onchange: () => this.syncNouns() });
    for (const v of VERBS) this.verbSel.append(h('option', { value: v }, cap(v.toLowerCase())));
    this.nounSel = h('select', { 'aria-label': 'Noun', onchange: () => this.updateCost() });
    this.countIn = h('input', { type: 'number', min: 1, max: 999, value: 10, 'aria-label': 'Count', oninput: () => this.updateCost() });
    this.wageIn = h('input', { type: 'number', min: 0, max: 50, value: 2, 'aria-label': 'Wage', oninput: () => this.updateCost() });
    this.forSel = h('select', { 'aria-label': 'For', onchange: () => this.updateCost() });
    this.costLine = h('div', { class: 'hint' });
    this.formError = h('div', { class: 'error', role: 'alert' });
    const post = h('button', { class: 'btn btn-default', onclick: () => this.postNotice() }, 'Post');
    const form = h(
      'div',
      { class: 'form' },
      h('div', { class: 'row' }, this.verbSel, this.nounSel),
      h('div', { class: 'row' }, h('label', {}, '×', this.countIn), h('label', {}, 'Wage', this.wageIn, 'g')),
      h('div', { class: 'row' }, h('label', {}, 'For', this.forSel)),
      this.costLine,
      h('div', { class: 'row row-end' }, this.formError, post),
    );
    win.body.append(
      h('div', { class: 'section-label' }, 'Posted notices'),
      this.noticeList,
      h('div', { class: 'section-label' }, 'Post a new notice'),
      form,
    );
    this.syncNouns();
  }

  private syncNouns(): void {
    const verb = this.verbSel.value as Verb;
    clear(this.nounSel);
    for (const n of NOUNS) if (VALID_JOBS[verb].includes(n)) this.nounSel.append(h('option', { value: n }, n.toLowerCase()));
    this.updateCost();
  }

  private syncForOptions(): void {
    if (this.forCount === this.s.workers.length) return;
    const keep = this.forSel.value;
    clear(this.forSel);
    this.forSel.append(h('option', { value: '' }, 'Anyone'));
    for (const w of this.s.workers) this.forSel.append(h('option', { value: String(w.id) }, w.name));
    this.forSel.value = keep;
    this.forCount = this.s.workers.length;
  }

  private updateCost(): void {
    const cost = (Number(this.countIn.value) || 0) * (Number(this.wageIn.value) || 0);
    this.costLine.textContent = `Reserves ${cost} gold now; paid out as jobs are finished.`;
  }

  private postNotice(): void {
    const r = this.sim.enqueue({
      type: 'postNotice',
      playerId: 0,
      verb: this.verbSel.value as Verb,
      noun: this.nounSel.value as Noun,
      count: Math.floor(Number(this.countIn.value)),
      wage: Math.floor(Number(this.wageIn.value)),
      addressee: this.forSel.value === '' ? null : Number(this.forSel.value),
    });
    this.formError.textContent = r.ok ? '' : r.error;
  }

  openBoardFor(workerId: number | null): void {
    this.syncForOptions();
    this.forSel.value = workerId === null ? '' : String(workerId);
    this.wm.show('board');
  }

  private refreshBoard(): void {
    this.syncForOptions();
    clear(this.noticeList);
    if (this.s.notices.length === 0) {
      this.noticeList.append(h('div', { class: 'hint' }, 'The board is empty. Idle workers will do as they please.'));
      return;
    }
    for (const n of this.s.notices) {
      const to = n.addressee === null ? 'Anyone' : this.s.workers.find((w) => w.id === n.addressee)?.name ?? '?';
      const working = this.s.workers.filter((w) => w.memory?.noticeId === n.id).length;
      this.noticeList.append(
        h(
          'div',
          { class: 'notice' },
          h('span', { class: 'notice-order' }, cap(orderText(n.order))),
          h('span', { class: 'notice-meta' }, `${n.remaining} left · ${n.wage}g · ${to}${working ? ` · ${working} on it` : ''}`),
          h('button', { class: 'btn btn-small', title: 'Take down (refunds unpaid wages)', onclick: () => this.sim.enqueue({ type: 'removeNotice', playerId: 0, noticeId: n.id }) }, '×'),
        ),
      );
    }
  }

  // ------------------------------------------------------------- inspector

  select(id: number | null): void {
    this.selected = id;
    if (id !== null) this.wm.show('inspector');
    this.refreshInspector();
  }

  private refreshInspector(): void {
    const win = this.wm.get('inspector')!;
    if (!win.open) return;
    const w = this.s.workers.find((x) => x.id === this.selected);
    clear(win.body);
    if (!w) {
      win.title.textContent = 'Worker';
      win.body.append(h('div', { class: 'hint' }, 'Click a worker to inspect them.'));
      return;
    }
    win.title.textContent = w.name;
    const traits = h('div', { class: 'traits' });
    for (const t of w.traits) traits.append(h('span', { class: 'trait', title: TRAITS[t].blurb }, TRAITS[t].label));
    const kv = (k: string, v: Node | string) => h('div', { class: 'kv' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
    const need = (label: string, v: number) => h('div', { class: 'need' }, h('span', { class: 'k' }, label), bar(v, true), h('span', { class: 'num' }, Math.round(v)));
    const moodlets = h('ul', { class: 'moodlets' });
    for (const m of w.moodlets) moodlets.append(h('li', { class: m.value >= 0 ? 'good' : 'bad' }, `${m.value >= 0 ? '+' : ''}${m.value} ${m.label}`));
    const scores = h('table', { class: 'scores' });
    w.lastScores.forEach((sc, i) => scores.append(h('tr', { class: i === 0 ? 'top' : '' }, h('td', {}, sc.label), h('td', { class: 'num' }, sc.score.toFixed(1)))));
    win.body.append(
      traits,
      h('div', { class: 'thought' }, `“${w.thought || '...'}”`),
      kv('Doing', DOING[w.activity.kind]),
      kv('Job in mind', w.memory ? `${cap(orderText(w.memory.order))} (${w.memory.wage}g)` : '—'),
      kv('Carrying', w.carrying ?? 'nothing'),
      kv('Purse', `${w.purse} gold`),
      kv('Jobs done', String(w.jobsDone)),
      h('div', { class: 'section-label' }, 'Needs'),
      need('Hunger', w.hunger),
      need('Thirst', w.thirst),
      need('Tiredness', w.fatigue),
      h('div', { class: 'need' }, h('span', { class: 'k' }, 'Mood'), bar(w.mood), h('span', { class: 'num' }, Math.round(w.mood))),
      w.moodlets.length ? moodlets : h('div', { class: 'hint' }, 'Nothing much on their mind.'),
      h('details', { class: 'debug', open: this.debugOpen, ontoggle: (e) => (this.debugOpen = (e.target as HTMLDetailsElement).open) }, h('summary', {}, 'What they’re weighing (debug)'), scores),
      h(
        'div',
        { class: 'row row-end' },
        h('button', { class: 'btn', onclick: () => this.hooks.centerOnWorker(w.id) }, 'Find'),
        h('button', { class: 'btn', onclick: () => this.openBoardFor(w.id) }, `Post a job for ${w.name}`),
      ),
    );
  }

  // ---------------------------------------------------------- other panels

  private refreshRoster(): void {
    const win = this.wm.get('roster')!;
    if (!win.open) return;
    clear(win.body);
    const t = h('table', { class: 'roster' });
    t.append(h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Doing'), h('th', {}, 'Mood')));
    for (const w of this.s.workers) {
      const row = h(
        'tr',
        { class: w.id === this.selected ? 'sel' : '', onclick: () => this.select(w.id) },
        h('td', {}, w.name),
        h('td', {}, this.doingShort(w)),
        h('td', {}, bar(w.mood)),
      );
      t.append(row);
    }
    win.body.append(t);
  }

  private doingShort(w: Worker): string {
    if (w.activity.kind === 'job' && w.memory) return cap(orderText(w.memory.order));
    return DOING[w.activity.kind];
  }

  private refreshStores(): void {
    const win = this.wm.get('stores')!;
    if (!win.open) return;
    clear(win.body);
    const pile = this.s.sites.find((x) => x.kind === 'stockpile')!;
    const kitchen = this.s.sites.find((x) => x.kind === 'kitchen')!;
    const loose = { stone: 0, wood: 0, grain: 0, bread: 0 };
    for (const it of this.s.items) loose[it.type]++;
    const t = h('table', { class: 'stores' });
    t.append(h('tr', {}, h('th', {}, ''), h('th', {}, 'Stored'), h('th', {}, 'Lying around')));
    for (const k of ['stone', 'wood', 'grain'] as const) t.append(h('tr', {}, h('td', {}, cap(k)), h('td', { class: 'num' }, pile.store[k]), h('td', { class: 'num' }, loose[k])));
    t.append(h('tr', {}, h('td', {}, 'Bread'), h('td', { class: 'num' }, kitchen.store.bread), h('td', { class: 'hint' }, 'in the larder')));
    win.body.append(t);
  }

  private lastLogTick = -1;
  private refreshLog(): void {
    const win = this.wm.get('log')!;
    if (!win.open) return;
    const last = this.s.events[this.s.events.length - 1]?.tick ?? -1;
    if (last === this.lastLogTick && win.body.childElementCount > 0) return;
    this.lastLogTick = last;
    clear(win.body);
    const list = h('ul', { class: 'log' });
    for (let i = this.s.events.length - 1; i >= 0; i--) {
      const e = this.s.events[i];
      list.append(h('li', {}, h('span', { class: 'when' }, formatTime(e.tick)), ' ', e.text));
    }
    if (this.s.events.length === 0) list.append(h('li', { class: 'hint' }, 'Nothing yet.'));
    win.body.append(list);
  }

  private buildHelp(): void {
    const win = this.wm.create('help', 'Welcome to Babel (P0)', 390, 34, 420);
    win.body.append(
      h('p', {}, 'Grey-box prototype. You can’t touch anything: you post notices on the job board, and workers decide for themselves whether to take them. Better pay is more likely to be picked, never guaranteed. Needs and moods compete with work.'),
      h('p', {}, 'Each notice has a count. It goes down when a job is finished, not when it’s taken, so a worker who finishes a job that already ran out goes unpaid and gets annoyed.'),
      h(
        'ul',
        { class: 'keys' },
        h('li', {}, h('b', {}, 'WASD / arrows'), ' pan · ', h('b', {}, 'right-drag'), ' pan'),
        h('li', {}, h('b', {}, 'Scroll'), ' zoom (whole steps)'),
        h('li', {}, h('b', {}, 'Click'), ' a worker to inspect; click the board, stockpile or kitchen to open their window'),
        h('li', {}, h('b', {}, 'Space'), ' pause · ', h('b', {}, '1 2 3'), ' speed · ', h('b', {}, 'N'), ' show all names'),
      ),
      h('p', { class: 'hint' }, 'Not in yet: scribes, scrolls, the tower, couriers, languages, the patron and quitting. Those are the next steps.'),
    );
  }

  // ---------------------------------------------------------------- tick

  refresh(): void {
    const s = this.s;
    const free = availableGold(s);
    this.gold.textContent = `Gold ${free}${s.reserved ? ` (+${s.reserved} promised)` : ''}`;
    this.clock.textContent = formatTime(s.tick);
    const speed = this.hooks.getSpeed();
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', i === speed));
    if (this.mouseDown) return;
    if (this.wm.get('board')!.open) this.refreshBoard();
    this.refreshInspector();
    this.refreshRoster();
    this.refreshStores();
    this.refreshLog();
  }
}

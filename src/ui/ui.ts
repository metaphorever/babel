import {
  availableGold,
  ALL,
  FOREVER,
  carrierText,
  clockText,
  isNight,
  currentStipend,
  QUIT,
  langName,
  sayingFor,
  speakingLang,
  vocabSummary,
  wordIn,
  CHARTER_TEXT,
  lineText,
  workerName,
  bonusChance,
  carryCapacity,
  orderText,
  SKILL_IDS,
  SKILL_LABEL,
  skillLevel,
  TICKS_PER_SECOND,
  TRAITS,
  type ActivityKind,
  type Sim,
  type SimState,
  type Worker,
} from '../sim';
import { bar, clear, h } from './dom';
import { ScriptoriumPanel } from './scriptorium';
import { TowerPanel } from './tower';
import { LanguagesPanel } from './languages';
import { WindowManager } from './windows';

const DOING: Record<ActivityKind, string> = {
  idle: 'Standing around',
  wander: 'Wandering',
  eat: 'Eating',
  drink: 'Drinking',
  sleep: 'Sleeping',
  readBoard: 'Reading the board',
  job: 'Working',
  scroll: 'Following a scroll',
  lesson: 'At a lesson',
  bar: 'At the bar',
};

export function formatTime(tick: number): string {
  const total = Math.floor(tick / TICKS_PER_SECOND);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** One current job: the line of the scroll in hand, else the notice they took. */
function currentJob(w: Worker): string {
  const c = w.held[0];
  if (c && c.pc < c.orders.length) return `${cap(lineText(c, c.pc))} (from their ${c.kind}, ${c.wage}g each)`;
  if (w.memory) return `${cap(orderText(w.memory.order))} (from a notice, ${w.memory.wage}g each)`;
  return '—';
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface UiHooks {
  getSpeed(): number;
  setSpeed(n: number): void;
  centerOnWorker(id: number): void;
  /** Center the view on a tile. */
  centerOnTile(x: number, y: number): void;
}

export class Ui {
  selected: number | null = null;
  wm: WindowManager;
  scriptorium!: ScriptoriumPanel;
  tower!: TowerPanel;
  languages!: LanguagesPanel;

  private gold!: HTMLElement;
  private patron!: HTMLElement;
  private alerts!: HTMLButtonElement;
  private clock!: HTMLElement;
  private speedBtns: HTMLButtonElement[] = [];
  private noticeList!: HTMLElement;
  private charterEl!: HTMLElement;
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
    this.scriptorium = new ScriptoriumPanel(this.wm, this.sim);
    this.tower = new TowerPanel(this.wm, this.sim, (x, y) => this.hooks.centerOnTile(x, y));
    this.languages = new LanguagesPanel(this.wm, this.sim);
    this.wm.create('inspector', 'Worker', -336, 34, 320);
    this.wm.create('roster', 'Workers', -656, 34, 300);
    this.wm.create('stores', 'Stores', 390, 34, 220);
    this.wm.create('log', 'Log', 16, -220, 440);
    this.buildHelp();
    // at the opening, the opening text does the welcoming
    if (this.sim.state.start !== 'opening') {
      this.wm.show('board');
      this.wm.show('help');
    }
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
    this.patron = h('span', { class: 'menu-stat', title: "The patron's patience. It drains steadily; every finished floor wins some back. The stipend shrinks with it." });
    this.alerts = h('button', { class: 'menu-item menu-alert', onclick: () => this.wm.show('roster') });
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
      menu('Build', 'build'),
      menu('Job Board', 'board'),
      menu('Scriptorium', 'scriptorium'),
      menu('Tower', 'tower'),
      menu('Languages', 'languages'),
      menu('Workers', 'roster'),
      menu('Stores', 'stores'),
      menu('Log', 'log'),
      menu('Help', 'help'),
      h('span', { class: 'menu-spacer' }),
      this.alerts,
      this.patron,
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
    this.charterEl = h('div', { class: 'charter', title: "The patron's standing order. You can't write conditions like this yet." });
    win.body.append(
      this.charterEl,
      h('div', { class: 'section-label' }, 'On the board'),
      this.noticeList,
      h(
        'div',
        { class: 'row row-end' },
        h('button', { class: 'btn btn-default', onclick: () => this.scriptorium.open() }, 'Write a notice or scroll…'),
      ),
    );
  }

  private refreshBoard(): void {
    const s = this.s;
    clear(this.charterEl);
    this.charterEl.append(h('div', { class: 'charter-title' }, "The patron's charter"), h('div', { class: 'charter-text' }, CHARTER_TEXT));
    clear(this.noticeList);
    const rows: HTMLElement[] = [];
    // on its way: still in the writing queue or in a courier's bag
    for (const d of s.designs) {
      if (d.carrier.dest.kind !== 'board') continue;
      const writer = s.workers.find((w) => w.id === d.claimedBy);
      const status = writer ? `${writer.name} is writing it (${Math.floor((d.progress / d.cost) * 100)}%)` : 'Waiting for a scribe';
      rows.push(h('div', { class: 'notice notice-pending' }, h('span', { class: 'notice-order' }, cap(carrierText(d.carrier))), h('span', { class: 'notice-meta' }, status)));
    }
    for (const w of s.workers) {
      for (const c of w.bag) {
        if (c.dest.kind === 'board') rows.push(h('div', { class: 'notice notice-pending' }, h('span', { class: 'notice-order' }, cap(carrierText(c))), h('span', { class: 'notice-meta' }, `${w.name} is bringing it`)));
      }
    }
    // cards and scrolls hanging on the board, waiting to be taken down
    for (const c of s.boardScrolls) {
      const to = c.dest.kind === 'board' ? workerName(s, c.dest.addressee) : '?';
      rows.push(
        h(
          'div',
          { class: `notice notice-scroll${c.patron ? ' notice-patron' : ''}` },
          h('span', { class: 'notice-order' }, cap(carrierText(c))),
          h('span', { class: 'notice-meta' }, `${cap(c.kind)} for ${to} · ${c.wage}g per unit${c.patron ? " · posted by the patron's charter" : ''}`),
          h('button', { class: 'btn btn-small', title: 'Take it down', onclick: () => this.sim.enqueue({ type: 'takeDown', playerId: 0, carrierId: c.id }) }, '×'),
        ),
      );
    }
    for (const n of s.notices) {
      const working = s.workers.filter((w) => w.memory?.noticeId === n.id).length;
      rows.push(
        h(
          'div',
          { class: 'notice' },
          h('span', { class: 'notice-order' }, cap(orderText(n.order))),
          h('span', { class: 'notice-meta' }, `Notice · ${n.remaining === FOREVER ? 'forever' : n.remaining === ALL ? 'all of it' : `${n.remaining} left`} · ${n.wage}g each · for ${workerName(s, n.addressee)}${working ? ` · ${working} on it` : ''}`),
          h('button', { class: 'btn btn-small', title: 'Take down (refunds unpaid wages)', onclick: () => this.sim.enqueue({ type: 'removeNotice', playerId: 0, noticeId: n.id }) }, '×'),
        ),
      );
    }
    if (rows.length === 0) rows.push(h('div', { class: 'hint' }, 'The board is empty. Idle workers will do as they please.'));
    this.noticeList.append(...rows);
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
    const skills = h('table', { class: 'skills' });
    for (const id of SKILL_IDS) {
      const lvl = skillLevel(w, id);
      const pips = '●'.repeat(lvl) + '○'.repeat(5 - lvl);
      const extra = id === 'hauling' ? `carries ${carryCapacity(w)}` : lvl > 0 ? `${Math.round(bonusChance(w, id) * 100)}% bonus` : '';
      skills.append(
        h(
          'tr',
          {},
          h('td', {}, SKILL_LABEL[id], w.knack === id ? h('span', { class: 'knack', title: 'A natural: learns this faster' }, ' ★') : null),
          h('td', { class: 'pips', 'aria-label': `level ${lvl} of 5` }, pips),
          h('td', { class: 'hint' }, extra),
        ),
      );
    }
    const holding = w.carrying ? `${w.carryCount} ${w.carrying}` : 'nothing';
    // the scrolls and cards in their hands, with a marker on the current line
    const inHand = h('div', { class: 'held' });
    w.held.forEach((c, i) => {
      const lines = h('ol', { class: 'scroll-lines' });
      c.orders.forEach((_o, li) =>
        lines.append(h('li', { class: i === 0 && li === c.pc ? 'current' : '' }, i === 0 && li === c.pc ? '▸ ' : '', cap(lineText(c, li)), i === 0 && li === c.pc && c.counts[li] > 1 ? ` (${c.lineDone}/${c.counts[li]})` : '')),
      );
      const meta = `${c.wage}g per unit${c.loops ? ` · looped ${c.loops}×` : ''}${i > 0 ? ' · next up' : ''}${c.waitUntil > this.s.tick ? ' · taking a breather' : ''}`;
      inHand.append(h('div', { class: 'held-carrier' }, h('div', { class: 'held-kind' }, cap(c.kind), h('span', { class: 'hint' }, ` ${meta}`)), lines));
    });
    win.body.append(
      traits,
      h('div', { class: 'thought', title: 'What you can see them doing. Body language needs no translation.' }, w.thought || '...'),
      this.saying(w),
      kv('Doing', DOING[w.activity.kind]),
      kv('Current job', currentJob(w)),
      kv('Carrying', `${holding} (holds ${carryCapacity(w)})`),
      kv('Purse', `${w.purse} gold`),
      kv('Jobs done', String(w.jobsDone)),
      w.leaving
        ? kv('Leaving', 'Walking home for good')
        : w.noticeUntil !== null
          ? kv('Giving notice', `Leaves in ${formatTime(Math.max(0, w.noticeUntil - this.s.tick))} unless their mood rises above ${QUIT.stayAbove}`)
          : '',
      w.bag.length ? kv('Bag', `${w.bag.length} to deliver`) : '',
      w.held.length ? h('div', { class: 'section-label' }, 'In hand') : '',
      w.held.length ? inHand : '',
      h('div', { class: 'section-label' }, 'Needs'),
      need('Hunger', w.hunger),
      need('Thirst', w.thirst),
      need('Tiredness', w.fatigue),
      need('Confusion', w.confusion),
      h('div', { class: 'need' }, h('span', { class: 'k' }, 'Mood'), bar(w.mood), h('span', { class: 'num' }, Math.round(w.mood))),
      w.moodlets.length ? moodlets : h('div', { class: 'hint' }, 'Nothing much on their mind.'),
      h('div', { class: 'section-label' }, 'Skills'),
      skills,
      h('details', { class: 'debug', open: this.debugOpen, ontoggle: (e) => (this.debugOpen = (e.target as HTMLDetailsElement).open) }, h('summary', {}, 'What they’re weighing (debug)'), scores, h('div', { class: 'hint' }, `Drift exposure ${Math.round(w.exposure)} / 100 (hidden from players)`)),
      h(
        'div',
        { class: 'row row-end' },
        h('button', { class: 'btn', onclick: () => this.hooks.centerOnWorker(w.id) }, 'Find'),
        h('button', { class: 'btn', onclick: () => this.scriptorium.openFor(w.id, 'board') }, 'Post a notice for them'),
        h('button', { class: 'btn', onclick: () => this.scriptorium.openFor(w.id, 'hand') }, 'Hand them an order'),
      ),
    );
  }

  /**
   * What the worker is saying, word by word, each in whatever language they
   * know it in. Words you can read in that language get a gloss; the rest
   * stay as they are. Mixed languages are the first sign of drift.
   */
  private saying(w: Worker): HTMLElement {
    const words = sayingFor(w);
    const line = h('div', { class: 'saying' }, h('span', { class: 'k' }, 'Says'));
    if (words.length === 0) {
      line.append(h('span', { class: 'hint' }, 'nothing much'));
      return line;
    }
    const spoken = h('span', { class: 'spoken' });
    words.forEach((t, i) => {
      const lang = speakingLang(w, t);
      if (i > 0) spoken.append(' ');
      if (!lang) {
        spoken.append(h('span', { class: 'word lost', title: 'A word they have lost' }, '…'));
        return;
      }
      const text = wordIn(t, lang);
      const readable = lang === 'en' || (this.s.lexicon[lang]?.includes(t) ?? false);
      const el = h('span', { class: `word word-${lang}`, lang, title: readable ? `${langName(lang)}: “${wordIn(t, 'en')}”` : `${langName(lang)}. You haven't learned this word yet.` }, text);
      if (lang !== 'en' && readable) el.append(h('sub', { class: 'gloss' }, wordIn(t, 'en')));
      spoken.append(el);
    });
    line.append(h('span', {}, '«', spoken, '»'));
    const langs = vocabSummary(w).map((v) => `${langName(v.lang)} ${v.count}`).join(' · ');
    return h('div', {}, line, h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Words'), h('span', { class: 'v' }, langs, w.driftTongue ? h('span', { class: 'hint' }, ` (drifting into ${langName(w.driftTongue)})`) : '')));
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
        h('td', {}, w.leaving ? 'Going home' : w.noticeUntil !== null ? `Notice: ${formatTime(Math.max(0, w.noticeUntil - this.s.tick))}` : this.doingShort(w)),
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
    // totals across every stockpile, on the ground and up the tower (the patron's supplies count too)
    const sum = (kind: string, k: 'stone' | 'wood' | 'grain' | 'bread' | 'beer') => this.s.sites.filter((x) => x.kind === kind && x.build === null).reduce((n, x) => n + x.store[k], 0);
    const room = this.s.sites.filter((x) => (x.kind === 'stockpile' || x.kind === 'shelves') && x.build === null && !x.supplies);
    const cap0 = room.reduce((n, x) => n + (x.capacity ?? 0), 0);
    const used = room.reduce((n, x) => n + x.store.stone + x.store.wood + x.store.grain, 0);
    const loose = { stone: 0, wood: 0, grain: 0, bread: 0, beer: 0 };
    for (const it of this.s.items) loose[it.type]++;
    const supplies = this.s.sites.find((x) => x.supplies);
    const t = h('table', { class: 'stores' });
    t.append(h('tr', {}, h('th', {}, ''), h('th', {}, 'Stored'), h('th', {}, 'Lying around')));
    for (const k of ['stone', 'wood', 'grain'] as const) t.append(h('tr', {}, h('td', {}, cap(k)), h('td', { class: 'num' }, sum('stockpile', k) + sum('shelves', k)), h('td', { class: 'num' }, loose[k])));
    const breadSupplies = supplies?.store.bread ?? 0;
    t.append(h('tr', {}, h('td', {}, 'Bread'), h('td', { class: 'num' }, sum('pantry', 'bread') + breadSupplies), h('td', { class: 'hint' }, breadSupplies ? 'pantries and supplies' : 'in the pantries')));
    t.append(h('tr', {}, h('td', {}, 'Beer'), h('td', { class: 'num' }, sum('bar', 'beer')), h('td', { class: 'hint' }, 'at the bar')));
    win.body.append(
      t,
      h('div', { class: 'hint' }, room.length ? `Stockpiles at the base: ${used} of ${cap0} full.` : 'No stockpiles yet. Goods lying around can still be used, but workers would rather take from a stockpile.'),
      supplies ? h('div', { class: 'hint' }, "The patron's supplies are counted in. Nothing can be added to them.") : '',
      h('div', { class: 'hint' }, 'The Tower window shows each floor.'),
    );
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
    const win = this.wm.create('help', 'Welcome to Babel (P1)', 390, 34, 420);
    win.body.append(
      h('p', {}, 'Grey-box prototype. You can’t touch anything. You compose orders in the Scriptorium; your scribe writes them out and carries them. A single work line posted on the board is a notice: anyone takes one job at a time from it. A card or scroll on the board is taken down by the first worker free to take it. Anything handed to a worker directly replaces whatever they were doing.'),
      h('p', {}, 'Counts and wages are per unit. Anything addressed to a worker by name always wins over orders for Anyone. If nobody is writing, the patron’s charter posts a scribe loop on the board so you can never lose your scribes for good.'),
      h(
        'ul',
        { class: 'keys' },
        h('li', {}, h('b', {}, 'WASD / arrows'), ' pan · ', h('b', {}, 'right-drag'), ' pan'),
        h('li', {}, h('b', {}, 'Scroll'), ' zoom (whole steps)'),
        h('li', {}, h('b', {}, 'Click'), ' a worker to inspect; click the board, scriptorium, a building or a fixture to open its window'),
        h('li', {}, h('b', {}, 'B'), ' the Build window · ', h('b', {}, 'Esc'), ' stop placing · ', h('b', {}, '[ ]'), ' building width'),
        h('li', {}, h('b', {}, 'Space'), ' pause · ', h('b', {}, '1 2 3'), ' speed · ', h('b', {}, 'N'), ' show all names'),
      ),
      h('p', { class: 'hint' }, 'To build anything on the ground: place it from the Build window, then post “build camp” work. Fixtures (beds, ovens, pantries, the bar...) go inside finished buildings. To build the tower: draw a blueprint (Tower window or Scriptorium), then post “build tower” work. Languages drift from floor 3 up (see the Languages window). Keep the patron pleased by finishing floors, and keep your workers fed or they’ll quit. Not in yet: mailboxes, upper job boards, COPY.'),
    );
  }

  // ---------------------------------------------------------------- tick

  refresh(): void {
    const s = this.s;
    const free = availableGold(s);
    this.gold.textContent = `Gold ${free}${s.reserved ? ` (+${s.reserved} promised)` : ''}`;
    this.patron.textContent = `Patron ${Math.round(s.patience)}% · +${currentStipend(s)}g/day`;
    const notice = s.workers.filter((w) => w.noticeUntil !== null || w.leaving).length;
    this.alerts.textContent = s.workers.length === 0 ? 'Everyone has gone home' : notice ? `${notice} giving notice` : '';
    this.alerts.style.display = notice || s.workers.length === 0 ? '' : 'none';
    this.clock.textContent = `${isNight(s.tick) ? '☾' : '☼'} ${clockText(s.tick)}`;
    const speed = this.hooks.getSpeed();
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', i === speed));
    if (this.mouseDown) return;
    if (this.wm.get('board')!.open) this.refreshBoard();
    if (this.wm.get('scriptorium')!.open) this.scriptorium.refresh();
    if (this.wm.get('tower')!.open) this.tower.refresh();
    if (this.wm.get('languages')!.open) this.languages.refresh();
    this.refreshInspector();
    this.refreshRoster();
    this.refreshStores();
    this.refreshLog();
  }
}

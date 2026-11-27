import {
  availableGold,
  DRIFT,
  levelName,
  ALL,
  FOREVER,
  carrierText,
  destText,
  clockText,
  isNight,
  currentStipend,
  QUIT,
  complaintsText,
  whenText,
  langName,
  sayingFor,
  speakingLang,
  vocabSummary,
  wordIn,
  CHARTER_TEXT,
  lineText,
  isWorkVerb,
  workerName,
  bonusChance,
  carryCapacity,
  orderText,
  SKILL_IDS,
  SKILL_LABEL,
  skillLevel,
  TICKS_PER_SECOND,
  TRAITS,
  goldText,
  headcount,
  recruitError,
  recruitFee,
  type ActivityKind,
  type Sim,
  type SimState,
  type Site,
  type Worker,
} from '../sim';
import { HABIT_LABEL, relationsOf, temperWords } from '../sim/social';
import { portraitCanvas } from '../render/sprites';
import { bar, clear, h } from './dom';
import { ScriptoriumPanel } from './scriptorium';
import { TowerPanel } from './tower';
import { LanguagesPanel } from './languages';
import { AlertsPanel } from './alerts';
import { StoresPanel } from './stores';
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
  if (c && c.pc < c.orders.length) {
    // only work lines pay; waiting and checking are free
    const paid = isWorkVerb(c.orders[c.pc][0].t) && c.wage > 0;
    return `${cap(lineText(c, c.pc))} (from their ${c.kind}${paid ? `, ${c.wage}g each` : ''})`;
  }
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
  /** Open the "Send a bonus" dialog for a worker. */
  sendBonus?(workerId: number): void;
  /** Open the "Recruit a worker" dialog. */
  recruit?(): void;
  /** Centre the view on a store and open its window. */
  showSite?(site: Site): void;
}

export class Ui {
  selected: number | null = null;
  wm: WindowManager;
  scriptorium!: ScriptoriumPanel;
  tower!: TowerPanel;
  languages!: LanguagesPanel;
  alertsPanel!: AlertsPanel;
  stores!: StoresPanel;

  private gold!: HTMLElement;
  private patron!: HTMLElement;
  private alerts!: HTMLButtonElement;
  private clock!: HTMLElement;
  private speedBtns: HTMLButtonElement[] = [];
  private noticeList!: HTMLElement;
  private wayList!: HTMLElement;
  private handList!: HTMLElement;
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
    this.alertsPanel = new AlertsPanel(this.wm, this.sim, (id) => {
      this.select(id);
      this.hooks.centerOnWorker(id);
    });
    this.wm.create('inspector', 'Worker', -336, 34, 320);
    this.wm.create('roster', 'Workers', -656, 34, 300);
    this.stores = new StoresPanel(this.wm, this.sim, (site) => this.hooks.showSite?.(site));
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
    this.patron = h('span', { class: 'menu-stat', title: "The patron's patience. It drains steadily; every finished level wins some back. The stipend shrinks with it." });
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
      menu('File', 'saves'),
      menu('Build', 'build'),
      menu('Orders', 'board'),
      menu('Scriptorium', 'scriptorium'),
      menu('Tower', 'tower'),
      menu('Languages', 'languages'),
      menu('Workers', 'roster'),
      menu('Stores', 'stores'),
      menu('Log', 'log'),
      menu('Alerts', 'alerts'),
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

  /**
   * Orders: every order out in the world. What's posted on the board, what's
   * on its way somewhere in a courier's bag (or waiting in the outbox), and
   * the cards and scrolls workers are carrying out. What's still waiting to
   * be written is in the Scriptorium.
   */
  private buildBoard(): void {
    const win = this.wm.create('board', 'Orders', 16, 40, 380);
    this.noticeList = h('div', { class: 'notices' });
    this.wayList = h('div', { class: 'notices' });
    this.handList = h('div', { class: 'notices' });
    this.charterEl = h('div', { class: 'charter', title: "The patron's standing order. You can't write standing orders like this yet." });
    win.body.append(
      this.charterEl,
      h('div', { class: 'section-label', title: 'A notice stays up and hands out one job at a time. A card or scroll hangs there until someone takes it down.' }, 'On the board'),
      this.noticeList,
      h('div', { class: 'section-label', title: 'Written, and in a courier’s bag or the scriptorium’s outbox. Someone with DELIVER on their scroll carries them.' }, 'On the way'),
      this.wayList,
      h('div', { class: 'section-label', title: 'Cards and scrolls workers are carrying out, and the line each is on.' }, 'In hand'),
      this.handList,
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
    // on the way: in a courier's bag, or waiting in the outbox
    clear(this.wayList);
    const way: HTMLElement[] = [];
    for (const w of s.workers) {
      for (const c of w.bag) {
        way.push(
          h('div', { class: 'notice notice-pending' }, h('span', { class: 'notice-order' }, cap(carrierText(c))), h('span', { class: 'notice-meta' }, `${w.name} is taking it to ${destText(s, c.dest)}${c.retryAfter > s.tick ? ' (will try again soon)' : ''}`)),
        );
      }
    }
    for (const c of s.outbox) {
      way.push(h('div', { class: 'notice notice-pending' }, h('span', { class: 'notice-order' }, cap(carrierText(c))), h('span', { class: 'notice-meta' }, `In the outbox, for ${destText(s, c.dest)}: waiting for someone who delivers`)));
    }
    if (way.length === 0) way.push(h('div', { class: 'hint' }, 'Nothing on its way.'));
    this.wayList.append(...way);
    // in hand: what each worker is carrying out
    clear(this.handList);
    const hand: HTMLElement[] = [];
    for (const w of s.workers) {
      const c = w.held[0];
      if (!c) continue;
      const at = c.pc < c.orders.length ? ` · on line ${c.pc + 1}: ${lineText(c, c.pc)}` : '';
      hand.push(
        h(
          'div',
          { class: 'notice notice-scroll', title: 'Open their window', onclick: () => this.select(w.id) },
          h('span', { class: 'notice-order' }, cap(carrierText(c))),
          h('span', { class: 'notice-meta' }, `${w.name}'s ${c.kind}${at}`),
        ),
      );
    }
    if (hand.length === 0) hand.push(h('div', { class: 'hint' }, 'Nobody is carrying out a card or scroll.'));
    this.handList.append(...hand);
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
    for (const hb of w.habits) traits.append(h('span', { class: 'trait habit', title: 'A habit. Others have opinions about it.' }, HABIT_LABEL[hb]));
    for (const word of temperWords(w)) traits.append(h('span', { class: 'trait temper', title: 'Their temperament: how they take what happens between people.' }, word));
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
    // their relationships, each name a link to that worker
    const relations = h('ul', { class: 'relations' });
    for (const r of relationsOf(this.s, w)) {
      const other = this.s.workers.find((o) => o.id === r.otherId);
      const at = other ? r.text.lastIndexOf(other.name) : -1;
      relations.append(
        at < 0
          ? h('li', {}, r.text)
          : h('li', {}, r.text.slice(0, at), h('button', { class: 'name-link', onclick: () => this.select(r.otherId) }, other!.name), r.text.slice(at + other!.name.length)),
      );
    }
    // what's happened between them and others lately (what they'd gossip about)
    const lately = h('ul', { class: 'relations lately' });
    for (const m of w.lately) {
      const from = m.heardFrom !== undefined ? this.s.workers.find((o) => o.id === m.heardFrom) : undefined;
      lately.append(h('li', { class: m.tone > 0 ? 'good' : 'bad' }, `${m.tone > 0 ? '+' : '−'} ${cap(m.what)}${from ? ` (heard from ${from.name})` : ''}`));
    }
    win.body.append(
      h(
        'div',
        { class: 'bio-head' },
        this.portraitOf(w),
        h('div', { class: 'bio-side' }, traits, h('div', { class: 'thought', title: 'What you can see them doing. Body language needs no translation.' }, w.thought || '...')),
      ),
      this.saying(w),
      kv('Doing', DOING[w.activity.kind]),
      kv('Current job', currentJob(w)),
      kv('Carrying', `${holding} (holds ${carryCapacity(w)})`),
      kv('Purse', `${w.purse} gold`),
      kv('Jobs done', String(w.jobsDone)),
      w.leaving
        ? kv('Leaving', 'Walking home for good')
        : w.noticeUntil !== null
          ? kv('Giving notice', `Fed up with ${complaintsText(w)}. Leaves at ${whenText(w.noticeUntil)} (in ${formatTime(Math.max(0, w.noticeUntil - this.s.tick))}) unless their mood rises to ${QUIT.lowMood}.`)
          : w.fedUpSince !== null && w.fedUpSince !== undefined
            ? kv('Fed up', `With ${complaintsText(w)}. Unless their mood is back to ${QUIT.lowMood} by the end of the shift, they'll put in notice.`)
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
      h('div', { class: 'section-label' }, 'Relationships'),
      relations.childElementCount ? relations : h('div', { class: 'hint' }, 'Nobody they feel strongly about, yet.'),
      w.lately.length ? h('div', { class: 'section-label' }, 'Lately') : '',
      w.lately.length ? lately : '',
      h('div', { class: 'section-label' }, 'Skills'),
      skills,
      h('details', { class: 'debug', open: this.debugOpen, ontoggle: (e) => (this.debugOpen = (e.target as HTMLDetailsElement).open) }, h('summary', {}, 'What they’re weighing (debug)'), scores, h('div', { class: 'hint' }, `Drift exposure ${Math.round(w.exposure)} / 100 (hidden from players)`)),
      h(
        'div',
        { class: 'row row-end' },
        h('button', { class: 'btn', onclick: () => this.hooks.centerOnWorker(w.id) }, 'Find'),
        h('button', { class: 'btn', onclick: () => this.scriptorium.openFor(w.id, 'board') }, 'Post a notice for them'),
        h('button', { class: 'btn', onclick: () => this.scriptorium.openFor(w.id, 'hand') }, 'Hand them an order'),
        h('button', { class: 'btn', disabled: w.leaving, title: 'A letter with gold in it: a scribe writes it, a courier hands it over, and it lifts their mood at once.', onclick: () => this.hooks.sendBonus?.(w.id) }, 'Send a bonus…'),
      ),
    );
  }

  /**
   * What the worker is saying, word by word, each in whatever language they
   * know it in. Words you can read in that language get a gloss; the rest
   * stay as they are. Mixed languages are the first sign of drift.
   */
  /** Their portrait, or the empty frame while there's no portrait art. */
  private portraitOf(w: Worker): HTMLElement {
    const src = portraitCanvas(w.look, w.parentLooks);
    if (!src) return h('div', { class: 'portrait', 'aria-hidden': 'true' });
    const c = h('canvas', { class: 'portrait portrait-art', width: src.width, height: src.height, role: 'img', 'aria-label': 'Portrait of ' + w.name });
    c.getContext('2d')!.drawImage(src, 0, 0);
    return c;
  }

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
        h('td', {}, w.leaving ? 'Going home' : w.noticeUntil !== null ? `Notice: ${formatTime(Math.max(0, w.noticeUntil - this.s.tick))}` : w.fedUpSince !== null && w.fedUpSince !== undefined ? 'Fed up' : this.doingShort(w)),
        h('td', {}, bar(w.mood)),
      );
      t.append(row);
    }
    // hiring outside the order system: paid at once, they walk in from the road
    const fee = recruitFee(this.s);
    const why = recruitError(this.s);
    win.body.append(
      t,
      h(
        'div',
        { class: 'row recruit-row' },
        h('button', { class: 'btn', disabled: why !== null, title: why ?? 'No scribe or courier: the fee leaves the treasury now and they walk in from the road. Each recruit costs more the bigger the camp.', onclick: () => this.hooks.recruit?.() }, `Recruit a worker (${goldText(fee)} gold)`),
      ),
      h('div', { class: 'hint' }, why ?? `${headcount(this.s)} working here. The patron sends newcomers too, while they're pleased and the tower grows.`),
    );
  }

  private doingShort(w: Worker): string {
    if (w.activity.kind === 'job' && w.memory) return cap(orderText(w.memory.order));
    return DOING[w.activity.kind];
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
      h('p', { class: 'hint' }, `Languages drift from ${levelName(DRIFT.lineFloor)} up (see the Languages window). Keep the patron pleased by finishing levels, and keep your workers fed or they’ll quit (a bonus, from a worker’s window, can talk a fed-up worker round). Not in yet: mailboxes, upper job boards, COPY.`),
      // the reference that used to be spread around the windows, folded away until wanted
      h(
        'details',
        {},
        h('summary', {}, 'Building'),
        h(
          'ul',
          { class: 'help-list' },
          h('li', {}, 'Place things from the Build window; placing only lays out the plan. Workers build it once you post build work.'),
          h('li', {}, h('b', {}, 'build camp'), ': everything planned outside the tower.'),
          h('li', {}, h('b', {}, 'build buildings'), ': the buildings only (not what goes in them).'),
          h('li', {}, h('b', {}, 'build fixtures'), ': beds, ovens, stores, ladders… Add “in camp”, “in tower”, a level or a building to narrow it.'),
          h('li', {}, h('b', {}, 'build tower'), ': the level under way. Draw a blueprint first (Build or Tower window); a courier carries it to the top.'),
          h('li', {}, 'Fixtures can be planned before their building or tower level is finished. They wait until it’s up.'),
          h('li', {}, h('b', {}, 'Wheelbarrows and carts'), ' are built on open ground. They’re stores you can name (“haul stone to cart 1”), you can move one (“haul cart 1 to stockpile 2”), and a haul can go by cart (“… using cart 1”): far more per trip, but pushing is slow, and carts stay on the ground. A cart left mid-job stays where it is, loaded, for anyone to haul from.'),
        ),
      ),
      h(
        'details',
        {},
        h('summary', {}, 'Conditions and waiting'),
        h(
          'ul',
          { class: 'help-list' },
          h('li', {}, h('b', {}, 'if'), ' … : the next line only runs if it holds. Two ifs in a row: both must hold. ', h('b', {}, 'otherwise'), ': the line after it runs if the if didn’t.'),
          h('li', {}, h('b', {}, 'until'), ' … on a work line: stop once it holds (checked before each unit). ', h('b', {}, 'wait'), ': for some hours, or until something holds.'),
          h('li', {}, 'A store: “has 20 stone”, “has fewer than 20”, “has no stone”. Checking one means walking over to look, unless it’s close by.'),
          h('li', {}, 'The time: ', h('b', {}, 'dawn'), ' 6:00 to noon, ', h('b', {}, 'noon'), ' to 18:00, ', h('b', {}, 'dusk'), ' to midnight, ', h('b', {}, 'midnight'), ' to 6:00. “Mine until dusk, wait until dawn, repeat” is a day shift.'),
          h('li', {}, 'Also: hungry, tired, carrying; and “not” in front of any of these.'),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- tick

  refresh(): void {
    const s = this.s;
    const free = availableGold(s);
    this.gold.textContent = `Gold ${free}${s.reserved ? ` (+${s.reserved} promised)` : ''}`;
    this.patron.textContent = `Patron ${Math.round(s.patience)}% · +${currentStipend(s)}g/day`;
    // workers already walking home aren't giving notice: they've gone
    const notice = s.workers.filter((w) => w.noticeUntil !== null && !w.leaving).length;
    const nobody = headcount(s) === 0;
    this.alerts.textContent = nobody ? 'Everyone has gone' : notice ? `${notice} giving notice` : '';
    this.alerts.style.display = notice || nobody ? '' : 'none';
    this.clock.textContent = `${isNight(s.tick) ? '☾' : '☼'} ${clockText(s.tick)}`;
    const speed = this.hooks.getSpeed();
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', i === speed));
    if (this.mouseDown) return;
    if (this.wm.get('board')!.open) this.refreshBoard();
    if (this.wm.get('scriptorium')!.open) this.scriptorium.refresh();
    if (this.wm.get('tower')!.open) this.tower.refresh();
    if (this.wm.get('languages')!.open) this.languages.refresh();
    if (this.wm.get('alerts')!.open) this.alertsPanel.refresh();
    this.refreshInspector();
    this.refreshRoster();
    if (this.wm.get('stores')!.open) this.stores.refresh();
    this.refreshLog();
  }
}

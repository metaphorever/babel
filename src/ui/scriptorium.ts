import {
  carrierText,
  destText,
  SCRIBE,
  SCROLL_LINES,
  VALID_JOBS,
  isWorkVerb,
  ALL,
  FOREVER,
  allowsAll,
  allowsForever,
  countText,
  levelName,
  isSpecialCount,
  LANGS,
  langName,
  takesPlaces,
  takesWho,
  wordIn,
  word,
  placeKey,
  placeName,
  placeTokens,
  STORE_WORD,
  STORES_FOR,
  FIXTURE_WORD,
  takesTarget,
  type FixtureKind,
  type Place,
  type Site,
  type LangId,
  type TokenId,
  type Dest,
  type Noun,
  type Sim,
  type SimState,
  type Verb,
} from '../sim';
import { siteTitle } from '../sim/world';
import { clear, h } from './dom';
import type { WindowManager } from './windows';

type Mode = 'anyone' | 'named' | 'hand';

/** 16x16 1-bit icons: a job board on legs, and an open hand. */
const BOARD_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges"><path d="M1 2h14v1H1zM1 10h14v1H1zM1 3h1v7H1zM14 3h1v7h-1zM3 4h4v4H3zM9 4h4v2H9zM9 7h3v2H9zM3 11h1v4H3zM12 11h1v4h-1z" fill="currentColor"/></svg>';
const NAMED_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges"><path d="M1 2h14v1H1zM1 10h14v1H1zM1 3h1v7H1zM14 3h1v7h-1zM3 11h1v4H3zM12 11h1v4h-1zM6 4h4v1H6zM5 5h1v2H5zM10 5h1v2h-1zM6 7h4v1H6zM7 8h2v1H7z" fill="currentColor"/></svg>';
const HAND_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges"><path d="M5 2h1v6H5zM7 1h1v7H7zM9 2h1v6H9zM11 3h1v6h-1zM2 7h1v2H2zM3 8h1v2H3zM4 7h1v6H4zM12 8h1v4h-1zM5 13h7v1H5zM5 8h7v5H5z" fill="currentColor"/></svg>';

const MODES: { id: Mode; label: string; hint: string; icon: string }[] = [
  { id: 'anyone', label: 'Board · Anyone', hint: 'Post it on the job board for whoever is free.', icon: BOARD_ICON },
  { id: 'named', label: 'Board · by name', hint: 'Post it on the board for one worker. Their name always wins.', icon: NAMED_ICON },
  { id: 'hand', label: 'Hand to…', hint: 'A courier hands it straight to one worker. It replaces what they are doing.', icon: HAND_ICON },
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface DraftLine {
  verb: Verb;
  noun: Noun | null;
  /** Hauling only: from a store (null = whatever's lying around) and to one (null = the nearest with room). */
  from: Place | null;
  to: Place | null;
  /** Teaching / learning: which worker. */
  who?: number | null;
  /** Building: one planned build (a building, a fixture, or a tower level) instead of the whole camp. */
  target?: Place | null;
  count: number;
}

interface TargetOption {
  key: string;
  target: Place;
  text: string;
  words: TokenId[];
}

interface PlaceOption {
  key: string;
  place: Place | null;
  text: string;
  /** The words it needs, to grey it out when they can't be written in this language. */
  words: TokenId[];
}

const VERB_LABEL: Record<Verb, string> = {
  MINE: 'Mine',
  CHOP: 'Chop',
  HARVEST: 'Harvest',
  COOK: 'Cook',
  BREW: 'Brew',
  HAUL: 'Haul',
  BUILD: 'Build',
  WRITE: 'Write',
  DELIVER: 'Deliver',
  CHECK: 'Check the board',
  REPEAT: 'Repeat from the top',
  TEACH: 'Teach',
  LEARN: 'Learn from',
};

/** What the second slot holds for each verb. Places (from/to) come with the tower. */
function nounsFor(verb: Verb): readonly Noun[] {
  if (isWorkVerb(verb)) return VALID_JOBS[verb];
  if (verb === 'CHECK') return ['BOARD'];
  return [];
}

const COUNT_HINT: Partial<Record<Verb, string>> = {
  WRITE: 'designs',
  BUILD: 'materials',
  TEACH: 'words',
  LEARN: 'words',
  DELIVER: '',
};

function hasCount(verb: Verb): boolean {
  if (verb === 'TEACH' || verb === 'LEARN') return true;
  return verb !== 'REPEAT' && verb !== 'CHECK' && verb !== 'DELIVER';
}

const VERB_ORDER: Verb[] = [...new Set(SCROLL_LINES.map((l) => l.verb))];

const PRESETS: { label: string; lines: DraftLine[] }[] = [
  {
    label: 'Notice: mine ×20',
    lines: [{ verb: 'MINE', noun: 'STONE', from: null, to: null, count: 20 }],
  },
  {
    label: 'Notice: build camp, all',
    lines: [{ verb: 'BUILD', noun: 'CAMP', from: null, to: null, count: ALL }],
  },
  {
    label: 'Scribe loop',
    lines: [
      { verb: 'WRITE', noun: null, from: null, to: null, count: 1 },
      { verb: 'DELIVER', noun: null, from: null, to: null, count: 1 },
      { verb: 'REPEAT', noun: null, from: null, to: null, count: 1 },
    ],
  },
  {
    label: 'Mine & haul loop',
    lines: [
      { verb: 'MINE', noun: 'STONE', from: null, to: null, count: 2 },
      { verb: 'HAUL', noun: 'STONE', from: null, to: null, count: 2 },
      { verb: 'REPEAT', noun: null, from: null, to: null, count: 1 },
    ],
  },
  {
    label: 'Farm & cook loop',
    lines: [
      { verb: 'HARVEST', noun: 'GRAIN', from: null, to: null, count: 2 },
      { verb: 'HAUL', noun: 'GRAIN', from: null, to: null, count: 2 },
      { verb: 'COOK', noun: 'BREAD', from: null, to: null, count: 2 },
      { verb: 'REPEAT', noun: null, from: null, to: null, count: 1 },
    ],
  },
  {
    label: 'Builder loop',
    lines: [
      { verb: 'BUILD', noun: 'TOWER', from: null, to: null, count: 3 },
      { verb: 'REPEAT', noun: null, from: null, to: null, count: 1 },
    ],
  },
  {
    label: 'Release (check the board)',
    lines: [{ verb: 'CHECK', noun: 'BOARD', from: null, to: null, count: 1 }],
  },
];

/**
 * The scriptorium: what's waiting to be written, what's on its way, and the
 * composer. One composer for everything: a single work line posted on the
 * board is a notice; anything else is a card or scroll that whoever takes it
 * (or whoever it's handed to) carries out.
 */
export class ScriptoriumPanel {
  private queue: HTMLElement;
  private transit: HTMLElement;
  private linesEl: HTMLElement;
  private lines: DraftLine[] = PRESETS[0].lines.map((l) => ({ ...l }));
  private wageIn: HTMLInputElement;
  /** Who it's for and how it gets there: the most important choice, so it sits on top. */
  private mode: Mode = 'anyone';
  private modeBtns = new Map<Mode, HTMLButtonElement>();
  private banner = h('div', { class: 'mode-banner', role: 'status' });
  private composeBox = h('div', { class: 'compose-box' });
  private whoSel: HTMLSelectElement;
  private summary: HTMLElement;
  private error: HTMLElement;
  private whoCount = -1;
  private bpError = h('span', { class: 'error', role: 'alert' });
  private langSel = h('select', { 'aria-label': 'Written in' });
  private preview = h('div', { class: 'compose-preview' });
  private lexSeen = -1;

  constructor(
    private wm: WindowManager,
    private sim: Sim,
  ) {
    const win = wm.create('scriptorium', 'Scriptorium', 390, 34, 400);
    this.queue = h('div', { class: 'notices' });
    this.transit = h('div', { class: 'notices' });
    this.linesEl = h('div', { class: 'compose-lines' });
    this.wageIn = h('input', { type: 'number', min: 0, max: 50, value: 2, 'aria-label': 'Wage per unit', oninput: () => this.updateSummary() });
    this.whoSel = h('select', { 'aria-label': 'Which worker', onchange: () => this.updateSummary() });
    const modes = h('div', { class: 'mode-switch', role: 'radiogroup', 'aria-label': 'Who it is for' });
    for (const m of MODES) {
      const icon = h('span', { class: 'mode-icon', 'aria-hidden': 'true' });
      icon.innerHTML = m.icon;
      const b = h('button', { class: 'mode-btn', role: 'radio', title: m.hint, onclick: () => this.setMode(m.id) }, icon, h('span', {}, m.label));
      this.modeBtns.set(m.id, b);
      modes.append(b);
    }
    this.summary = h('div', { class: 'compose-summary' });
    this.error = h('div', { class: 'error', role: 'alert' });
    const presets = h('div', { class: 'row presets' }, h('span', { class: 'hint' }, 'Start from:'));
    for (const p of PRESETS) {
      presets.append(h('button', { class: 'btn btn-small', onclick: () => this.usePreset(p.lines) }, p.label));
    }
    win.body.append(
      h('div', { class: 'section-label' }, 'Waiting to be written'),
      this.queue,
      h('div', { class: 'section-label' }, 'Written, on the way'),
      this.transit,
      h('div', { class: 'section-label' }, 'Blueprints'),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => this.blueprint() }, 'Draw a blueprint for the next level'),
        this.bpError,
      ),
      h('div', { class: 'hint' }, 'Someone with DELIVER carries it to the top of the tower; then builders can start.'),
      h('div', { class: 'section-label' }, 'Compose'),
      modes,
      this.composeBox,
    );
    this.composeBox.append(
      this.banner,
      presets,
      this.linesEl,
      h('div', { class: 'row' }, h('label', {}, 'Written in', this.langSel), h('label', {}, 'Wage', this.wageIn, 'g per unit')),
      this.preview,
      this.summary,
      h('div', { class: 'row row-end' }, this.error, h('button', { class: 'btn btn-default', onclick: () => this.send() }, 'Send to scribe')),
    );
    this.langSel.addEventListener('change', () => this.renderLines());
    this.setMode('anyone');
    this.syncWho();
    this.syncLangs();
    this.renderLines();
  }

  private get lang(): LangId {
    return (this.langSel.value || 'en') as LangId;
  }

  /** Can the player write this word in the chosen language yet? */
  private canWrite(t: TokenId): boolean {
    return this.s.lexicon[this.lang]?.includes(t) ?? false;
  }

  /** A slot label: the English meaning, plus the word itself when writing in another language. */
  private label(english: string, t: TokenId): string {
    if (this.lang === 'en') return english;
    return this.canWrite(t) ? `${english} · ${wordIn(t, this.lang)}` : `${english} (can't write yet)`;
  }

  /** Offer every language you can write at least one word in. */
  private syncLangs(): void {
    const total = LANGS.reduce((n, l) => n + (this.s.lexicon[l.id]?.length ?? 0), 0);
    if (total === this.lexSeen) return;
    this.lexSeen = total;
    const keep = this.langSel.value || 'en';
    clear(this.langSel);
    for (const l of LANGS) {
      const n = this.s.lexicon[l.id]?.length ?? 0;
      if (n > 0) this.langSel.append(h('option', { value: l.id }, l.id === 'en' ? l.name : `${l.name} (${n} words)`));
    }
    this.langSel.value = keep;
    if (this.langSel.selectedIndex < 0) this.langSel.selectedIndex = 0;
  }

  private get s(): SimState {
    return this.sim.state;
  }

  /** Open the composer with a worker preselected, as a notice for them or a scroll handed to them. */
  openFor(workerId: number, how: 'board' | 'hand'): void {
    this.setMode(how === 'board' ? 'named' : 'hand');
    this.whoSel.value = String(workerId);
    this.updateSummary();
    this.wm.show('scriptorium');
  }

  private setMode(m: Mode): void {
    this.mode = m;
    for (const [id, b] of this.modeBtns) {
      b.classList.toggle('on', id === m);
      b.setAttribute('aria-checked', String(id === m));
    }
    this.composeBox.className = `compose-box mode-${m}`;
    this.whoCount = -1;
    this.syncWho();
    this.updateSummary();
  }

  open(): void {
    this.wm.show('scriptorium');
  }

  /** Open the composer with these lines filled in, as a notice for Anyone. */
  openDraft(lines: DraftLine[]): void {
    this.setMode('anyone');
    this.usePreset(lines);
    this.wm.show('scriptorium');
  }

  private blueprint(): void {
    const r = this.sim.enqueue({ type: 'blueprint', playerId: 0 });
    this.bpError.textContent = r.ok ? '' : r.error;
  }

  /**
   * Where a haul can come from or go to: nowhere in particular (lying
   * around / the nearest store), anywhere at the base or in the tower, one
   * floor, or one store by number or name, left to right, base first.
   */
  /**
   * The stores that keep what a haul line carries (stockpiles and shelves
   * for stone, wood and grain; pantries for bread; bars for beer), left to
   * right, base first.
   */
  private storesFor(noun: Noun | null): Site[] {
    const kinds: readonly string[] = noun && noun in STORES_FOR ? STORES_FOR[noun as keyof typeof STORES_FOR] : [];
    return this.s.sites.filter((x) => kinds.includes(x.kind) && x.num > 0).sort((a, b) => a.level - b.level || a.x0 - b.x0);
  }

  private placeOptions(dir: 'from' | 'to', noun: Noun | null): PlaceOption[] {
    const s = this.s;
    const stores = this.storesFor(noun);
    const opts: PlaceOption[] = [
      { key: '', place: null, text: dir === 'from' ? 'lying around' : noun === 'ANY' ? 'to wherever each thing is kept' : `to the nearest ${noun && noun in STORES_FOR ? STORES_FOR[noun as keyof typeof STORES_FOR][0] : 'store'}`, words: [] },
      { key: placeKey(0), place: 0, text: `${dir} the base (any)`, words: ['BASE'] },
    ];
    // floors only where something up there keeps this good
    const floors = [...new Set(stores.filter((x) => x.level > 0).map((x) => x.level))].sort((a, b) => a - b);
    if (floors.length > 0) opts.push({ key: placeKey('tower'), place: 'tower', text: `${dir} the tower (any level)`, words: ['TOWER'] });
    for (const k of floors) opts.push({ key: placeKey(k), place: k, text: `${dir} ${levelName(k)}`, words: ['FLOOR'] });
    for (const x of stores) {
      const word = STORE_WORD[x.kind as keyof typeof STORE_WORD];
      const p: Place = x.named ? { name: x.label } : { fixture: word, n: x.num };
      opts.push({ key: placeKey(p), place: p, text: `${dir} ${siteTitle(s, x)}${x.build ? ', being built' : ''}`, words: x.named ? [] : [word] });
    }
    return opts;
  }

  private placeSelect(i: number, dir: 'from' | 'to', line: DraftLine): HTMLSelectElement {
    const opts = this.placeOptions(dir, line.noun);
    const current = line[dir];
    // a place the line already names that isn't there any more stays on the menu
    if (current !== null && !opts.some((o) => o.key === placeKey(current))) opts.push({ key: placeKey(current), place: current, text: `${dir} ${placeName(current)} (not there now)`, words: [] });
    const sel = h('select', { 'aria-label': `Line ${i + 1} ${dir}` });
    for (const o of opts) sel.append(h('option', { value: o.key, disabled: o.words.some((t) => !this.canWrite(t)) && o.key !== placeKey(current) }, o.text));
    sel.value = placeKey(current);
    sel.addEventListener('change', () => {
      line[dir] = opts.find((o) => o.key === sel.value)?.place ?? null;
      this.updateSummary();
    });
    return sel;
  }

  /**
   * What a build line can name instead of the whole camp: each building with
   * work still planned (it and its fixtures), each planned fixture, and each
   * tower level with fixtures planned on it.
   */
  private buildTargets(): TargetOption[] {
    const s = this.s;
    const opts: TargetOption[] = [];
    const planned = s.sites.filter((x) => x.build && x.kind in FIXTURE_WORD);
    for (const b of s.buildings) {
      if (b.kind !== 'house') continue;
      const inside = planned.filter((x) => x.buildingId === b.id).length;
      if (!b.build && inside === 0) continue;
      const what = b.build ? (inside ? `${b.name}, and the ${inside} ${inside === 1 ? 'fixture' : 'fixtures'} planned in it` : b.name) : `what’s planned in ${b.name}`;
      opts.push({ key: placeKey({ name: b.name }), target: { name: b.name }, text: what, words: [] });
    }
    const levels = [...new Set(planned.filter((x) => x.level > 0).map((x) => x.level))].sort((a, b) => a - b);
    for (const k of levels) opts.push({ key: placeKey(k), target: k, text: `everything planned on ${levelName(k)}`, words: ['FLOOR'] });
    for (const x of planned) {
      const fw = FIXTURE_WORD[x.kind as FixtureKind];
      const target: Place = x.named ? { name: x.label } : { fixture: fw, n: x.num };
      opts.push({ key: placeKey(target), target, text: siteTitle(s, x), words: x.named ? [] : [fw] });
    }
    return opts;
  }

  /** Stores that exist and builds that are planned, so the menus can be redrawn when one is added, renamed or taken away. */
  private storesSig(): string {
    const stores = this.s.sites
      .filter((x) => (x.kind === 'stockpile' || x.kind === 'shelves' || x.kind === 'pantry' || x.kind === 'bar') && x.num > 0)
      .map((x) => `${x.id}:${x.label}:${x.build ? 0 : 1}`)
      .join('|');
    return `${stores}#${this.buildTargets().map((o) => o.key + o.text).join('|')}`;
  }

  /** The "what" slot of a build line: the whole camp, the tower, or one planned build. */
  private buildSelect(i: number, line: DraftLine): HTMLSelectElement {
    const sel = h('select', { 'aria-label': `Line ${i + 1} what` });
    for (const n of ['CAMP', 'TOWER'] as const) sel.append(h('option', { value: `N:${n}`, disabled: !this.canWrite(n) && n !== line.noun }, this.label(n === 'CAMP' ? 'camp (everything planned)' : 'tower', n)));
    const targets = this.buildTargets();
    const current = line.target ?? null;
    if (current !== null && !targets.some((o) => o.key === placeKey(current))) targets.push({ key: placeKey(current), target: current, text: `${placeName(current)} (nothing planned there now)`, words: [] });
    if (targets.length) {
      const group = h('optgroup', { label: 'One planned build' });
      for (const o of targets) group.append(h('option', { value: `P:${o.key}`, disabled: o.words.some((t) => !this.canWrite(t)) && o.key !== placeKey(current) }, o.text));
      sel.append(group);
    }
    sel.value = current !== null ? `P:${placeKey(current)}` : `N:${line.noun ?? 'CAMP'}`;
    sel.addEventListener('change', () => {
      if (sel.value.startsWith('N:')) {
        line.noun = sel.value.slice(2) as Noun;
        line.target = null;
      } else {
        line.noun = null;
        line.target = targets.find((o) => `P:${o.key}` === sel.value)?.target ?? null;
      }
      this.updateSummary();
    });
    return sel;
  }

  private usePreset(lines: DraftLine[]): void {
    this.lines = lines.map((l) => ({ ...l }));
    this.renderLines();
  }

  private renderLines(): void {
    clear(this.linesEl);
    this.lines.forEach((line, i) => {
      const verbSel = h('select', { 'aria-label': `Line ${i + 1} verb` });
      for (const v of VERB_ORDER) verbSel.append(h('option', { value: v, disabled: !this.canWrite(v) && v !== line.verb }, this.label(VERB_LABEL[v], v)));
      verbSel.value = line.verb;
      verbSel.addEventListener('change', () => {
        line.verb = verbSel.value as Verb;
        line.noun = nounsFor(line.verb)[0] ?? null;
        line.from = null;
        line.to = null;
        line.target = null;
        this.renderLines();
      });
      const nouns = nounsFor(line.verb);
      let nounEl: HTMLElement = h('span', { class: 'slot-empty' });
      if (takesTarget(line.verb)) {
        nounEl = this.buildSelect(i, line);
      } else if (nouns.length > 1) {
        const nounSel = h('select', { 'aria-label': `Line ${i + 1} what` });
        for (const n of nouns) nounSel.append(h('option', { value: n, disabled: !this.canWrite(n) && n !== line.noun }, this.label(wordIn(n, 'en'), n)));
        nounSel.value = line.noun ?? nouns[0];
        nounSel.addEventListener('change', () => {
          line.noun = nounSel.value as Noun;
          // a particular store may not keep the new good (bread doesn't go on a stockpile): start those over
          const keeps = (p: Place | null) => p === null || typeof p !== 'object' || this.storesFor(line.noun).some((x) => placeKey(x.named ? { name: x.label } : { fixture: STORE_WORD[x.kind as keyof typeof STORE_WORD], n: x.num }) === placeKey(p));
          if (!keeps(line.from)) line.from = null;
          if (!keeps(line.to)) line.to = null;
          if (takesPlaces(line.verb)) this.renderLines();
          else this.updateSummary();
        });
        nounEl = nounSel;
      } else if (nouns.length === 1 && line.verb !== 'CHECK') {
        nounEl = h('span', { class: 'slot-fixed' }, nouns[0].toLowerCase());
      }
      const placeEls: HTMLElement[] = [];
      if (takesWho(line.verb)) {
        const whoSel = h('select', { 'aria-label': `Line ${i + 1} who` });
        for (const w of this.s.workers) whoSel.append(h('option', { value: String(w.id) }, w.name));
        if (line.who === undefined || line.who === null) line.who = this.s.workers[0]?.id ?? null;
        whoSel.value = String(line.who);
        whoSel.addEventListener('change', () => ((line.who = Number(whoSel.value)), this.updateSummary()));
        placeEls.push(whoSel);
      }
      if (takesPlaces(line.verb)) {
        placeEls.push(this.placeSelect(i, 'from', line), this.placeSelect(i, 'to', line));
      }
      let countEl: HTMLElement = h('span', { class: 'slot-empty' });
      if (hasCount(line.verb)) {
        // a number, or "all" (until it runs out) / "forever", where those make sense
        if (line.count === ALL && !allowsAll(line.verb)) line.count = 1;
        if (line.count === FOREVER && !allowsForever(line.verb)) line.count = 1;
        const special = isSpecialCount(line.count);
        const inp = h('input', { type: 'number', min: 1, max: 999, value: special ? 1 : line.count, 'aria-label': `Line ${i + 1} count` });
        inp.style.display = special ? 'none' : '';
        inp.addEventListener('input', () => ((line.count = Math.floor(Number(inp.value)) || 1), this.updateSummary()));
        const mode = h('select', { 'aria-label': `Line ${i + 1} how many`, class: 'count-mode' }, h('option', { value: 'n' }, '×'));
        if (allowsAll(line.verb)) mode.append(h('option', { value: 'all', title: 'Until there is nothing left to do' }, 'all'));
        if (allowsForever(line.verb)) mode.append(h('option', { value: 'forever', title: 'Forever' }, '∞'));
        mode.value = line.count === ALL ? 'all' : line.count === FOREVER ? 'forever' : 'n';
        mode.addEventListener('change', () => {
          line.count = mode.value === 'all' ? ALL : mode.value === 'forever' ? FOREVER : Math.floor(Number(inp.value)) || 1;
          this.renderLines();
        });
        countEl = h('label', { class: 'slot-count' }, mode, inp, COUNT_HINT[line.verb] ? h('span', { class: 'hint' }, COUNT_HINT[line.verb]) : '');
      }
      this.linesEl.append(
        h(
          'div',
          { class: 'row compose-line' },
          h('span', { class: 'line-no' }, `${i + 1}.`),
          verbSel,
          nounEl,
          ...placeEls,
          countEl,
          this.lines.length > 1
            ? h('button', { class: 'btn btn-small', title: 'Remove line', onclick: () => (this.lines.splice(i, 1), this.renderLines()) }, '×')
            : '',
        ),
      );
    });
    if (this.lines.length < SCRIBE.maxLines) {
      this.linesEl.append(
        h('button', { class: 'btn btn-small', onclick: () => (this.lines.push({ verb: 'MINE', noun: 'STONE', from: null, to: null, count: 1 }), this.renderLines()) }, '+ Add a line'),
      );
    }
    this.updateSummary();
  }

  private syncWho(): void {
    if (this.whoCount === this.s.workers.length) return;
    const keep = this.whoSel.value;
    clear(this.whoSel);
    for (const w of this.s.workers) this.whoSel.append(h('option', { value: String(w.id) }, w.name));
    this.whoSel.value = keep;
    if (this.whoSel.selectedIndex < 0) this.whoSel.selectedIndex = 0;
    this.whoCount = this.s.workers.length;
  }

  private dest(): Dest {
    if (this.mode === 'anyone') return { kind: 'board', addressee: null };
    if (this.mode === 'named') return { kind: 'board', addressee: Number(this.whoSel.value) };
    return { kind: 'worker', workerId: Number(this.whoSel.value) };
  }

  /** The banner says, in big plain words, where this is going. */
  private renderBanner(): void {
    clear(this.banner);
    const name = this.s.workers.find((w) => String(w.id) === this.whoSel.value)?.name ?? '?';
    if (this.mode === 'anyone') {
      this.banner.append(h('strong', {}, 'Posting on the board'), ' for anyone who’s free');
    } else if (this.mode === 'named') {
      this.banner.append(h('strong', {}, 'Posting on the board'), ' for ', this.whoSel, h('span', { class: 'hint' }, ` only: ${name} will always pick it first`));
    } else {
      this.banner.append(h('strong', {}, 'Handing directly to'), ' ', this.whoSel, h('span', { class: 'hint' }, ': replaces whatever they’re doing'));
    }
  }

  /** Explain in plain words what this will do once it's written and delivered. */
  private updateSummary(): void {
    this.renderBanner();
    const d = this.dest();
    const wage = Math.floor(Number(this.wageIn.value)) || 0;
    const name = (id: number | null) => (id === null ? 'anyone' : this.s.workers.find((w) => w.id === id)?.name ?? '?');
    const first = this.lines[0];
    const notice = d.kind === 'board' && this.lines.length === 1 && isWorkVerb(first.verb);
    const loops = this.lines.some((l) => l.verb === 'REPEAT');
    let text: string;
    if (notice) {
      text = `A notice. ${d.addressee === null ? 'Anyone' : name(d.addressee)} can take one job at a time from it ${first.count === ALL ? 'until there is nothing left to do' : first.count === FOREVER ? 'forever' : `until ${first.count} are done`}.${isSpecialCount(first.count) ? ' Paid from the treasury as the work is done.' : ` Sets aside ${first.count * wage} gold now.`}`;
    } else if (d.kind === 'board') {
      text = `A ${this.lines.length > 1 ? 'scroll' : 'card'} on the board. The first ${d.addressee === null ? 'free worker' : name(d.addressee)} to read it takes it down and carries it out${loops ? ', looping until someone hands them something else' : ''}.`;
    } else if (d.kind === 'worker') {
      text = `Handed straight to ${name(d.workerId)}. It replaces whatever they're doing${loops ? ', and loops until they are handed something else' : ''}.`;
    } else {
      text = 'A blueprint, carried to the top of the tower.';
    }
    if (!notice && wage > 0) text += ` Paid from the treasury as the work is done.`;
    if (this.lines.some((l) => takesWho(l.verb))) text += ' Lessons happen at the scriptorium: the student has to be on the ground to hear their name.';
    if (this.lang !== 'en') text += ` Written in ${langName(this.lang)}: only workers who know these words can read it.`;
    this.summary.textContent = text;
    // how it will actually read, word for word, in the chosen language
    const nameOf = (id: number | null | undefined) => this.s.workers.find((w) => w.id === id)?.name ?? '?';
    const lineWords = this.lines.map((l) => {
      const words = [wordIn(l.verb, this.lang)];
      if (takesWho(l.verb)) words.push(nameOf(l.who));
      if (takesTarget(l.verb) && l.target) words.push(...placeTokens(l.target, this.lang).map(word));
      else if (l.noun && l.verb !== 'CHECK') words.push(wordIn(l.noun, this.lang));
      if (l.verb === 'CHECK') words.push(wordIn('BOARD', this.lang));
      if (takesPlaces(l.verb) && l.from !== null) words.push(wordIn('FROM', this.lang), ...placeTokens(l.from, this.lang).map(word));
      if (takesPlaces(l.verb) && l.to !== null) words.push(wordIn('TO', this.lang), ...placeTokens(l.to, this.lang).map(word));
      return words.join(' ') + (hasCount(l.verb) && (l.count > 1 || isSpecialCount(l.count)) ? ` ×${countText(l.count)}` : '');
    });
    this.preview.textContent = `«${lineWords.join(' → ')}»`;
  }

  private send(): void {
    const r = this.sim.enqueue({
      type: 'compose',
      playerId: 0,
      lines: this.lines.map((l) => ({
        verb: l.verb,
        noun: l.noun,
        who: takesWho(l.verb) ? l.who ?? null : null,
        from: takesPlaces(l.verb) ? l.from : null,
        to: takesPlaces(l.verb) ? l.to : null,
        target: takesTarget(l.verb) ? l.target ?? null : null,
        count: l.count,
      })),
      lang: this.lang,
      wage: Math.floor(Number(this.wageIn.value)),
      dest: this.dest(),
    });
    this.error.textContent = r.ok ? '' : r.error;
  }

  private placesSeen = '';

  refresh(): void {
    this.syncWho();
    if (this.lexSeen !== LANGS.reduce((n, l) => n + (this.s.lexicon[l.id]?.length ?? 0), 0)) {
      this.syncLangs();
      this.renderLines();
    }
    const sig = `${this.s.floors}#${this.storesSig()}`;
    if (this.placesSeen !== sig) {
      this.placesSeen = sig;
      this.renderLines();
    }
    const s = this.s;
    clear(this.queue);
    if (s.designs.length === 0) this.queue.append(h('div', { class: 'hint' }, 'Nothing waiting.'));
    for (const d of s.designs) {
      const writer = s.workers.find((w) => w.id === d.claimedBy);
      const pct = Math.floor((d.progress / d.cost) * 100);
      const status = writer ? `${writer.name} writing, ${pct}%` : d.progress > 0 ? `half-written, ${pct}%` : 'waiting for a scribe';
      this.queue.append(
        h(
          'div',
          { class: 'notice' },
          h('span', { class: 'notice-order' }, cap(carrierText(d.carrier))),
          h('span', { class: 'notice-meta' }, `${cap(d.carrier.kind)} for ${destText(s, d.carrier.dest)} · ${status}`),
          h('button', { class: 'btn btn-small', title: 'Scrap it (refunds promised wages)', onclick: () => this.sim.enqueue({ type: 'cancelDesign', playerId: 0, designId: d.id }) }, '×'),
        ),
      );
    }
    clear(this.transit);
    const rows: HTMLElement[] = [];
    for (const w of s.workers) {
      for (const c of w.bag) {
        rows.push(
          h(
            'div',
            { class: 'notice notice-pending' },
            h('span', { class: 'notice-order' }, cap(carrierText(c))),
            h('span', { class: 'notice-meta' }, `${w.name} is carrying it to ${destText(s, c.dest)}${c.retryAfter > s.tick ? ' (will try again soon)' : ''}`),
          ),
        );
      }
    }
    for (const c of s.outbox) {
      rows.push(
        h('div', { class: 'notice notice-pending' }, h('span', { class: 'notice-order' }, cap(carrierText(c))), h('span', { class: 'notice-meta' }, `In the outbox, for ${destText(s, c.dest)}; waiting for someone who delivers`)),
      );
    }
    if (rows.length === 0) rows.push(h('div', { class: 'hint' }, 'Nothing in anyone’s bag.'));
    this.transit.append(...rows);
  }
}

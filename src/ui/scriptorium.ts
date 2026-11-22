import {
  carrierText,
  destText,
  SCRIBE,
  SCROLL_LINES,
  VALID_JOBS,
  isWorkVerb,
  type Dest,
  type Noun,
  type Sim,
  type SimState,
  type Verb,
} from '../sim';
import { clear, h } from './dom';
import type { WindowManager } from './windows';

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface DraftLine {
  verb: Verb;
  noun: Noun | null;
  count: number;
}

const VERB_LABEL: Record<Verb, string> = {
  MINE: 'Mine',
  CHOP: 'Chop',
  HARVEST: 'Harvest',
  COOK: 'Cook',
  HAUL: 'Haul',
  WRITE: 'Write',
  DELIVER: 'Deliver',
  CHECK: 'Check the board',
  REPEAT: 'Repeat from the top',
};

/** What the second slot holds for each verb. Places (from/to) come with the tower. */
function nounsFor(verb: Verb): readonly Noun[] {
  if (isWorkVerb(verb)) return VALID_JOBS[verb];
  if (verb === 'CHECK') return ['BOARD'];
  return [];
}

const COUNT_HINT: Partial<Record<Verb, string>> = {
  WRITE: 'designs',
  DELIVER: '',
};

function hasCount(verb: Verb): boolean {
  return verb !== 'REPEAT' && verb !== 'CHECK' && verb !== 'DELIVER';
}

const VERB_ORDER: Verb[] = [...new Set(SCROLL_LINES.map((l) => l.verb))];

const PRESETS: { label: string; lines: DraftLine[] }[] = [
  {
    label: 'Notice: mine ×20',
    lines: [{ verb: 'MINE', noun: 'STONE', count: 20 }],
  },
  {
    label: 'Scribe loop',
    lines: [
      { verb: 'WRITE', noun: null, count: 1 },
      { verb: 'DELIVER', noun: null, count: 1 },
      { verb: 'REPEAT', noun: null, count: 1 },
    ],
  },
  {
    label: 'Mine & haul loop',
    lines: [
      { verb: 'MINE', noun: 'STONE', count: 2 },
      { verb: 'HAUL', noun: 'STONE', count: 2 },
      { verb: 'REPEAT', noun: null, count: 1 },
    ],
  },
  {
    label: 'Farm & cook loop',
    lines: [
      { verb: 'HARVEST', noun: 'GRAIN', count: 2 },
      { verb: 'HAUL', noun: 'GRAIN', count: 2 },
      { verb: 'COOK', noun: 'BREAD', count: 2 },
      { verb: 'REPEAT', noun: null, count: 1 },
    ],
  },
  {
    label: 'Release (check the board)',
    lines: [{ verb: 'CHECK', noun: 'BOARD', count: 1 }],
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
  private howSel: HTMLSelectElement;
  private whoSel: HTMLSelectElement;
  private summary: HTMLElement;
  private error: HTMLElement;
  private whoCount = -1;

  constructor(
    private wm: WindowManager,
    private sim: Sim,
  ) {
    const win = wm.create('scriptorium', 'Scriptorium', 390, 34, 400);
    this.queue = h('div', { class: 'notices' });
    this.transit = h('div', { class: 'notices' });
    this.linesEl = h('div', { class: 'compose-lines' });
    this.wageIn = h('input', { type: 'number', min: 0, max: 50, value: 2, 'aria-label': 'Wage per unit', oninput: () => this.updateSummary() });
    this.howSel = h(
      'select',
      { 'aria-label': 'Delivery', onchange: () => ((this.whoCount = -1), this.syncWho(), this.updateSummary()) },
      h('option', { value: 'board' }, 'Post on the board'),
      h('option', { value: 'hand' }, 'Hand it to'),
    );
    this.whoSel = h('select', { 'aria-label': 'For', onchange: () => this.updateSummary() });
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
      h('div', { class: 'section-label' }, 'Compose'),
      presets,
      this.linesEl,
      h('div', { class: 'row' }, this.howSel, this.whoSel, h('label', {}, 'Wage', this.wageIn, 'g per unit')),
      this.summary,
      h('div', { class: 'row row-end' }, this.error, h('button', { class: 'btn btn-default', onclick: () => this.send() }, 'Send to scribe')),
    );
    this.syncWho();
    this.renderLines();
  }

  private get s(): SimState {
    return this.sim.state;
  }

  /** Open the composer with a worker preselected, as a notice for them or a scroll handed to them. */
  openFor(workerId: number, how: 'board' | 'hand'): void {
    this.howSel.value = how;
    this.whoCount = -1;
    this.syncWho();
    this.whoSel.value = String(workerId);
    this.updateSummary();
    this.wm.show('scriptorium');
  }

  open(): void {
    this.wm.show('scriptorium');
  }

  private usePreset(lines: DraftLine[]): void {
    this.lines = lines.map((l) => ({ ...l }));
    this.renderLines();
  }

  private renderLines(): void {
    clear(this.linesEl);
    this.lines.forEach((line, i) => {
      const verbSel = h('select', { 'aria-label': `Line ${i + 1} verb` });
      for (const v of VERB_ORDER) verbSel.append(h('option', { value: v }, VERB_LABEL[v]));
      verbSel.value = line.verb;
      verbSel.addEventListener('change', () => {
        line.verb = verbSel.value as Verb;
        line.noun = nounsFor(line.verb)[0] ?? null;
        this.renderLines();
      });
      const nouns = nounsFor(line.verb);
      let nounEl: HTMLElement = h('span', { class: 'slot-empty' });
      if (nouns.length > 1) {
        const nounSel = h('select', { 'aria-label': `Line ${i + 1} what` });
        for (const n of nouns) nounSel.append(h('option', { value: n }, n.toLowerCase()));
        nounSel.value = line.noun ?? nouns[0];
        nounSel.addEventListener('change', () => ((line.noun = nounSel.value as Noun), this.updateSummary()));
        nounEl = nounSel;
      } else if (nouns.length === 1 && line.verb !== 'CHECK') {
        nounEl = h('span', { class: 'slot-fixed' }, nouns[0].toLowerCase());
      }
      let countEl: HTMLElement = h('span', { class: 'slot-empty' });
      if (hasCount(line.verb)) {
        const inp = h('input', { type: 'number', min: 1, max: 999, value: line.count, 'aria-label': `Line ${i + 1} count` });
        inp.addEventListener('input', () => ((line.count = Math.floor(Number(inp.value)) || 1), this.updateSummary()));
        countEl = h('label', { class: 'slot-count' }, '×', inp, COUNT_HINT[line.verb] ? h('span', { class: 'hint' }, COUNT_HINT[line.verb]) : '');
      }
      this.linesEl.append(
        h(
          'div',
          { class: 'row compose-line' },
          h('span', { class: 'line-no' }, `${i + 1}.`),
          verbSel,
          nounEl,
          countEl,
          this.lines.length > 1
            ? h('button', { class: 'btn btn-small', title: 'Remove line', onclick: () => (this.lines.splice(i, 1), this.renderLines()) }, '×')
            : '',
        ),
      );
    });
    if (this.lines.length < SCRIBE.maxLines) {
      this.linesEl.append(
        h('button', { class: 'btn btn-small', onclick: () => (this.lines.push({ verb: 'MINE', noun: 'STONE', count: 1 }), this.renderLines()) }, '+ Add a line'),
      );
    }
    this.updateSummary();
  }

  private syncWho(): void {
    if (this.whoCount === this.s.workers.length) return;
    const keep = this.whoSel.value;
    clear(this.whoSel);
    if (this.howSel.value === 'board') this.whoSel.append(h('option', { value: '' }, 'for Anyone'));
    for (const w of this.s.workers) this.whoSel.append(h('option', { value: String(w.id) }, this.howSel.value === 'board' ? `for ${w.name}` : w.name));
    this.whoSel.value = keep;
    if (this.whoSel.selectedIndex < 0) this.whoSel.selectedIndex = 0;
    this.whoCount = this.s.workers.length;
  }

  private dest(): Dest {
    if (this.howSel.value === 'board') return { kind: 'board', addressee: this.whoSel.value === '' ? null : Number(this.whoSel.value) };
    return { kind: 'worker', workerId: Number(this.whoSel.value) };
  }

  /** Explain in plain words what this will do once it's written and delivered. */
  private updateSummary(): void {
    const d = this.dest();
    const wage = Math.floor(Number(this.wageIn.value)) || 0;
    const name = (id: number | null) => (id === null ? 'anyone' : this.s.workers.find((w) => w.id === id)?.name ?? '?');
    const first = this.lines[0];
    const notice = d.kind === 'board' && this.lines.length === 1 && isWorkVerb(first.verb);
    const loops = this.lines.some((l) => l.verb === 'REPEAT');
    let text: string;
    if (notice) {
      text = `A notice. ${d.addressee === null ? 'Anyone' : name(d.addressee)} can take one job at a time from it until ${first.count} are done. Sets aside ${first.count * wage} gold now.`;
    } else if (d.kind === 'board') {
      text = `A ${this.lines.length > 1 ? 'scroll' : 'card'} on the board. The first ${d.addressee === null ? 'free worker' : name(d.addressee)} to read it takes it down and carries it out${loops ? ', looping until someone hands them something else' : ''}.`;
    } else {
      text = `Handed straight to ${name(d.workerId)}. It replaces whatever they're doing${loops ? ', and loops until they are handed something else' : ''}.`;
    }
    if (!notice && wage > 0) text += ` Paid from the treasury as the work is done.`;
    this.summary.textContent = text;
  }

  private send(): void {
    const r = this.sim.enqueue({
      type: 'compose',
      playerId: 0,
      lines: this.lines.map((l) => ({ verb: l.verb, noun: l.noun, count: l.count })),
      wage: Math.floor(Number(this.wageIn.value)),
      dest: this.dest(),
    });
    this.error.textContent = r.ok ? '' : r.error;
  }

  refresh(): void {
    this.syncWho();
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

import { carrierText, destText, SCRIBE, SCROLL_LINES, orderText, makeOrder, type LineOption, type Sim, type SimState } from '../sim';
import { clear, h } from './dom';
import type { WindowManager } from './windows';

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const LINE_HINTS: Partial<Record<string, string>> = {
  WRITE: 'Write (next design in the queue)',
  DELIVER: 'Deliver (everything in their bag)',
  CHECK: 'Check the board (then the scroll is done)',
  REPEAT: 'Repeat from the top',
};

function lineLabel(l: LineOption): string {
  return LINE_HINTS[l.verb] ?? cap(orderText(makeOrder(l.verb, l.noun)));
}

const PRESETS: { label: string; lines: number[] }[] = [
  { label: 'Scribe loop', lines: [idx('WRITE'), idx('DELIVER'), idx('REPEAT')] },
  { label: 'Mine & haul loop', lines: [idx('MINE', 'STONE'), idx('HAUL', 'STONE'), idx('REPEAT')] },
  { label: 'Farm & cook loop', lines: [idx('HARVEST', 'GRAIN'), idx('HAUL', 'GRAIN'), idx('COOK', 'BREAD'), idx('REPEAT')] },
];

function idx(verb: string, noun: string | null = null): number {
  return SCROLL_LINES.findIndex((l) => l.verb === verb && l.noun === noun);
}

/**
 * The scriptorium: what's waiting to be written, what's in couriers' bags,
 * and a composer for scrolls addressed to a worker by name.
 */
export class ScriptoriumPanel {
  private queue: HTMLElement;
  private transit: HTMLElement;
  private linesEl: HTMLElement;
  private lines: number[] = [idx('MINE', 'STONE'), idx('HAUL', 'STONE'), idx('REPEAT')];
  private wageIn: HTMLInputElement;
  private toSel: HTMLSelectElement;
  private error: HTMLElement;
  private toCount = -1;

  constructor(
    private wm: WindowManager,
    private sim: Sim,
  ) {
    const win = wm.create('scriptorium', 'Scriptorium', 390, 34, 380);
    this.queue = h('div', { class: 'notices' });
    this.transit = h('div', { class: 'notices' });
    this.linesEl = h('div', { class: 'compose-lines' });
    this.wageIn = h('input', { type: 'number', min: 0, max: 50, value: 1, 'aria-label': 'Wage per unit' });
    this.toSel = h('select', { 'aria-label': 'For' });
    this.error = h('div', { class: 'error', role: 'alert' });
    const presets = h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Start from:'));
    for (const p of PRESETS) {
      presets.append(
        h('button', { class: 'btn btn-small', onclick: () => ((this.lines = [...p.lines]), this.renderLines()) }, p.label),
      );
    }
    win.body.append(
      h('div', { class: 'section-label' }, 'Waiting to be written'),
      this.queue,
      h('div', { class: 'section-label' }, 'Written, on the way'),
      this.transit,
      h('div', { class: 'section-label' }, 'Write a scroll for someone'),
      presets,
      this.linesEl,
      h('div', { class: 'row' }, h('label', {}, 'Wage', this.wageIn, 'g per unit'), h('label', {}, 'For', this.toSel)),
      h('div', { class: 'hint' }, 'Paid from the treasury as each line is done. Delivered by hand: whoever has DELIVER on their scroll brings it.'),
      h('div', { class: 'row row-end' }, this.error, h('button', { class: 'btn btn-default', onclick: () => this.send() }, 'Send to scribe')),
    );
    this.renderLines();
  }

  private get s(): SimState {
    return this.sim.state;
  }

  openFor(workerId: number): void {
    this.syncTo();
    this.toSel.value = String(workerId);
    this.wm.show('scriptorium');
  }

  private renderLines(): void {
    clear(this.linesEl);
    this.lines.forEach((li, i) => {
      const sel = h('select', { 'aria-label': `Line ${i + 1}`, onchange: (e) => (this.lines[i] = Number((e.target as HTMLSelectElement).value)) });
      SCROLL_LINES.forEach((l, j) => sel.append(h('option', { value: j }, lineLabel(l))));
      sel.value = String(li);
      this.linesEl.append(
        h(
          'div',
          { class: 'row compose-line' },
          h('span', { class: 'line-no' }, `${i + 1}.`),
          sel,
          h('button', { class: 'btn btn-small', title: 'Remove line', onclick: () => (this.lines.splice(i, 1), this.renderLines()) }, '×'),
        ),
      );
    });
    if (this.lines.length < SCRIBE.maxLines) {
      this.linesEl.append(
        h('button', { class: 'btn btn-small', onclick: () => (this.lines.push(0), this.renderLines()) }, '+ Add a line'),
      );
    }
  }

  private syncTo(): void {
    if (this.toCount === this.s.workers.length) return;
    const keep = this.toSel.value;
    clear(this.toSel);
    for (const w of this.s.workers) this.toSel.append(h('option', { value: String(w.id) }, w.name));
    if (keep) this.toSel.value = keep;
    this.toCount = this.s.workers.length;
  }

  private send(): void {
    const r = this.sim.enqueue({
      type: 'sendScroll',
      playerId: 0,
      lines: this.lines.map((i) => ({ verb: SCROLL_LINES[i].verb, noun: SCROLL_LINES[i].noun })),
      wage: Math.floor(Number(this.wageIn.value)),
      to: Number(this.toSel.value),
    });
    this.error.textContent = r.ok ? '' : r.error;
  }

  refresh(): void {
    this.syncTo();
    const s = this.s;
    clear(this.queue);
    if (s.designs.length === 0) this.queue.append(h('div', { class: 'hint' }, 'Nothing waiting.'));
    for (const d of s.designs) {
      const writer = s.workers.find((w) => w.id === d.claimedBy);
      const status = writer ? `${writer.name} writing, ${Math.floor((d.progress / d.cost) * 100)}%` : d.progress > 0 ? `half-written, ${Math.floor((d.progress / d.cost) * 100)}%` : 'waiting for a scribe';
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
    let any = false;
    for (const w of s.workers) {
      for (const c of w.bag) {
        any = true;
        this.transit.append(
          h(
            'div',
            { class: 'notice notice-pending' },
            h('span', { class: 'notice-order' }, cap(carrierText(c))),
            h('span', { class: 'notice-meta' }, `${w.name} is carrying it to ${destText(s, c.dest)}${c.retryAfter > s.tick ? ' (will try again soon)' : ''}`),
          ),
        );
      }
    }
    if (!any) this.transit.append(h('div', { class: 'hint' }, 'Nothing in anyone’s bag.'));
  }
}

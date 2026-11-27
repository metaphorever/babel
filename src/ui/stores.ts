import { ALERTS, goodHoldings, ITEM_TYPES, type ItemType, type Sim, type SimState, type Site } from '../sim';
import { siteTitle } from '../sim/world';
import { clear, h } from './dom';
import type { WindowManager } from './windows';

/**
 * The Stores window (§16.9 step 6): a total per good, stored and lying
 * around, that opens out to every store holding it, and the line under which
 * the colony's total raises an alert. An alert for one store isn't free: that
 * takes a flag and the word REPORT (with flags and bells).
 */
export class StoresPanel {
  private body: HTMLElement;
  /** Goods opened out to show each store. */
  private open = new Set<ItemType>();
  /** Lines set but not yet taken on by the sim (it applies commands on its next tick, and the game may be paused). */
  private pending: Partial<Record<ItemType, number>> = {};

  constructor(
    wm: WindowManager,
    private sim: Sim,
    /** Centre the view on a store and open its window. */
    private showSite: (site: Site) => void,
  ) {
    const win = wm.create('stores', 'Stores', 390, 34, 320);
    this.body = h('div');
    win.body.append(this.body);
  }

  private get s(): SimState {
    return this.sim.state;
  }

  private toggle(g: ItemType): void {
    if (this.open.has(g)) this.open.delete(g);
    else this.open.add(g);
    this.refresh(true);
  }

  /**
   * Redraw, but only when what it shows has changed (rebuilding under the
   * mouse swallows clicks), and never while an alert line is being typed.
   */
  refresh(force = false): void {
    const typing = document.activeElement instanceof HTMLInputElement && this.body.contains(document.activeElement);
    if (typing && !force) return;
    const next = this.render();
    if (!force && next.innerHTML === this.body.innerHTML) return;
    clear(this.body);
    this.body.append(...next.childNodes);
  }

  private render(): HTMLElement {
    const s = this.s;
    const out = h('div');
    const t = h('table', { class: 'stores' });
    t.append(
      h(
        'tr',
        {},
        h('th', {}, ''),
        h('th', { class: 'num' }, 'Stored'),
        h('th', { class: 'num', title: 'Dropped on the ground: still usable, but workers would rather take from a store.' }, 'Lying around'),
        h('th', { class: 'num', title: 'An alert when the whole colony has fewer than this. 0: never. 1: when it has all run out.' }, 'Alert below'),
      ),
    );
    for (const g of ITEM_TYPES) {
      if (this.pending[g] === s.alertBelow[g]) delete this.pending[g];
      const setting = this.pending[g] ?? s.alertBelow[g];
      const { stores, loose } = goodHoldings(s, g);
      const stored = stores.reduce((n, x) => n + x.n, 0);
      const opened = this.open.has(g);
      const low = s.supplyOut.includes(g) && stored + loose < s.alertBelow[g];
      const line = h('input', {
        type: 'number',
        min: 0,
        max: ALERTS.supplyBelowMax,
        step: 1,
        value: setting,
        class: 'alert-line',
        'aria-label': `Alert when ${g} is below`,
        onclick: (e) => e.stopPropagation(),
        onchange: () => this.setLine(g, line),
        onkeydown: (e) => {
          if ((e as KeyboardEvent).key === 'Enter') line.blur();
        },
      });
      t.append(
        h(
          'tr',
          { class: `store-good${low ? ' store-low' : ''}`, title: opened ? 'Hide the stores' : 'Show every store holding it', onclick: () => this.toggle(g) },
          h('td', {}, h('span', { class: 'disclosure' }, opened ? '▾' : '▸'), ` ${cap(g)}`, low ? h('span', { class: 'hint' }, s.alertBelow[g] <= 1 ? ' all gone' : ' low') : ''),
          h('td', { class: 'num' }, stored),
          h('td', { class: 'num' }, loose),
          h('td', { class: 'num' }, line),
        ),
      );
      if (!opened) continue;
      if (stores.length === 0 && loose === 0) t.append(h('tr', { class: 'store-site' }, h('td', { class: 'hint', colspan: 4 }, `No ${g} anywhere.`)));
      for (const { site, n } of stores) {
        t.append(
          h(
            'tr',
            { class: 'store-site' },
            h('td', {}, siteTitle(s, site), site.supplies ? h('span', { class: 'hint' }, ' (take only)') : site.demolish ? h('span', { class: 'hint' }, ' (coming down)') : ''),
            h('td', { class: 'num' }, n),
            h('td', {}, ''),
            h('td', { class: 'num' }, h('button', { class: 'btn btn-small', title: 'Go there and open its window', onclick: () => this.showSite(site) }, 'Show')),
          ),
        );
      }
      if (loose > 0) t.append(h('tr', { class: 'store-site' }, h('td', { class: 'hint' }, 'Lying around'), h('td', {}, ''), h('td', { class: 'num' }, loose), h('td', {}, '')));
    }
    // room left in the stockpiles and shelves (what stone, wood and grain go in)
    const room = s.sites.filter((x) => (x.kind === 'stockpile' || x.kind === 'shelves') && x.build === null && !x.supplies);
    const capacity = room.reduce((n, x) => n + (x.capacity ?? 0), 0);
    const used = room.reduce((n, x) => n + x.store.stone + x.store.wood + x.store.grain, 0);
    out.append(
      t,
      h('div', { class: 'hint' }, room.length ? `Stockpiles and shelves: ${used} of ${capacity} full.` : 'No stockpiles yet. Goods lying around can still be used, but workers would rather take from a stockpile.'),
      h('div', { class: 'hint' }, 'Click a good to see every store holding it. An alert line counts the whole colony; to hear about one store you’ll need a flag and someone to report it (not in yet).'),
    );
    return out;
  }

  private setLine(g: ItemType, input: HTMLInputElement): void {
    const n = Math.round(Number(input.value));
    const below = Number.isFinite(n) ? Math.max(0, Math.min(ALERTS.supplyBelowMax, n)) : this.s.alertBelow[g];
    if (this.sim.enqueue({ type: 'setAlertBelow', playerId: 0, good: g, below }).ok) this.pending[g] = below;
    input.value = String(this.pending[g] ?? this.s.alertBelow[g]);
  }
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

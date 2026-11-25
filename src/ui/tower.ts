import { currentStipend, floorName, type Sim, type SimState } from '../sim';
import { activeProject, projectFraction, standRow } from '../sim/tower';
import { siteTitle } from '../sim/world';
import { bar, clear, h } from './dom';
import type { WindowManager } from './windows';

/**
 * The tower at a glance: how tall it is, the floor under way and what it
 * still needs, blueprints on their way up, and what each floor has stored.
 */
export class TowerPanel {
  private body: HTMLElement;
  private error: HTMLElement;

  constructor(
    wm: WindowManager,
    private sim: Sim,
    private goTo: (x: number, y: number) => void,
  ) {
    const win = wm.create('tower', 'Tower', -336, 34, 320);
    this.body = h('div');
    this.error = h('div', { class: 'error', role: 'alert' });
    win.body.append(
      this.body,
      h(
        'div',
        { class: 'row row-end' },
        this.error,
        h('button', { class: 'btn', onclick: () => this.s.tower && this.goTo((this.s.tower.x0 + this.s.tower.x1) / 2, standRow(this.s.floors)) }, 'Go to the top'),
        h('button', { class: 'btn btn-default', onclick: () => this.blueprint() }, 'Draw a blueprint'),
      ),
    );
  }

  private get s(): SimState {
    return this.sim.state;
  }

  private blueprint(): void {
    const r = this.sim.enqueue({ type: 'blueprint', playerId: 0 });
    this.error.textContent = r.ok ? '' : r.error;
  }

  refresh(): void {
    const s = this.s;
    clear(this.body);
    const kv = (k: string, v: Node | string) => h('div', { class: 'kv' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
    this.body.append(kv('Height', s.floors === 0 ? 'Nothing built yet' : `${s.floors} ${s.floors === 1 ? 'level' : 'levels'}, up to ${floorName(s.floors, true)}`));
    this.body.append(kv('Patron’s goal', 'Tower Level 30: catch a cloud in a jar'));
    this.body.append(
      h('div', { class: 'section-label' }, 'The patron'),
      h('div', { class: 'need' }, h('span', { class: 'k' }, 'Patience'), bar(s.patience), h('span', { class: 'num' }, `${Math.round(s.patience)}%`)),
      kv('Stipend', s.patience > 0 ? `${currentStipend(s)} gold each dawn` : 'Stopped until the tower grows'),
      kv('Difficulty', s.difficulty),
      h('div', { class: 'hint' }, 'Patience drains steadily. Each finished level wins some back and brings a bonus. While the patron is pleased, newcomers arrive on the road.'),
    );

    const p = activeProject(s);
    this.body.append(h('div', { class: 'section-label' }, 'Under construction'));
    if (p) {
      this.body.append(
        h('div', { class: 'need' }, h('span', { class: 'k' }, floorName(p.level, true)), bar(projectFraction(p) * 100), h('span', { class: 'num' }, `${Math.floor(projectFraction(p) * 100)}%`)),
        kv('Stone', `${p.placed.stone} / ${p.needs.stone} set (walls)`),
        kv('Wood', `${p.placed.wood} / ${p.needs.wood} set (deck)`),
      );
      const builders = s.workers.filter((w) => {
        const order = w.activity.kind === 'job' ? w.memory?.order : w.activity.kind === 'scroll' ? w.held[0]?.orders[w.held[0].pc] : undefined;
        return order?.[0].t === 'BUILD';
      });
      this.body.append(kv('Builders', builders.length ? builders.map((w) => w.name).join(', ') : 'nobody yet: post a “build tower” notice'));
    } else {
      this.body.append(h('div', { class: 'hint' }, 'Nothing under way. A blueprint has to be written and carried to the top before anyone can build.'));
    }
    for (const q of s.projects.slice(1)) this.body.append(kv(floorName(q.level, true), 'planned, waiting its turn'));

    // blueprints still in the scriptorium or on their way up
    const writing = s.designs.filter((d) => d.carrier.kind === 'blueprint').length;
    const carrying = s.workers.reduce((n, w) => n + w.bag.filter((c) => c.kind === 'blueprint').length, 0) + s.outbox.filter((c) => c.kind === 'blueprint').length;
    if (writing || carrying) {
      this.body.append(kv('Blueprints', [writing ? `${writing} being drawn` : '', carrying ? `${carrying} on the way up` : ''].filter(Boolean).join(', ')));
    }

    this.body.append(h('div', { class: 'section-label' }, 'Stockpiles'));
    const t = h('table', { class: 'stores' });
    t.append(h('tr', {}, h('th', {}, ''), h('th', {}, 'Stone'), h('th', {}, 'Wood'), h('th', {}, 'Grain')));
    const piles = s.sites.filter((x) => x.kind === 'stockpile' || x.kind === 'shelves').sort((a, b) => b.level - a.level);
    for (const sp of piles) {
      t.append(
        h(
          'tr',
          {},
          h('td', {}, siteTitle(s, sp)),
          h('td', { class: 'num' }, sp.store.stone),
          h('td', { class: 'num' }, sp.store.wood),
          h('td', { class: 'num' }, sp.store.grain),
        ),
      );
    }
    this.body.append(t, h('div', { class: 'hint' }, 'Builders fetch from the highest stockpile below the level they’re building. Each level starts as an empty room: place a ladder up to it, and a stockpile in it, then haul stone and wood up so builders don’t have to climb all the way down.'));
  }
}

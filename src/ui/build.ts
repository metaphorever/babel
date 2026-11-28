import { goneState, goldText, headcount, recruitError, recruitFee, ALL, BONUS, BUILD, ECONOMY, availableGold, driftLine, bonusLift, FIXTURE_LABEL, FIXTURE_WORD, PATRON, TOWER, floorName, levelName, currentStipend, type Building, type FixtureKind, type Place, type Sim, type SimState, type Site, type SaveUi } from '../sim';
import { fixtureWidth, footprint, houseCost, placeCost, towerSiteWaiting, worksFraction, type PlaceRequest } from '../sim/build';
import { barMood } from '../sim/activities';
import { deckRow } from '../sim/tower';
import { buildingLabel, groundRow, inTowerSpan, siteTitle, storedTotal, storyOfRow } from '../sim/world';
import { buildingHeight, TILE, type Renderer, type Thing } from '../render/renderer';
import { clear, h } from './dom';
import { flavor, type FlavorWord } from './flavor';
import type { DraftLine, ScriptoriumPanel } from './scriptorium';
import type { WindowManager } from './windows';
import { ALERT_KIND_TEXT, isMuted, readMutes, writeMutes } from './alerts';

// Building, from the player's side: the Build window, placement mode (a
// shaded preview that follows the mouse, with an X on every tile in the
// way), the "are you sure?" dialog, demolish mode, a window for whatever
// building or fixture you click, the opening text, and the tutorials.

export type Placing =
  | { what: 'scriptorium' }
  | { what: 'tower' }
  | { what: 'house'; width: number; stories: 1 | 2 }
  | { what: 'fixture'; fixture: FixtureKind };

const FIXTURES: FixtureKind[] = ['bed', 'oven', 'pantry', 'brewery', 'bar', 'stockpile', 'shelves', 'ladder', 'wheelbarrow', 'cart'];

function costText(c: { stone: number; wood: number }): string {
  const parts = [c.wood ? `${c.wood} wood` : '', c.stone ? `${c.stone} stone` : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing';
}

function placingName(p: Placing): string {
  switch (p.what) {
    case 'scriptorium':
      return 'Scriptorium';
    case 'tower':
      return 'Tower';
    case 'house':
      return 'Building';
    case 'fixture':
      return FIXTURE_LABEL[p.fixture];
  }
}

export interface BuildHooks {
  centerOnTile(x: number, y: number): void;
  /** Select a worker and open their window (from an alert). */
  showWorker?(id: number): void;
  /** Leave this game for a new one (until the title screen, step 9, exists). */
  quitGame?(): void;
}

export class BuildUi {
  placing: Placing | null = null;
  demolishing = false;
  /** What the mouse is over in placement mode (the last request tried). */
  private req: PlaceRequest | null = null;
  private modalEl: HTMLElement | null = null;
  private palette!: HTMLElement;
  private status!: HTMLElement;
  private infoBody!: HTMLElement;
  private infoTarget: Thing | null = null;
  private tutorial: Tutorial;
  private sawCharter = false;
  private openingShown = false;

  constructor(
    private root: HTMLElement,
    private wm: WindowManager,
    private sim: Sim,
    private renderer: Renderer,
    private scriptorium: ScriptoriumPanel,
    private hooks: BuildHooks,
  ) {
    this.buildPalette();
    const info = this.wm.create('thing', 'Building', 390, 300, 300);
    this.infoBody = info.body;
    this.tutorial = new Tutorial(wm, sim, this);
    this.sawCharter = this.s.charter;
  }

  private get s(): SimState {
    return this.sim.state;
  }

  // -------------------------------------------------------- the Build window

  private buildPalette(): void {
    const win = this.wm.create('build', 'Build', 16, 300, 300);
    this.palette = h('div');
    this.status = h('div', { class: 'build-status', role: 'status' });
    win.body.append(this.palette, this.status);
    this.renderPalette();
  }

  /** Redraw the Build window, only if it changed (rebuilding it under the mouse would swallow clicks). */
  private renderPalette(): void {
    const next = h('div');
    this.fillPalette(next);
    if (next.innerHTML === this.palette.innerHTML) return;
    clear(this.palette);
    this.palette.append(...next.childNodes);
  }

  private fillPalette(into: HTMLElement): void {
    const s = this.s;
    const hasDesk = s.sites.some((x) => x.kind === 'scriptorium');
    if (!hasDesk) {
      into.append(
        h('p', {}, 'First, the scriptorium and the job board. They go up together, with the board by the door.'),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-default', onclick: () => this.start({ what: 'scriptorium' }) }, 'Place the scriptorium…')),
      );
      return;
    }
    if (!s.tower) {
      into.append(
        h('div', { class: 'section-label' }, 'The tower'),
        h('p', { class: 'hint' }, 'Choose where the tower stands. It can never be moved.'),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-default', onclick: () => this.start({ what: 'tower' }) }, 'Choose the tower site…')),
      );
    }
    const p = this.placing;
    const width = p?.what === 'house' ? p.width : BUILD.house.defaultWidth;
    const stories = p?.what === 'house' ? p.stories : 1;
    const houseBtn = h('button', { class: `btn${p?.what === 'house' ? ' on' : ''}`, onclick: () => this.start({ what: 'house', width, stories }) }, 'Building');
    const setHouse = (w: number, st: 1 | 2) => {
      const nw = Math.max(BUILD.house.minWidth, Math.min(BUILD.house.maxWidth, w));
      this.start({ what: 'house', width: nw, stories: st });
    };
    into.append(
      h('div', { class: 'section-label' }, 'Buildings'),
      h(
        'div',
        { class: 'row build-row' },
        houseBtn,
        h('span', { class: 'hint' }, 'width'),
        h('button', { class: 'btn btn-small', title: 'Narrower ([)', onclick: () => setHouse(width - 1, stories) }, '−'),
        h('span', { class: 'num' }, width),
        h('button', { class: 'btn btn-small', title: 'Wider (])', onclick: () => setHouse(width + 1, stories) }, '+'),
        h('button', { class: 'btn btn-small', title: 'One or two stories', onclick: () => setHouse(width, stories === 1 ? 2 : 1) }, stories === 1 ? '1 story' : '2 stories'),
      ),
      h('div', { class: 'hint' }, `An empty wooden shell: ${costText(houseCost(width, stories))}.`),
      h(
        'div',
        {
          class: 'section-label tip',
          title: `Fixtures go inside a building or a tower room. You can plan them before the building (or the tower level) is finished: they go in once it's up. A stockpile can also be marked out on open ground (it holds ${BUILD.capacity.stockpile} anywhere); shelves hold ${BUILD.capacity.shelves}, indoors only. Each tower level starts as an empty room: a ladder from the room below is the way up to it.`,
        },
        'Fixtures ⓘ',
      ),
    );
    const grid = h('div', { class: 'fixture-grid' });
    for (const f of FIXTURES) {
      const on = p?.what === 'fixture' && p.fixture === f;
      grid.append(
        h(
          'button',
          { class: `btn fixture-btn${on ? ' on' : ''}`, title: `${FIXTURE_LABEL[f]}: ${costText(BUILD.fixtures[f].cost)}`, onclick: () => this.start({ what: 'fixture', fixture: f }) },
          FIXTURE_LABEL[f],
          h('span', { class: 'hint' }, costText(BUILD.fixtures[f].cost)),
        ),
      );
    }
    into.append(grid);
    if (s.tower) {
      const planned = s.floors + s.projects.length + s.designs.filter((d) => d.carrier.kind === 'blueprint').length;
      into.append(
        h('div', { class: 'section-label tip', title: 'Each level is built from a blueprint. A courier (DELIVER) carries it to the top of the tower; then “build tower” work raises the level. You can draw blueprints ahead: they wait until they’re needed.' }, 'The tower ⓘ'),
        h(
          'div',
          { class: 'row build-row' },
          h('button', { class: 'btn', onclick: () => this.drawBlueprint() }, 'Draw a blueprint'),
          h('span', { class: 'hint' }, `${s.floors} built${planned > s.floors ? `, ${planned - s.floors} more planned` : ''}`),
        ),
      );
    }
    into.append(
      h(
        'div',
        { class: 'row row-end', title: 'Placing only lays out the plan. Workers build it once someone posts build work: “build camp” for everything outside the tower, “build fixtures in tower” for what’s inside it.' },
        h('button', { class: `btn${this.demolishing ? ' on' : ''}`, onclick: () => this.startDemolish() }, 'Demolish…'),
        h('button', { class: 'btn', onclick: () => this.scriptorium.openDraft([{ verb: 'BUILD', noun: 'CAMP', from: null, to: null, count: -1 }]) }, 'Write “build camp”…'),
        h('button', { class: 'btn', onclick: () => this.scriptorium.openDraft([{ verb: 'BUILD', noun: 'FIXTURES', within: 'tower', from: null, to: null, count: -1 }]) }, 'Write “build fixtures in tower”…'),
      ),
    );
  }

  // --------------------------------------------------------- placement mode

  start(p: Placing): void {
    this.stopDemolish();
    this.placing = p;
    this.req = null;
    this.wm.show('build');
    this.renderPalette();
    this.say(`Placing: ${placingName(p)}. Click where it should go. Esc to cancel.${p.what === 'house' ? ' [ and ] change the width.' : ''}`);
  }

  cancel(): void {
    this.placing = null;
    this.req = null;
    this.renderer.ghost = null;
    this.renderPalette();
    this.say('');
    // the scriptorium has to go somewhere before anything else can happen
    if (this.needsOpening()) this.showOpening();
  }

  /** [ and ] while placing a building. */
  nudgeWidth(d: number): void {
    const p = this.placing;
    if (p?.what !== 'house') return;
    this.start({ ...p, width: Math.max(BUILD.house.minWidth, Math.min(BUILD.house.maxWidth, p.width + d)) });
  }

  private say(text: string, error = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('error', error);
  }

  private request(p: Placing, wx: number, wy: number): PlaceRequest {
    const tx = Math.floor(wx / TILE);
    switch (p.what) {
      case 'scriptorium':
        return { what: 'scriptorium', x0: tx - Math.floor(BUILD.scriptorium.width / 2) };
      case 'tower':
        return { what: 'tower', x0: tx - Math.floor(TOWER.width / 2) };
      case 'house':
        return { what: 'house', x0: tx - Math.floor(p.width / 2), width: p.width, stories: p.stories, name: 'Building' };
      case 'fixture': {
        // which story the mouse is in: each deck belongs to the story below it
        const row = Math.floor(wy / TILE);
        const t = this.sim.state.tower;
        const inTower = !!t && tx >= t.x0 && tx <= t.x1;
        const story = inTower ? Math.max(0, Math.floor((deckRow(this.s, 0) - 1 - row) / TOWER.floorHeight)) : storyOfRow(this.s, row);
        const w = fixtureWidth(p.fixture);
        return { what: 'fixture', fixture: p.fixture, x0: tx - Math.floor(w / 2) + (w % 2 === 0 ? 1 : 0), story };
      }
    }
  }

  private ghostHeight(req: PlaceRequest): number {
    switch (req.what) {
      case 'scriptorium':
        return 32;
      case 'tower':
        return TOWER.floorHeight * TILE;
      case 'house':
        return buildingHeight(req.stories);
      case 'fixture':
        return req.fixture === 'ladder' ? TOWER.floorHeight * TILE : 16;
    }
  }

  /** The mouse moved over the world (in world pixels). Returns true if build mode handled it. */
  hover(wx: number, wy: number): boolean {
    if (this.modalEl) return true;
    if (this.placing) {
      const req = this.request(this.placing, wx, wy);
      this.req = req;
      const fp = footprint(this.s, req);
      this.renderer.ghost = { x0: fp.x0, x1: fp.x1, y: fp.y, height: this.ghostHeight(req), blocked: fp.blocked, ok: !fp.error };
      this.say(fp.error ?? `${placingName(this.placing)} here: ${costText(placeCost(req))}. Click to place.`, !!fp.error);
      return true;
    }
    if (this.demolishing) {
      const t = this.renderer.thingAt(this.s, wx, wy);
      this.renderer.highlight = t ? this.bounds(t) : null;
      return true;
    }
    return false;
  }

  /** A click on the world. Returns true if build mode handled it. */
  click(wx: number, wy: number): boolean {
    if (this.modalEl) return true;
    if (this.placing) {
      this.hover(wx, wy);
      const req = this.req!;
      const fp = footprint(this.s, req);
      if (fp.error) {
        this.say(fp.error, true);
        return true;
      }
      // fixtures are small and many (six beds...): they go straight down, and you keep placing
      if (req.what === 'fixture') this.placeFixture(req);
      else this.confirmPlace(req);
      return true;
    }
    if (this.demolishing) {
      const t = this.renderer.thingAt(this.s, wx, wy);
      if (t) this.takeDown(t);
      return true;
    }
    return false;
  }

  private placeFixture(req: Extract<PlaceRequest, { what: 'fixture' }>): void {
    const r = this.sim.enqueue({ type: 'place', playerId: 0, place: req });
    if (!r.ok) {
      this.say(r.error, true);
      return;
    }
    const free = placeCost(req).stone + placeCost(req).wood === 0;
    this.say(`${FIXTURE_LABEL[req.fixture]} ${free ? 'marked out' : 'planned'}. Click to place another, or Esc to stop.${free ? '' : ` Post ${buildWord(this.s, { x0: req.x0, x1: req.x0 + fixtureWidth(req.fixture) - 1 })} work to have it built.`}`);
  }

  private confirmPlace(req: PlaceRequest): void {
    const name = this.placing ? placingName(this.placing) : 'it';
    let nameInput: HTMLInputElement | null = null;
    const body: (HTMLElement | string)[] = [h('p', {}, 'Are you sure you want to place this building here?')];
    if (req.what === 'tower') body.push(h('p', { class: 'hint' }, 'The tower site can never be moved.'));
    if (req.what === 'scriptorium') body.push(h('p', { class: 'hint' }, 'The scriptorium can never be moved. The first job board goes up beside its door.'));
    if (req.what === 'house') {
      const n = this.s.buildings.filter((b) => b.kind === 'house').length + 1;
      nameInput = h('input', { type: 'text', value: `Building ${n}`, maxlength: 24, 'aria-label': 'Name' });
      body.push(h('div', { class: 'row' }, h('label', {}, 'Name ', nameInput)), h('p', { class: 'hint' }, 'Its label will list what you put inside, e.g. “Dormitory (Bed, Bed, Pantry)”.'));
    }
    body.push(h('p', { class: 'hint' }, `Costs ${costText(placeCost(req))}.`));
    this.modal(
      'Build',
      body,
      [
        { label: 'Cancel Build', run: () => this.cancel() },
        { label: 'Change Placement', run: () => undefined },
        {
          label: `Build ${name} Here`,
          primary: true,
          run: () => {
            const place = req.what === 'house' ? { ...req, name: nameInput!.value.trim() || 'Building' } : req;
            const r = this.sim.enqueue({ type: 'place', playerId: 0, place });
            if (!r.ok) {
              this.say(r.error, true);
              return;
            }
            this.placing = null;
            this.renderer.ghost = null;
            this.renderPalette();
            this.say(req.what === 'scriptorium' ? 'The patron has workers on it already.' : req.what === 'tower' ? 'The tower site is chosen.' : 'Planned. Post “build camp” work to have it built.');
          },
        },
      ],
      nameInput,
    );
  }

  // ------------------------------------------------------------- demolish

  startDemolish(): void {
    this.placing = null;
    this.renderer.ghost = null;
    this.demolishing = true;
    this.wm.show('build');
    this.renderPalette();
    this.say('Demolish: click a building or fixture. Esc to stop.');
  }

  stopDemolish(): void {
    if (!this.demolishing) return;
    this.demolishing = false;
    this.renderer.highlight = null;
    this.renderPalette();
    this.say('');
  }

  private bounds(t: Thing): { x0: number; x1: number; y: number; height: number } {
    if (t.kind === 'building') return { x0: t.building.x0, x1: t.building.x1, y: groundRow(this.s), height: buildingHeight(t.building.stories) };
    return { x0: t.site.x0, x1: t.site.x1, y: t.site.y, height: t.site.buildingId !== null ? 16 : 24 };
  }

  /**
   * Take something away. Finished things are demolished (after a dialog).
   * Unfinished ones are cancelled: with nothing set in place yet, at once;
   * part-built, after a dialog, with every unit already used left to haul.
   */
  takeDown(t: Thing): void {
    const thing = t.kind === 'building' ? t.building : t.site;
    if (!thing.build) {
      this.confirmDemolish(t);
      return;
    }
    const target = t.kind === 'building' ? { kind: 'building' as const, id: t.building.id } : { kind: 'site' as const, id: t.site.id };
    const label = t.kind === 'building' ? t.building.name : t.site.label;
    const cancel = () => {
      const r = this.sim.enqueue({ type: 'demolish', playerId: 0, target });
      this.say(r.ok ? `Cancelled: ${label}.` : r.error, !r.ok);
    };
    const placed = thing.build.placed;
    if (placed.stone + placed.wood === 0) {
      cancel();
      return;
    }
    this.modal(
      'Cancel',
      [h('p', {}, `Cancel ${label}? It’s ${Math.floor(worksFraction(thing.build) * 100)}% built.`), h('p', { class: 'hint' }, `Nothing is lost: the ${costText(placed)} already set in place will be left there to haul.`)],
      [
        { label: 'Keep Building', run: () => undefined },
        { label: 'Cancel It', primary: true, run: cancel },
      ],
    );
  }

  /** The button for taking something away: "Cancel…" until it's finished, then "Demolish…". */
  private takeDownButton(t: Thing): HTMLElement {
    const thing = t.kind === 'building' ? t.building : t.site;
    return h('button', { class: 'btn', disabled: !!thing.demolish, onclick: () => this.takeDown(t) }, thing.build ? 'Cancel…' : 'Demolish…');
  }

  /** Rename a building, or a fixture (blank puts a fixture back to its number). */
  private rename(t: Thing): void {
    const site = t.kind === 'site' ? t.site : null;
    const input = h('input', { type: 'text', value: site ? (site.named ? site.label : '') : t.kind === 'building' ? t.building.name : '', maxlength: BUILD.house.maxName, 'aria-label': 'Name', placeholder: site ? site.label : '' });
    this.modal(
      'Rename',
      [
        h('div', { class: 'row' }, h('label', {}, 'Name ', input)),
        site ? h('p', { class: 'hint' }, `Orders can name it, as “haul stone to ${site.named ? site.label : 'Your Name'}”. Its number stays too, so orders written with the number still find it. Leave it blank to go back to just the number.`) : null,
      ],
      [
        { label: 'Cancel', run: () => undefined },
        {
          label: 'Rename',
          primary: true,
          run: () => {
            const r = site
              ? this.sim.enqueue({ type: 'renameFixture', playerId: 0, siteId: site.id, name: input.value })
              : this.sim.enqueue({ type: 'rename', playerId: 0, buildingId: (t as { building: Building }).building.id, name: input.value });
            if (!r.ok) this.say(r.error, true);
            this.refreshInfo();
          },
        },
      ],
      input,
    );
  }

  confirmDemolish(t: Thing): void {
    const target = t.kind === 'building' ? { kind: 'building' as const, id: t.building.id } : { kind: 'site' as const, id: t.site.id };
    const check = this.sim.enqueue.bind(this.sim);
    const label = t.kind === 'building' ? t.building.name : t.site.label;
    const holding = t.kind === 'site' ? storedTotal(t.site) : 0;
    const inside = t.kind === 'building' ? this.s.sites.filter((x) => x.buildingId === t.building.id).length : 0;
    const notes: string[] = [];
    if (holding > 0) notes.push(`It still holds ${holding}. It comes down once it's empty.`);
    if (inside > 0) notes.push(`It has ${inside} ${inside === 1 ? 'fixture' : 'fixtures'} in it. It comes down once they're gone.`);
    this.modal(
      'Demolish',
      [h('p', {}, `Take down ${label}?`), h('p', { class: 'hint' }, 'Workers with “build camp” work take it apart. Half the materials are left lying there to haul.'), ...notes.map((n) => h('p', { class: 'hint' }, n))],
      [
        { label: 'Cancel', run: () => undefined },
        {
          label: 'Demolish',
          primary: true,
          run: () => {
            const r = check({ type: 'demolish', playerId: 0, target });
            this.say(r.ok ? `Marked to come down: ${label}.` : r.error, !r.ok);
          },
        },
      ],
    );
  }

  // ------------------------------------------------- a building's window

  /** Clicked on a building or fixture (outside build modes). */
  inspect(t: Thing): void {
    this.infoTarget = t;
    this.wm.show('thing');
    this.refreshInfo();
  }

  /**
   * Redraw the building window, but only when what it shows has changed:
   * rebuilding it under the mouse would swallow clicks.
   */
  private refreshInfo(): void {
    const win = this.wm.get('thing')!;
    if (!win.open || !this.infoTarget) return;
    const next = h('div');
    const title = this.renderInfo(next);
    win.title.textContent = title;
    if (next.innerHTML === this.infoBody.innerHTML) return;
    clear(this.infoBody);
    this.infoBody.append(...next.childNodes);
  }

  /** The building window's contents; returns its title. */
  private renderInfo(into: HTMLElement): string {
    const s = this.s;
    const t = this.infoTarget!;
    const kv = (k: string, v: string) => h('div', { class: 'kv' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
    if (t.kind === 'building') {
      const b = s.buildings.find((x) => x.id === t.building.id);
      if (!b) {
        into.append(h('div', { class: 'hint' }, 'It has been taken down.'));
        return 'Gone';
      }
      into.append(
        b.kind === 'house'
          ? h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Name'), h('span', { class: 'v' }, b.name, ' ', h('button', { class: 'btn btn-small', onclick: () => this.rename({ kind: 'building', building: b }) }, 'Rename…')))
          : '',
        kv('Label', buildingLabel(s, b)),
        kv('Size', `${b.x1 - b.x0 + 1} tiles wide, ${b.stories === 1 ? 'one story' : 'two stories'}`),
        kv('State', statusOf(this.s, b)),
        h(
          'div',
          { class: 'row row-end' },
          b.kind === 'house' && !b.demolish ? h('button', { class: 'btn', onclick: () => this.wm.show('build') }, 'Add a fixture…') : null,
          b.kind === 'house' && (b.build || s.sites.some((x) => x.buildingId === b.id && x.build)) ? this.buildThisButton({ name: b.name }, b.name) : null,
          this.takeDownButton({ kind: 'building', building: b }),
        ),
      );
      return b.name;
    }
    const site = s.sites.find((x) => x.id === t.site.id);
    if (!site) {
      into.append(h('div', { class: 'hint' }, 'It has been taken down.'));
      return 'Gone';
    }
    const b = s.buildings.find((x) => x.id === site.buildingId);
    const goods = (['stone', 'wood', 'grain', 'bread', 'beer'] as const).filter((k) => site.store[k] > 0).map((k) => `${site.store[k]} ${k}`);
    into.append(
      site.num
        ? h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Name'), h('span', { class: 'v' }, site.label, ' ', h('button', { class: 'btn btn-small', onclick: () => this.rename({ kind: 'site', site }) }, 'Rename…')))
        : '',
      site.named ? kv('Number', `${FIXTURE_LABEL[site.kind as FixtureKind]} ${site.num}`) : '',
      kv('Where', b ? `${b.name}${site.y < groundRow(s) ? ', upstairs' : ''}` : site.level > 0 || (s.tower && site.x0 >= s.tower.x0 && site.x1 <= s.tower.x1) ? levelName(site.level) : 'Out in the open'),
      kv('State', statusOf(this.s, site)),
      site.capacity !== null && !site.supplies ? kv('Holds', `${storedTotal(site)} of ${site.capacity}`) : '',
      goods.length ? kv('Has', goods.join(', ')) : '',
      site.kind === 'bar' && !site.build ? this.priceRow(site) : '',
      site.broken ? h('div', { class: 'hint' }, 'Broken beyond repair. Take it down for the materials.') : '',
      h(
        'div',
        { class: 'row row-end' },
        site.build && site.kind in FIXTURE_WORD ? this.buildThisButton(site.named ? { name: site.label } : { fixture: FIXTURE_WORD[site.kind as FixtureKind], n: site.num }, site.label.toLowerCase()) : null,
        this.takeDownButton({ kind: 'site', site }),
      ),
    );
    return siteTitle(s, site);
  }

  /** Open the composer with a notice to build just this (for a building: it and what's planned in it). */
  private buildThisButton(target: Place, label: string): HTMLElement {
    return h('button', { class: 'btn', onclick: () => this.scriptorium.openDraft([{ verb: 'BUILD', noun: null, target, from: null, to: null, count: ALL }]) }, `Write “build ${label}”…`);
  }

  /** A bar's beer price: cheap beer cheers more; dear beer brings more back to the treasury. */
  private priceRow(site: Site): HTMLElement {
    const price = site.price ?? ECONOMY.beerPrice;
    const set = (p: number) => this.sim.enqueue({ type: 'setBeerPrice', playerId: 0, siteId: site.id, price: Math.max(0, Math.min(ECONOMY.beerPriceMax, p)) });
    return h(
      'div',
      {},
      h(
        'div',
        { class: 'kv' },
        h('span', { class: 'k' }, 'Beer price'),
        h(
          'span',
          { class: 'v' },
          h('button', { class: 'btn btn-small', disabled: price <= 0, onclick: () => set(price - 1) }, '−'),
          ` ${price === 0 ? 'Free' : `${price} gold`} `,
          h('button', { class: 'btn btn-small', disabled: price >= ECONOMY.beerPriceMax, onclick: () => set(price + 1) }, '+'),
        ),
      ),
      h('div', { class: 'hint' }, `Cheap beer lifts spirits more (+${barMood(price)} mood a drink at this price) and is easier to afford. Dearer beer brings more of their wages back to the treasury. The usual price is ${ECONOMY.beerPrice}.`),
    );
  }

  // ------------------------------------------------------- System 7 dialogs

  private modal(title: string, body: (HTMLElement | string | null)[], buttons: { label: string; primary?: boolean; run: () => void }[], focus?: HTMLElement | null): void {
    this.closeModal();
    const btns = buttons.map((b) =>
      h(
        'button',
        {
          class: `btn${b.primary ? ' btn-default' : ''}`,
          onclick: () => {
            this.closeModal();
            b.run();
          },
        },
        b.label,
      ),
    );
    const dialog = h('div', { class: 'dialog', role: 'alertdialog', 'aria-label': title }, ...body, h('div', { class: 'row row-end dialog-buttons' }, ...btns));
    const back = h('div', { class: 'modal-back' }, dialog);
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        btns.find((_, i) => buttons[i].primary)?.click();
      }
    });
    this.root.append(back);
    this.modalEl = back;
    (focus ?? btns.find((_, i) => buttons[i].primary) ?? btns[0])?.focus();
    if (focus instanceof HTMLInputElement) focus.select();
  }

  private closeModal(): void {
    this.modalEl?.remove();
    this.modalEl = null;
  }

  /** A dialog for other windows (the Saved Games window's questions). */
  ask(title: string, body: (HTMLElement | string | null)[], buttons: { label: string; primary?: boolean; run: () => void }[], focus?: HTMLElement | null): void {
    this.modal(title, body, buttons, focus);
  }

  /** What only the interface knows about this game, for a save: the alerts already shown and the tutorial step. */
  uiSnapshot(): { alertsSeen: number[]; tutorial: number } {
    return { alertsSeen: this.s.alerts.filter((a) => this.alertsSeen.has(a.id)).map((a) => a.id), tutorial: this.tutorial.at };
  }

  /** A loaded game: don't show its old alerts again, and pick the tutorial up where it was. */
  restoreUi(ui: SaveUi): void {
    this.alertsSeen = new Set(Array.isArray(ui.alertsSeen) ? ui.alertsSeen : this.s.alerts.map((a) => a.id));
    if (typeof ui.tutorial === 'number') this.tutorial.resume(ui.tutorial);
  }

  get modalOpen(): boolean {
    return this.modalEl !== null;
  }

  // ------------------------------------------------------------- bonuses

  /**
   * "Send a bonus…": how much gold goes in the letter, with a guess at how
   * much it would cheer them if it were handed over now. The gold is set
   * aside at once and leaves the treasury when the scribe writes the letter.
   */
  bonusDialog(workerId: number): void {
    const w = this.s.workers.find((x) => x.id === workerId);
    if (!w || w.leaving) return;
    const free = availableGold(this.s);
    const input = h('input', { type: 'number', min: 1, max: Math.min(BONUS.maxGold, free), step: 1, value: String(Math.max(1, Math.min(25, free))), 'aria-label': 'Gold', class: 'bonus-gold' });
    const preview = h('p', { class: 'hint' });
    const update = () => {
      const g = Math.floor(Number(input.value));
      if (!Number.isFinite(g) || g < 1) preview.textContent = 'How much gold?';
      else if (g > free) preview.textContent = `Only ${free} gold is free in the treasury.`;
      else {
        const lift = bonusLift(w, g);
        preview.textContent = `Handed over now, it would lift ${w.name}’s mood by about ${lift} (${Math.round(w.mood)} → ${Math.min(100, Math.round(w.mood) + lift)}) for a day.${w.mood < this.s.settings.quitBelow && w.mood + lift >= this.s.settings.quitBelow ? ' Enough to stop them quitting, for now.' : ''}`;
      }
    };
    input.addEventListener('input', update);
    const quick = h(
      'div',
      { class: 'row' },
      ...[10, 25, 50, 100].map((g) =>
        h('button', {
          class: 'btn btn-small',
          disabled: g > free,
          onclick: () => {
            input.value = String(g);
            update();
          },
        }, `${g}`),
      ),
    );
    update();
    this.modal(
      'Send a bonus',
      [
        h('div', { class: 'dialog-title' }, `A bonus for ${w.name}`),
        h('p', {}, `A scribe writes out a pay packet and a courier hands it to ${w.name}. The gold leaves the treasury when it’s written. Their purse has ${w.purse} gold; the fuller it is, the less a bonus impresses them.`),
        h('div', { class: 'row' }, h('label', {}, 'Gold ', input), quick),
        preview,
      ],
      [
        { label: 'Cancel', run: () => undefined },
        {
          label: 'Send',
          primary: true,
          run: () => {
            const r = this.sim.enqueue({ type: 'bonus', playerId: 0, workerId: w.id, gold: Math.floor(Number(input.value)) });
            if (!r.ok) this.modal('Send a bonus', [h('p', {}, r.error)], [{ label: 'OK', primary: true, run: () => undefined }]);
          },
        },
      ],
      input,
    );
  }

  // ------------------------------------------------------------ recruiting

  /**
   * "Recruit a worker": a confirmation, since the fee is large and can't be
   * taken back. Also what the "everyone gone" alert's button will open.
   */
  recruitDialog(): void {
    const why = recruitError(this.s);
    if (why) {
      this.modal('Recruit a worker', [h('p', {}, why)], [{ label: 'OK', primary: true, run: () => undefined }]);
      return;
    }
    const fee = recruitFee(this.s);
    const n = headcount(this.s);
    this.modal(
      'Recruit a worker',
      [
        h('div', { class: 'dialog-title' }, `Recruit a worker for ${goldText(fee)} gold?`),
        h('p', {}, `The fee leaves the treasury now, and the recruit walks in from the road. ${n === 0 ? 'Nobody is left, so they come cheap.' : `They would make ${n + 1}: the bigger the camp, the more each recruit costs.`}`),
      ],
      [
        { label: 'Cancel', run: () => undefined },
        {
          label: 'Recruit',
          primary: true,
          run: () => {
            const r = this.sim.enqueue({ type: 'recruit', playerId: 0 });
            if (!r.ok) this.modal('Recruit a worker', [h('p', {}, r.error)], [{ label: 'OK', primary: true, run: () => undefined }]);
          },
        },
      ],
    );
  }

  // ------------------------------------------------------------- alerts

  /** Alerts already shown (or skipped because muted) this session. */
  private alertsSeen = new Set<number>();

  /**
   * One alert at a time, oldest first, as a dialog (which pauses the game):
   * Acknowledge, with boxes to mute this kind or every alert. Mutes are the
   * player's own, kept in the browser.
   */
  private showNextAlert(): void {
    if (this.modalEl) return;
    const next = this.s.alerts.find((a) => !this.alertsSeen.has(a.id));
    if (!next) return;
    this.alertsSeen.add(next.id);
    if (isMuted(next.kind)) return this.showNextAlert();
    const quit = { label: 'Quit Game', run: () => this.hooks.quitGame?.() };
    // the end of a game, or of the work: no mute boxes, and their own buttons
    if (next.kind === 'goal') {
      this.modal(next.title, [h('div', { class: 'dialog-title' }, next.title), h('p', {}, next.text)], [{ label: 'Quit', run: () => this.hooks.quitGame?.() }, { label: 'Keep Playing', primary: true, run: () => undefined }]);
      return;
    }
    if (next.kind === 'gone') {
      // what it offers depends on now, not on when it was raised
      const now = goneState(this.s);
      const buttons =
        now === 'recruit'
          ? [quit, { label: 'Recruit New Worker', primary: true, run: () => this.recruitNow() }]
          : now === 'wait'
            ? [quit, { label: 'Wait', primary: true, run: () => undefined }]
            : [{ ...quit, primary: true }];
      this.modal(next.title, [h('div', { class: 'dialog-title' }, next.title), h('p', {}, next.text)], buttons);
      return;
    }
    const muteKind = h('input', { type: 'checkbox' });
    const muteAll = h('input', { type: 'checkbox' });
    const worker = next.workerId !== null ? this.s.workers.find((w) => w.id === next.workerId) : undefined;
    // every button counts as acknowledging it, so the mute boxes hold whichever is clicked
    const keepMutes = () => {
      if (!muteKind.checked && !muteAll.checked) return;
      const m = readMutes();
      if (muteAll.checked) m.all = true;
      if (muteKind.checked) {
        m.on = m.on.filter((k) => k !== next.kind);
        if (!m.kinds.includes(next.kind)) m.kinds.push(next.kind);
      }
      writeMutes(m);
    };
    this.modal(
      next.title,
      [
        h('div', { class: 'dialog-title' }, next.title),
        h('p', {}, next.text),
        h('label', { class: 'alert-mute' }, muteKind, ` Mute future alerts like this (${ALERT_KIND_TEXT[next.kind]})`),
        h('label', { class: 'alert-mute' }, muteAll, ' Mute all future alerts'),
        h('div', { class: 'hint' }, 'The Alerts menu lists them all and turns them back on.'),
      ],
      [
        ...(worker && !worker.leaving ? [{ label: `Show ${worker.name}`, run: () => (keepMutes(), this.hooks.showWorker?.(worker.id)) }] : []),
        // a notice: the quick way out, straight to the bonus dialog
        ...(worker && !worker.leaving && next.kind === 'notice' ? [{ label: 'Send a bonus…', run: () => (keepMutes(), this.bonusDialog(worker.id)) }] : []),
        { label: 'Acknowledge', primary: true, run: keepMutes },
      ],
    );
  }

  /** The everyone-gone alert's button: hire one at once (it's the cheapest a recruit ever is) and open the Workers window for more. */
  private recruitNow(): void {
    const r = this.sim.enqueue({ type: 'recruit', playerId: 0 });
    if (!r.ok) this.modal('Recruit a worker', [h('p', {}, r.error)], [{ label: 'OK', primary: true, run: () => undefined }]);
    else this.wm.show('roster');
  }

  // ------------------------------------------------------------ the opening

  private needsOpening(): boolean {
    return this.s.settings.start === 'opening' && !this.s.sites.some((x) => x.kind === 'scriptorium');
  }

  private word(w: FlavorWord): HTMLElement {
    const f = flavor(this.s.seed, w);
    return h('span', { class: f.lang === 'en' ? 'flavor' : `flavor word-${f.lang}`, lang: f.lang }, f.text);
  }

  showOpening(): void {
    this.openingShown = true;
    const p = (...parts: (string | HTMLElement)[]) => h('p', {}, ...parts);
    this.modal(
      'Babel',
      [
        h('div', { class: 'dialog-title' }, 'A commission'),
        p('Your ', this.word('benevolent'), ' patron has entrusted you with a ', this.word('legendary'), ' commission: Build a tower that reaches all the way up to heaven! To complete this task you will be provided many ', this.word('industrious'), ' workers, ', this.word('plentiful'), ' land and natural resources, and a generous stipend — as long as your progress pleases your patron.'),
        p('Although the ', this.word('heavy'), ' burden of this project’s success lies on your shoulders, your hands will not touch a single brick. To give jobs to your ', this.word('trusted'), ' workers you must dictate them to a scribe at the scriptorium, and then have a worker post the order on a job board or deliver it to a worker to be carried out.'),
        p('To begin, please select a location to build your scriptorium and first job board.'),
      ],
      [{ label: 'Build Scriptorium', primary: true, run: () => this.start({ what: 'scriptorium' }) }],
    );
  }

  private showFounded(): void {
    this.modal(
      'Babel',
      [
        h('p', {}, 'The Scriptorium and job board are now complete. To ensure that you will always be able to issue orders, the “Patron’s Charter” has been permanently decreed. The fate of this ', this.word('monumental'), ' undertaking depends on you. ', this.word('goodLuck')),
      ],
      [
        {
          label: 'Skip Tutorials',
          run: () => {
            this.tutorial.skip();
            if (!this.s.tower) this.start({ what: 'tower' });
          },
        },
        { label: 'Continue Tutorial', primary: true, run: () => this.tutorial.begin() },
      ],
    );
  }

  // ------------------------------------------------------------------ tick

  refresh(): void {
    if (!this.openingShown && this.needsOpening()) this.showOpening();
    if (!this.sawCharter && this.s.charter) {
      this.sawCharter = true;
      if (this.s.settings.start === 'opening') this.showFounded();
    }
    this.showNextAlert();
    if (this.wm.get('build')!.open && !this.placing && !this.demolishing) this.renderPalette();
    this.refreshInfo();
    this.tutorial.refresh();
  }

  /** For the tutorial: where things are. */
  goTo(x: number, y: number): void {
    this.hooks.centerOnTile(x, y);
  }

  openComposer(lines: DraftLine[]): void {
    this.scriptorium.openDraft(lines);
  }

  /** For the tutorial: send a blueprint for the next floor to the scriptorium. */
  drawBlueprint(): void {
    const r = this.sim.enqueue({ type: 'blueprint', playerId: 0 });
    this.say(r.ok ? 'A blueprint is being drawn. A courier carries it to the top of the tower.' : r.error, !r.ok);
  }
}

/** A ladder planned (or built) on the Tower Ground Level, up onto its roof. */
function ladderPlaced(s: SimState): boolean {
  return s.sites.some((x) => x.kind === 'ladder' && x.level === 0 && !x.demolish);
}

/** Levels built, under way, and blueprints still being drawn or carried up. */
function blueprintsSoFar(s: SimState): number {
  const drawing = s.designs.filter((d) => d.carrier.kind === 'blueprint').length;
  const carried = s.workers.reduce((n, w) => n + w.bag.filter((c) => c.kind === 'blueprint').length, 0) + s.outbox.filter((c) => c.kind === 'blueprint').length;
  return s.floors + s.projects.length + drawing + carried;
}

/** The build order that covers something planned: what's in the tower is "build fixtures in tower", the rest "build camp". */
function buildWord(s: SimState, x: { x0: number; x1: number }): string {
  return inTowerSpan(s, x) ? '“build fixtures in tower”' : '“build camp”';
}

function statusOf(s: SimState, x: Building | Site): string {
  if ('kind' in x && x.build && 'level' in x && towerSiteWaiting(s, x as Site)) {
    const site = x as Site;
    return `Planned: waits until ${floorName(site.level + (site.kind === 'ladder' ? 1 : 0))} is built.`;
  }
  if (x.demolish) return x.demolish.undone > 0 ? `Coming down (${Math.floor((x.demolish.undone / Math.max(1, x.demolish.needs.stone + x.demolish.needs.wood)) * 100)}%)` : 'Marked to come down (waits until it’s empty)';
  if (x.build) {
    const f = worksFraction(x.build);
    const missing = costText({ stone: x.build.needs.stone - x.build.placed.stone, wood: x.build.needs.wood - x.build.placed.wood });
    return f === 0 ? `Planned: needs ${missing}. Post ${buildWord(s, x)} work.` : `Being built (${Math.floor(f * 100)}%, still needs ${missing})`;
  }
  return 'Built';
}

// ---------------------------------------------------------------- tutorials

interface Step {
  title: string;
  /** Fixed, or worked out from the game as it stands (redrawn when it changes). */
  text: string | ((s: SimState) => string);
  buttons?: { label: string; run: (b: BuildUi) => void }[] | ((s: SimState) => { label: string; run: (b: BuildUi) => void }[]);
  /** Moves on by itself once this is true. Without it, there's a Next button. */
  done?: (s: SimState) => boolean;
}

/**
 * The tutorial outline from DESIGN.md §15.8. The text is a first draft:
 * it's meant to be rewritten once the user has played it.
 */
function steps(s: SimState): Step[] {
  const stipend = currentStipend(s);
  return [
    {
      title: 'The stipend',
      text: `Your patron pays a stipend each dawn: ${stipend} gold while their patience is full. Patience wears thin over time, and the stipend shrinks with it. For the first ${PATRON.graceDays} days you have grace: patience won’t drop while the camp gets started. But the patron expects the Tower Ground Level to be finished by then. Each finished level wins patience back and brings a bonus; building anything else helps a little too.`,
    },
    {
      title: 'Gathering',
      text: 'Everything is built from stone, wood and grain, and none of it gathers itself. Your patron has pinned a few starter jobs to the board: mine stone at the quarry, chop wood in the forest, harvest grain in the field. When those run out, write more at the scriptorium.',
      buttons: [
        { label: 'Write “mine stone”…', run: (b) => b.openComposer([{ verb: 'MINE', noun: 'STONE', from: null, to: null, count: 12 }]) },
        { label: 'Write “chop wood”…', run: (b) => b.openComposer([{ verb: 'CHOP', noun: 'WOOD', from: null, to: null, count: 12 }]) },
        { label: 'Write “harvest grain”…', run: (b) => b.openComposer([{ verb: 'HARVEST', noun: 'GRAIN', from: null, to: null, count: 8 }]) },
      ],
    },
    {
      title: 'Stockpiles',
      text: `You will need a place to store the supplies you’ll be using. Place one or more stockpile markers to show where supplies can be stored for later. Workers don’t like having to search for materials to make things, so be sure to write haul orders to get loose supplies moved to a storage area where they can be put to proper use. A stockpile holds ${BUILD.capacity.stockpile}; later, shelves inside a building hold ${BUILD.capacity.shelves}.`,
      buttons: [
        { label: 'Place a stockpile…', run: (b) => b.start({ what: 'fixture', fixture: 'stockpile' }) },
        { label: 'Write “haul stone”…', run: (b) => b.openComposer([{ verb: 'HAUL', noun: 'STONE', from: null, to: null, count: -1 }]) },
        { label: 'Write “haul wood”…', run: (b) => b.openComposer([{ verb: 'HAUL', noun: 'WOOD', from: null, to: null, count: -1 }]) },
        { label: 'Write “haul grain”…', run: (b) => b.openComposer([{ verb: 'HAUL', noun: 'GRAIN', from: null, to: null, count: -1 }]) },
      ],
      done: (s) => s.sites.some((x) => x.kind === 'stockpile' && !x.supplies),
    },
    {
      title: 'The tower',
      text: 'The tower is why you’re here: the higher, the better. Choose its site now. Once chosen, it can never be moved, so leave room around it. Each level is built from a blueprint: draw one in the Tower window, then post “build tower” work.',
      buttons: [{ label: 'Choose the tower site…', run: (b) => b.start({ what: 'tower' }) }],
      done: (s) => s.tower !== null,
    },
    {
      title: 'Buildings',
      text: 'Fixtures like beds and ovens go inside a finished building. Place an empty building, then post “build camp” work so someone builds it. With the count set to “all”, the notice comes down when everything planned is built.',
      buttons: [
        { label: 'Build an empty building…', run: (b) => b.start({ what: 'house', width: BUILD.house.defaultWidth, stories: 1 }) },
        { label: 'Write “build camp”…', run: (b) => b.openComposer([{ verb: 'BUILD', noun: 'CAMP', from: null, to: null, count: -1 }]) },
      ],
      done: (s) => s.buildings.some((x) => x.kind === 'house' && x.build === null),
    },
    {
      title: 'Food',
      text: 'Workers need food to stay happy. Build an oven, then a pantry to keep the bread in. Bakers need grain from a stockpile and “cook bread” work. Until then, everyone eats from the patron’s supplies, and they won’t last.',
      buttons: [
        { label: 'Build an oven…', run: (b) => b.start({ what: 'fixture', fixture: 'oven' }) },
        { label: 'Build a pantry…', run: (b) => b.start({ what: 'fixture', fixture: 'pantry' }) },
      ],
      done: (s) => s.sites.some((x) => x.kind === 'oven' && !x.broken) && s.sites.some((x) => x.kind === 'pantry'),
    },
    {
      title: 'Rest',
      text: 'Workers need rest. Without beds they sleep on the ground, and it sours their mood. Build some beds.',
      buttons: [{ label: 'Build a bed…', run: (b) => b.start({ what: 'fixture', fixture: 'bed' }) }],
      done: (s) => s.sites.some((x) => x.kind === 'bed'),
    },
    {
      title: 'Drink',
      text: 'Many workers enjoy a drink now and then. Grain brewed at a brewery becomes beer, kept at a bar, where workers spend their wages. What they pay goes back into your treasury.',
      buttons: [
        { label: 'Build a brewery…', run: (b) => b.start({ what: 'fixture', fixture: 'brewery' }) },
        { label: 'Build a bar…', run: (b) => b.start({ what: 'fixture', fixture: 'bar' }) },
      ],
    },
    {
      title: 'Demolishing',
      text: 'The old shack is no use to anyone. Click Demolish and select the broken oven inside it.',
      buttons: [{ label: 'Demolish…', run: (b) => b.startDemolish() }],
      done: (s) => !s.sites.some((x) => x.kind === 'oven' && x.broken && !x.demolish),
    },
    {
      title: 'Demolishing',
      text: 'Now demolish the shack too. Demolishing gives back half the materials, left lying there for haulers. A pantry, bar or stockpile only comes down once it’s empty, and a building once its fixtures are gone.',
      buttons: [{ label: 'Demolish…', run: (b) => b.startDemolish() }],
      done: (s) => !s.buildings.some((x) => x.kind === 'shack' && !x.demolish),
    },
    {
      title: 'Plans for the next level',
      text: (s) => {
        const plans =
          blueprintsSoFar(s) < 2
            ? 'You will need to draft and deliver plans for each new level of the tower before construction on it can begin. You can draft plans for more than one level at a time; they’re saved until they’re needed. Draft the plans for Tower Level 2 now. '
            : 'The plans for Tower Level 2 are drafted. ';
        const rooms = 'Each new level of the tower is an empty room: your workers have to build everything in it, including the ladder up to it. ';
        const ladder =
          s.floors + s.projects.length === 0
            ? 'Once the Tower Ground Level is under way, place a ladder in it, so workers can climb onto its roof to build Level 2 and carry its plans to the top. It waits until the level is finished.'
            : ladderPlaced(s)
              ? 'The ladder up from the Tower Ground Level is planned; “build fixtures in tower” work gets it built.'
              : 'Right now there’s no way up onto the Tower Ground Level’s roof. Place a ladder on the Tower Ground Level, and post “build fixtures in tower” work to get it built.';
        return plans + rooms + ladder;
      },
      buttons: (s) => [
        ...(blueprintsSoFar(s) < 2 ? [{ label: 'Draw a blueprint', run: (b: BuildUi) => b.drawBlueprint() }] : []),
        ...(s.floors + s.projects.length >= 1 && !ladderPlaced(s) ? [{ label: 'Place a ladder…', run: (b: BuildUi) => b.start({ what: 'fixture', fixture: 'ladder' }) }] : []),
      ],
      done: (s) => blueprintsSoFar(s) >= 2 && (s.floors === 0 || ladderPlaced(s)),
    },
    {
      title: 'A warning',
      text: `One last thing. High in the tower, from ${levelName(driftLine(s))} up, your workers’ words start to drift into other languages. You’ll learn more when it happens.`,
    },
  ];
}

class Tutorial {
  private step = -1;
  private body: HTMLElement;
  private shown = '';

  constructor(
    private wm: WindowManager,
    private sim: Sim,
    private ui: BuildUi,
  ) {
    const win = this.wm.create('tutorial', 'Tutorial', -380, 300, 360);
    this.body = win.body;
  }

  /** The step it's on (-1: not running). */
  get at(): number {
    return this.step;
  }

  /** Pick up at a step (a loaded game). */
  resume(step: number): void {
    if (step < 0) this.skip();
    else {
      this.step = step;
      this.shown = '';
      this.refresh();
    }
  }

  begin(): void {
    this.step = 0;
    this.wm.show('tutorial');
    this.refresh();
  }

  skip(): void {
    this.step = -1;
    this.wm.close('tutorial');
  }

  private next(): void {
    this.step++;
    this.shown = '';
    this.refresh();
  }

  refresh(): void {
    if (this.step < 0) return;
    const all = steps(this.sim.state);
    const st = all[this.step];
    if (!st) {
      this.skip();
      return;
    }
    if (st.done?.(this.sim.state)) {
      this.next();
      return;
    }
    const s = this.sim.state;
    const text = typeof st.text === 'function' ? st.text(s) : st.text;
    const buttons = typeof st.buttons === 'function' ? st.buttons(s) : st.buttons ?? [];
    const key = `${this.step}|${text}|${buttons.map((b) => b.label).join('|')}`;
    if (this.shown === key) return;
    this.shown = key;
    const win = this.wm.get('tutorial')!;
    win.title.textContent = `Tutorial ${this.step + 1} of ${all.length}: ${st.title}`;
    clear(this.body);
    this.body.append(
      h('p', {}, text),
      h('div', { class: 'row' }, ...buttons.map((b) => h('button', { class: 'btn', onclick: () => b.run(this.ui) }, b.label))),
      h(
        'div',
        { class: 'row row-end' },
        h('button', { class: 'btn btn-small', onclick: () => this.skip() }, 'Skip tutorials'),
        st.done ? h('span', { class: 'hint' }, 'Moves on when it’s done.') : null,
        h('button', { class: `btn${st.done ? ' btn-small' : ' btn-default'}`, onclick: () => this.next() }, st.done ? 'Skip this step' : this.step === all.length - 1 ? 'Done' : 'Next'),
      ),
    );
    this.wm.show('tutorial');
  }
}

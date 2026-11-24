import { log } from './actions';
import { newCarrier, pinNotice, scribeLoop } from './carriers';
import { ALL, makeOrder, type Noun, type WorkVerb } from './lang';
import { giveCarrier } from './scrolls';
import { BUILD, FIXTURE_LABEL, MAP, PATRON, TOWER, type FixtureSpec } from './tuning';
import { deckRow, ladderRows, standRow } from './tower';
import { findPath } from './path';
import { FIXTURE_KINDS, Tile, type BuildMaterial, type Building, type FixtureKind, type ItemType, type Pt, type SimState, type Site, type Works } from './types';
import { buildingOf, groundRow, newBuilding, newSite, setTile, siteCenter, spotFor, storedTotal, storyRow, tileAt } from './world';

// Building on the ground (P1). The player places things; workers build them.
// Placing is the one thing the player does directly: it's laying out the
// plan. The labour still has to be ordered (BUILD CAMP), except for the
// scriptorium and the first board, which the patron has built for you.

export type PlaceRequest =
  /** The scriptorium and the first job board, placed together: the board stands by the door. */
  | { what: 'scriptorium'; x0: number }
  /** The tower site. Chosen once, never moved. */
  | { what: 'tower'; x0: number }
  /** An empty wooden building, named by the player. */
  | { what: 'house'; x0: number; width: number; stories: 1 | 2; name: string }
  /**
   * A fixture inside a finished building (story 0 or 1), in a tower room
   * (story = the tower level: 0 is the ground floor, n is floor n), or a
   * stockpile out on open ground.
   */
  | { what: 'fixture'; fixture: FixtureKind; x0: number; story: number };

export interface Footprint {
  x0: number;
  x1: number;
  /** The row its bottom sits on (where workers stand). */
  y: number;
  /** For each tile from x0 to x1: is it blocked? */
  blocked: boolean[];
  /** The building a fixture goes in, if any. */
  building: Building | null;
  /** A fixture in a tower room: which level (0 = the tower's ground floor). null elsewhere. */
  towerLevel: number | null;
  /** Why it can't go here, if it can't. */
  error: string | null;
}

export function newWorks(s: SimState, cost: Record<BuildMaterial, number>): Works {
  return { needs: { ...cost }, placed: { stone: 0, wood: 0 }, undone: 0, since: s.tick };
}

export function worksUnits(w: Works): number {
  return w.needs.stone + w.needs.wood;
}

export function worksFraction(w: Works): number {
  const need = worksUnits(w);
  return need === 0 ? 1 : (w.placed.stone + w.placed.wood) / need;
}

export function houseCost(width: number, stories: number): Record<BuildMaterial, number> {
  return { stone: BUILD.house.stonePerStory * stories, wood: BUILD.house.woodPerTilePerStory * width * stories };
}

export function placeCost(req: PlaceRequest): Record<BuildMaterial, number> {
  switch (req.what) {
    case 'scriptorium':
      return { stone: BUILD.scriptorium.cost.stone + BUILD.board.cost.stone, wood: BUILD.scriptorium.cost.wood + BUILD.board.cost.wood };
    case 'tower':
      return { stone: 0, wood: 0 };
    case 'house':
      return houseCost(req.width, req.stories);
    case 'fixture':
      return { ...BUILD.fixtures[req.fixture].cost };
  }
}

export function placeWidth(req: PlaceRequest): number {
  switch (req.what) {
    case 'scriptorium':
      return BUILD.scriptorium.width + BUILD.boardGap + BUILD.board.width;
    case 'tower':
      return TOWER.width;
    case 'house':
      return req.width;
    case 'fixture':
      return fixtureWidth(req.fixture);
  }
}

export function fixtureSpec(kind: FixtureKind): FixtureSpec {
  return BUILD.fixtures[kind];
}

export function fixtureWidth(kind: FixtureKind): number {
  return fixtureSpec(kind).width ?? BUILD.fixtureWidth;
}

/** "the ground floor", "floor 2": a story of a building or the tower, as the player reads it. */
function storyName(story: number, tower: boolean): string {
  if (tower) return story === 0 ? "the tower's ground floor" : `floor ${story} of the tower`;
  return story === 0 ? 'the ground floor' : 'upstairs';
}

/** What stands on each tile of open ground, if anything. */
export function groundUse(s: SimState): (string | null)[] {
  const use: (string | null)[] = new Array(s.width).fill(null);
  const mark = (x0: number, x1: number, label: string) => {
    for (let x = Math.max(0, x0); x <= Math.min(s.width - 1, x1); x++) use[x] = label;
  };
  for (const site of s.sites) if (site.buildingId === null && site.y === groundRow()) mark(site.x0, site.x1, site.label);
  for (const b of s.buildings) mark(b.x0, b.x1, b.name);
  if (s.tower) mark(s.tower.x0, s.tower.x1, 'Tower');
  mark(s.width - MAP.reservedRight, s.width - 1, 'The road to far-away lands');
  return use;
}

/** The finished building with room for a story at this spot, if there is one. */
function buildingAt(s: SimState, x0: number, x1: number, story: number): Building | null {
  return s.buildings.find((b) => b.kind === 'house' && x0 >= b.x0 && x1 <= b.x1 && story < b.stories) ?? null;
}

/**
 * Where something would go, tile by tile, and whether it can. The placement
 * preview and the command check use this same function, so they never
 * disagree.
 */
export function footprint(s: SimState, req: PlaceRequest): Footprint {
  const width = placeWidth(req);
  const x0 = req.x0;
  const x1 = x0 + width - 1;
  const fp: Footprint = { x0, x1, y: groundRow(), blocked: new Array(width).fill(false), building: null, towerLevel: null, error: null };
  const off = (x: number) => x < 0 || x >= s.width;

  if (req.what === 'fixture') {
    const story = Math.max(0, Math.floor(req.story));
    fp.y = storyRow(story);
    // inside the tower's walls: a tower room
    if (s.tower && x1 >= s.tower.x0 && x0 <= s.tower.x1) return towerFootprint(s, req, fp, story);
    if (req.fixture === 'ladder') {
      fp.blocked.fill(true);
      fp.error = 'Ladders go in the tower. A two-story building comes with its own.';
      return fp;
    }
    const b = story <= 1 ? buildingAt(s, x0, x1, story) : null;
    if (!b && req.fixture === 'stockpile' && story === 0) return groundFootprint(s, fp);
    // anything else has to go inside a building
    if (!b) {
      fp.blocked.fill(true);
      fp.error = req.fixture === 'stockpile' ? 'A stockpile goes inside a building or the tower, or on open ground.' : req.fixture === 'shelves' ? 'Storage shelves go inside a building or the tower.' : 'Fixtures go inside a building or the tower.';
      return fp;
    }
    const lowest = fixtureSpec(req.fixture).minStory ?? 0;
    if (story < lowest) {
      fp.blocked.fill(true);
      fp.error = `${FIXTURE_LABEL[req.fixture]} can't go on ${storyName(story, false)}.`;
      return fp;
    }
    fp.building = b;
    for (let i = 0; i < width; i++) {
      const x = x0 + i;
      const taken = s.sites.some((f) => f.buildingId === b.id && f.y === fp.y && x >= f.x0 && x <= f.x1);
      // the ladder up a two-story building runs up its left end
      const ladder = b.stories === 2 && x === b.x0;
      fp.blocked[i] = taken || ladder;
    }
    if (b.build) fp.error = `${b.name} isn't finished yet.`;
    else if (b.demolish) fp.error = `${b.name} is being taken down.`;
    else if (fp.blocked.some(Boolean)) fp.error = 'Something is already there.';
    return fp;
  }

  if (req.what === 'tower' && s.tower) {
    fp.blocked.fill(true);
    fp.error = 'The tower site is already chosen. It can never be moved.';
    return fp;
  }
  if (req.what === 'scriptorium' && s.sites.some((x) => x.kind === 'scriptorium')) {
    fp.blocked.fill(true);
    fp.error = 'There is only one scriptorium.';
    return fp;
  }
  if (req.what !== 'scriptorium' && !s.sites.some((x) => x.kind === 'scriptorium')) {
    fp.error = 'Place the scriptorium first.';
  }
  if (req.what === 'house') {
    if (!Number.isInteger(req.width) || req.width < BUILD.house.minWidth || req.width > BUILD.house.maxWidth) fp.error = `A building is ${BUILD.house.minWidth} to ${BUILD.house.maxWidth} tiles wide.`;
    if (req.stories !== 1 && req.stories !== 2) fp.error = 'A building has one or two stories.';
    if (!req.name.trim()) fp.error = 'Give the building a name.';
    if (req.name.length > 24) fp.error = 'That name is too long.';
  }
  for (let i = 0; i < width; i++) if (off(x0 + i)) fp.blocked[i] = true;
  const g = groundFootprint(s, fp);
  return g;
}

/**
 * A fixture in a tower room. Rooms are the tower's ground floor and every
 * finished floor, inside the walls. A ladder also needs a finished floor
 * above it to climb to.
 */
function towerFootprint(s: SimState, req: Extract<PlaceRequest, { what: 'fixture' }>, fp: Footprint, level: number): Footprint {
  const t = s.tower!;
  fp.towerLevel = level;
  fp.y = standRow(level);
  for (let i = 0; i < fp.blocked.length; i++) {
    const x = fp.x0 + i;
    const wall = x <= t.x0 || x >= t.x1;
    const taken = s.sites.some((f) => f.kind !== 'foundation' && f.y === fp.y && x >= f.x0 && x <= f.x1);
    // a ladder already climbing from this room
    const ladder = tileAt(s, x, fp.y) === Tile.Ladder;
    fp.blocked[i] = wall || taken || ladder;
  }
  const label = FIXTURE_LABEL[req.fixture];
  if (level > s.floors) fp.error = `Floor ${level} isn't built yet.`;
  else if (req.fixture === 'ladder' && level + 1 > s.floors) fp.error = `A ladder needs a finished floor above it to climb to${s.projects.length ? `: floor ${level + 1} is still being built` : ''}.`;
  else if (level < (fixtureSpec(req.fixture).minStory ?? 0)) fp.error = `${label} can't go on ${storyName(level, true)}.`;
  else if (fp.blocked.some((b, i) => b && (fp.x0 + i <= t.x0 || fp.x0 + i >= t.x1))) fp.error = 'Fixtures go inside the tower’s walls.';
  else if (fp.blocked.some(Boolean)) fp.error = 'Something is already there.';
  return fp;
}

function groundFootprint(s: SimState, fp: Footprint): Footprint {
  const use = groundUse(s);
  for (let i = 0; i < fp.blocked.length; i++) {
    const x = fp.x0 + i;
    if (x < 0 || x >= s.width || use[x] !== null) fp.blocked[i] = true;
  }
  if (!fp.error && fp.blocked.some(Boolean)) {
    const what = fp.blocked.map((b, i) => (b ? use[fp.x0 + i] : null)).find((x) => x);
    fp.error = what ? `${what} is in the way.` : 'Off the edge of the land.';
  }
  return fp;
}

export function validatePlace(s: SimState, req: PlaceRequest): string | null {
  if (!Number.isInteger(req.x0)) return 'Pick a spot.';
  return footprint(s, req).error;
}

/** Lay out what was placed. Workers build it. Assumes validatePlace passed. */
export function applyPlace(s: SimState, req: PlaceRequest): void {
  const fp = footprint(s, req);
  switch (req.what) {
    case 'scriptorium': {
      const desk = newSite(s, { kind: 'scriptorium', label: 'Scriptorium', x0: fp.x0, x1: fp.x0 + BUILD.scriptorium.width - 1 });
      desk.build = newWorks(s, BUILD.scriptorium.cost);
      const bx = desk.x1 + 1 + BUILD.boardGap;
      const board = newSite(s, { kind: 'board', label: 'Job board', x0: bx, x1: bx + BUILD.board.width - 1 });
      board.build = newWorks(s, BUILD.board.cost);
      s.sites.push(desk, board);
      log(s, 'The scriptorium and the first job board are marked out.');
      patronBuilders(s);
      break;
    }
    case 'tower': {
      s.tower = { x0: fp.x0, x1: fp.x1 };
      s.sites.push(newSite(s, { kind: 'foundation', label: 'Tower site', x0: fp.x0, x1: fp.x1 }));
      log(s, 'The tower site is chosen. It can never be moved.');
      break;
    }
    case 'house': {
      const b = newBuilding(s, 'house', req.name.trim(), fp.x0, req.width, req.stories);
      b.build = newWorks(s, houseCost(req.width, req.stories));
      s.buildings.push(b);
      log(s, `Planned: ${b.name}, ${req.width} tiles wide${req.stories === 2 ? ', two stories' : ''}. Post "build camp" work to get it built.`);
      break;
    }
    case 'fixture': {
      const site = newSite(s, {
        kind: req.fixture,
        label: FIXTURE_LABEL[req.fixture],
        x0: fp.x0,
        x1: fp.x1,
        y: fp.y,
        level: fp.towerLevel ?? 0,
        buildingId: fp.building?.id ?? null,
        capacity: capacityOf(req.fixture),
      });
      const cost = BUILD.fixtures[req.fixture].cost;
      // something that costs nothing (a stockpile is just marked-out ground) is ready at once
      if (cost.stone + cost.wood > 0) site.build = newWorks(s, cost);
      s.sites.push(site);
      const where = fp.building ? ` in ${fp.building.name}` : fp.towerLevel !== null ? ` on ${storyName(fp.towerLevel, true)}` : ' on open ground';
      log(s, `Planned: ${site.label}${where}.${req.fixture === 'ladder' ? ' Post "build camp" work to get it built.' : ''}`);
      break;
    }
  }
}

export function capacityOf(kind: FixtureKind): number | null {
  if (kind === 'pantry') return BUILD.capacity.pantry;
  if (kind === 'bar') return BUILD.capacity.bar;
  if (kind === 'stockpile') return BUILD.capacity.stockpile;
  if (kind === 'shelves') return BUILD.capacity.shelves;
  return null;
}

/**
 * The patron has the scriptorium and board built for you: a few workers
 * are handed a card that says "build camp, all of it", written by the
 * patron's own clerk. Nobody had to write them.
 */
function patronBuilders(s: SimState): void {
  const crew = s.workers.filter((w) => !w.leaving && w.knack !== 'writing').slice(0, 4);
  for (const w of crew) {
    const card = newCarrier(s, [{ order: makeOrder('BUILD', 'CAMP'), count: ALL }], 1, { kind: 'worker', workerId: w.id }, true);
    giveCarrier(s, w, card);
  }
  if (crew.length) log(s, `The patron's clerk hands ${crew.map((w) => w.name).join(', ')} the order to build them.`);
}

// --------------------------------------------------------- the work itself

/** Something workers can work on: build up, or take apart. */
export interface Job {
  kind: 'site' | 'building';
  id: number;
  works: Works;
  demolish: boolean;
  /** Where builders stand while working on it. */
  y: number;
  x0: number;
  x1: number;
  label: string;
}

/**
 * Everything waiting for builders, in the order the player planned it.
 * Fixtures wait for their building. Demolition waits until the thing is
 * empty: a pantry, bar or stockpile until its goods are gone, a building
 * until its fixtures are.
 */
export function campJobs(s: SimState): Job[] {
  const jobs: Job[] = [];
  for (const b of s.buildings) {
    if (b.build) jobs.push({ kind: 'building', id: b.id, works: b.build, demolish: false, y: groundRow(), x0: b.x0, x1: b.x1, label: b.name });
    else if (b.demolish && !s.sites.some((x) => x.buildingId === b.id)) jobs.push({ kind: 'building', id: b.id, works: b.demolish, demolish: true, y: groundRow(), x0: b.x0, x1: b.x1, label: b.name });
  }
  for (const site of s.sites) {
    const b = buildingOf(s, site);
    if (site.build && !(b && b.build)) jobs.push({ kind: 'site', id: site.id, works: site.build, demolish: false, y: site.y, x0: site.x0, x1: site.x1, label: site.label });
    else if (site.demolish && storedTotal(site) === 0) jobs.push({ kind: 'site', id: site.id, works: site.demolish, demolish: true, y: site.y, x0: site.x0, x1: site.x1, label: site.label });
  }
  return jobs.sort((a, b) => a.works.since - b.works.since || a.id - b.id);
}

export function findJob(s: SimState, kind: Job['kind'], id: number): Job | null {
  return campJobs(s).find((j) => j.kind === kind && j.id === id) ?? null;
}

export function jobSpot(j: Job, workerId: number): Pt {
  return spotFor({ x0: j.x0, x1: j.x1, y: j.y }, workerId);
}

/** What still has to be brought for a job, before counting what's on its way. */
export function stillNeeded(j: Job, m: BuildMaterial): number {
  return j.demolish ? 0 : j.works.needs[m] - j.works.placed[m];
}

/** Set one unit in place. Returns true when that finished it. */
export function placeUnit(s: SimState, j: Job, m: BuildMaterial): boolean {
  j.works.placed[m] = Math.min(j.works.needs[m], j.works.placed[m] + 1);
  if (stillNeeded(j, 'stone') > 0 || stillNeeded(j, 'wood') > 0) return false;
  finishBuild(s, j);
  return true;
}

/** Take one unit apart. Returns true when that finished it. */
export function undoUnit(s: SimState, j: Job): boolean {
  j.works.undone++;
  if (j.works.undone < Math.max(1, worksUnits(j.works))) return false;
  finishDemolition(s, j);
  return true;
}

function finishBuild(s: SimState, j: Job): void {
  const units = worksUnits(j.works);
  if (j.kind === 'building') {
    const b = s.buildings.find((x) => x.id === j.id)!;
    b.build = null;
    if (b.stories === 2) layUpperFloor(s, b);
    log(s, `${b.name} is built. Fixtures can go in it now.`);
  } else {
    const site = s.sites.find((x) => x.id === j.id)!;
    site.build = null;
    const b = buildingOf(s, site);
    if (site.kind === 'ladder') layLadder(s, site);
    log(s, `${site.kind === 'board' || site.kind === 'scriptorium' ? `The ${site.label.toLowerCase()}` : site.label} is built${b ? ` in ${b.name}` : site.kind === 'ladder' ? `: the way up to floor ${site.level + 1}` : ''}.`);
    if (site.kind === 'scriptorium' || site.kind === 'board') checkFounding(s);
  }
  pleasePatron(s, units);
}

/** Building anything wins back a little patience, but only so far: the tower is what the patron wants. */
function pleasePatron(s: SimState, units: number): void {
  if (s.patience >= PATRON.otherBuildCap) return;
  s.patience = Math.min(PATRON.otherBuildCap, s.patience + units * PATRON.otherBuildPerUnit);
}

/** A finished tower ladder: from its room up through a hole in the deck above. */
function layLadder(s: SimState, site: Site): void {
  const r = ladderRows(site.level);
  for (let y = r.top; y <= r.bottom; y++) setTile(s, site.x0, y, Tile.Ladder);
}

/**
 * Take a tower ladder out: the hole in the deck is planked over. Anyone
 * left above with no other way down climbs down before it goes.
 */
function removeLadder(s: SimState, site: Site): void {
  const r = ladderRows(site.level);
  for (let y = r.top; y <= r.bottom; y++) if (tileAt(s, site.x0, y) === Tile.Ladder) setTile(s, site.x0, y, y === r.top ? Tile.Deck : Tile.Air);
  const down = { x: site.x0, y: site.y };
  for (const w of s.workers) {
    if (w.y >= site.y || findPath(s, { x: w.x, y: w.y }, { x: down.x, y: down.y }) !== null) continue;
    w.x = down.x;
    w.y = down.y;
    w.path = [];
    w.pathGoal = null;
    w.stepProgress = 0;
  }
}

/** The second story's floor: a deck across the building with a ladder up its left end. */
function layUpperFloor(s: SimState, b: Building): void {
  const deck = deckRow(1);
  for (let x = b.x0; x <= b.x1; x++) setTile(s, x, deck, Tile.Deck);
  for (let y = deck; y <= deck + TOWER.floorHeight - 1; y++) setTile(s, b.x0, y, Tile.Ladder);
}

function finishDemolition(s: SimState, j: Job): void {
  const salvage = (m: BuildMaterial) => Math.floor(j.works.placed[m] * BUILD.salvage);
  const at = siteCenter({ x0: j.x0, x1: j.x1, y: groundRow() });
  let dropped = 0;
  for (const m of ['stone', 'wood'] as const) {
    for (let i = 0; i < salvage(m); i++) {
      s.items.push({ id: s.nextId++, type: m, x: j.x0 + ((at.x + i) % (j.x1 - j.x0 + 1)), y: j.y, reservedBy: null });
      dropped++;
    }
  }
  if (j.kind === 'building') {
    const b = s.buildings.find((x) => x.id === j.id)!;
    if (b.stories === 2 && !b.build) clearUpperFloor(s, b);
    s.buildings = s.buildings.filter((x) => x !== b);
  } else {
    const site = s.sites.find((x) => x.id === j.id);
    if (site?.kind === 'ladder') removeLadder(s, site);
    s.sites = s.sites.filter((x) => x.id !== j.id);
  }
  log(s, `${j.label} is taken down${dropped ? `: ${dropped} ${dropped === 1 ? 'unit' : 'units'} of material left lying there to haul` : ''}.`);
}

/** Take the deck and ladder out. Anyone and anything up there comes down to the ground. */
function clearUpperFloor(s: SimState, b: Building): void {
  const deck = deckRow(1);
  for (let x = b.x0; x <= b.x1; x++) setTile(s, x, deck, Tile.Air);
  for (let y = deck; y <= deck + TOWER.floorHeight - 1; y++) if (tileAt(s, b.x0, y) === Tile.Ladder) setTile(s, b.x0, y, Tile.Air);
  const inside = (x: number, y: number) => x >= b.x0 && x <= b.x1 && y < groundRow() && y >= deck - TOWER.floorHeight;
  for (const w of s.workers) {
    if (!inside(w.x, w.y)) continue;
    w.y = groundRow();
    w.path = [];
    w.pathGoal = null;
    w.stepProgress = 0;
  }
  for (const it of s.items) if (inside(it.x, it.y)) it.y = groundRow();
}

// ------------------------------------------------------------ demolishing

export type DemolishTarget = { kind: 'site' | 'building'; id: number };

export function validateDemolish(s: SimState, t: DemolishTarget): string | null {
  if (t.kind === 'building') {
    const b = s.buildings.find((x) => x.id === t.id);
    if (!b) return 'Nothing there.';
    if (b.demolish) return 'Already being taken down.';
    return null;
  }
  const site = s.sites.find((x) => x.id === t.id);
  if (!site) return 'Nothing there.';
  if (site.kind === 'scriptorium') return 'The scriptorium stays. There is only ever one.';
  if (site.kind === 'foundation') return 'The tower site can never be moved.';
  if (site.kind === 'board') return "The job board stays (for now: there's only one board until upper boards are built).";
  if (site.supplies) return "The patron's supplies go when they're used up.";
  if (!(FIXTURE_KINDS as readonly string[]).includes(site.kind)) return "That's part of the land.";
  if (site.demolish) return 'Already being taken down.';
  return null;
}

/**
 * Mark something to be taken down. Workers with "build camp" do the work
 * once it's empty, and half the materials are left lying there.
 *
 * Something not finished yet is called off instead, at once: whatever was
 * already set in place is left lying there in full (nothing is lost).
 */
export function applyDemolish(s: SimState, t: DemolishTarget): void {
  const thing = t.kind === 'building' ? s.buildings.find((x) => x.id === t.id)! : s.sites.find((x) => x.id === t.id)!;
  const label = 'name' in thing ? thing.name : thing.label;
  if (thing.build) {
    const placed = thing.build.placed;
    const y = 'stories' in thing ? groundRow() : thing.y;
    const width = thing.x1 - thing.x0 + 1;
    let n = 0;
    for (const m of ['stone', 'wood'] as const) {
      for (let i = 0; i < placed[m]; i++) {
        s.items.push({ id: s.nextId++, type: m, x: thing.x0 + (n % width), y, reservedBy: null });
        n++;
      }
    }
    if (t.kind === 'building') {
      // its planned fixtures go with it (there can't be any yet, but be safe)
      s.sites = s.sites.filter((x) => x.buildingId !== t.id);
      s.buildings = s.buildings.filter((x) => x.id !== t.id);
    } else s.sites = s.sites.filter((x) => x.id !== t.id);
    log(s, `Called off: ${label}.${n ? ` The ${costLine(placed)} already set in place ${n === 1 ? 'is' : 'are'} left there to haul.` : ''}`);
    return;
  }
  const cost = 'stories' in thing ? houseCost(thing.x1 - thing.x0 + 1, thing.stories) : thing.kind === 'oven' && thing.broken ? BUILD.fixtures.oven.cost : BUILD.fixtures[thing.kind as FixtureKind].cost;
  thing.demolish = { needs: { ...cost }, placed: { ...cost }, undone: 0, since: s.tick };
  log(s, `Marked to be taken down: ${label}. Workers with "build camp" will do it once it's empty.`);
}

function costLine(c: Record<BuildMaterial, number>): string {
  return [c.wood ? `${c.wood} wood` : '', c.stone ? `${c.stone} stone` : ''].filter(Boolean).join(' and ');
}

export function validateRename(s: SimState, buildingId: number, name: string): string | null {
  const b = s.buildings.find((x) => x.id === buildingId);
  if (!b || b.kind !== 'house') return 'Only your own buildings can be renamed.';
  if (!name.trim()) return 'A building needs a name.';
  if (name.trim().length > BUILD.house.maxName) return `Names are at most ${BUILD.house.maxName} letters.`;
  return null;
}

export function applyRename(s: SimState, buildingId: number, name: string): void {
  const b = s.buildings.find((x) => x.id === buildingId)!;
  const old = b.name;
  b.name = name.trim();
  if (old !== b.name) log(s, `${old} is now called ${b.name}.`);
}

/**
 * Renaming a fixture, for players who want to micromanage: orders can then
 * name it ("haul stone to North Pile"). Its number stays, so orders written
 * with the number still find it. A blank name goes back to the number.
 * Names can't collide with another fixture's name or look like a number
 * ("Oven 2"), so an order never means two places.
 */
export function validateRenameFixture(s: SimState, siteId: number, name: string): string | null {
  const site = s.sites.find((x) => x.id === siteId);
  if (!site || site.num === 0) return 'Only fixtures can be renamed.';
  const n = name.trim();
  if (n.length > BUILD.house.maxName) return `Names are at most ${BUILD.house.maxName} letters.`;
  if (n === '') return null;
  const lower = n.toLowerCase();
  if (s.sites.some((x) => x !== site && x.named && x.label.toLowerCase() === lower)) return `Something is already called ${n}.`;
  const numbered = /^(.*?)\s*\d+$/.exec(lower);
  const kinds = [...Object.values(FIXTURE_LABEL).map((l) => l.toLowerCase()), 'shelves'];
  if (numbered && kinds.includes(numbered[1])) return 'That looks like another fixture’s number. Try a name.';
  return null;
}

export function applyRenameFixture(s: SimState, siteId: number, name: string): void {
  const site = s.sites.find((x) => x.id === siteId)!;
  const old = site.label;
  const n = name.trim();
  site.named = n !== '';
  site.label = site.named ? n : `${FIXTURE_LABEL[site.kind as FixtureKind]} ${site.num}`;
  if (old !== site.label) log(s, `${old} is now called ${site.label}.`);
}

// --------------------------------------------------- the founding moment

/**
 * When the scriptorium and the first board both stand, the patron's charter
 * is decreed: the first scribe is named, and a few starter notices go up.
 */
function checkFounding(s: SimState): void {
  if (s.charter) return;
  const done = (kind: 'scriptorium' | 'board') => s.sites.some((x) => x.kind === kind && x.build === null);
  if (!done('scriptorium') || !done('board')) return;
  decreeCharter(s);
}

export function decreeCharter(s: SimState): void {
  s.charter = true;
  const scribe = s.workers.find((w) => !w.leaving && w.knack === 'writing') ?? s.workers.find((w) => !w.leaving);
  if (scribe) {
    giveCarrier(s, scribe, scribeLoop(s, { kind: 'worker', workerId: scribe.id }, true));
    log(s, `The patron's charter is decreed. It names ${scribe.name} your scribe: write, deliver, repeat.`, scribe.id);
  }
  // a few notices so the camp gets going
  const starter: [WorkVerb, Noun, number, number][] = [
    ['MINE', 'STONE', 12, 2],
    ['CHOP', 'WOOD', 12, 2],
    ['HARVEST', 'GRAIN', 8, 2],
  ];
  for (const [verb, noun, count, wage] of starter) {
    pinNotice(s, makeOrder(verb, noun), count, wage, null);
    s.reserved += count * wage;
  }
}

/** Items a stockpile, pantry or bar is meant for. */
export function accepts(site: Site, type: ItemType): boolean {
  if (site.kind === 'pantry') return type === 'bread';
  if (site.kind === 'bar') return type === 'beer';
  if (site.kind === 'stockpile' || site.kind === 'shelves') return type === 'stone' || type === 'wood' || type === 'grain';
  return false;
}

/** For the tests and the prebuilt start: build a job straight away. */
export function finishNow(s: SimState, j: Job): void {
  for (const m of ['stone', 'wood'] as const) j.works.placed[m] = j.works.needs[m];
  finishBuild(s, j);
}


import { FIXTURE_WORD_KIND, STORES_FOR, levelName, type Place } from './lang';
import { randInt } from './rng';
import { BUILD, FIXTURE_LABEL, MAP, TOWER, WORLD, mapHeight } from './tuning';
import { FIXTURE_KINDS, Tile, isVehicleKind, type Building, type FixtureKind, type ItemType, type NatureKind, type Pt, type SimState, type Site, type SiteKind } from './types';

export function tileAt(s: SimState, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return Tile.Dirt;
  return s.tiles[y * s.width + x];
}

export function setTile(s: SimState, x: number, y: number, t: Tile): void {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return;
  s.tiles[y * s.width + x] = t;
}

export function isSolid(t: number): boolean {
  return t === Tile.Dirt || t === Tile.Deck;
}

/**
 * A worker (two tiles tall) can stand at (x, y) when both tiles they occupy
 * are open and they have something under their feet or a ladder to hold.
 */
export function standable(s: SimState, x: number, y: number): boolean {
  if (x < 0 || x >= s.width || y < 1 || y >= s.height) return false;
  const here = tileAt(s, x, y);
  if (isSolid(here) || isSolid(tileAt(s, x, y - 1))) return false;
  const below = tileAt(s, x, y + 1);
  // the top rung of a ladder works as floor, so ladders can pass through decks
  return isSolid(below) || here === Tile.Ladder || below === Tile.Ladder;
}

export function emptyStore(): Record<ItemType, number> {
  return { stone: 0, wood: 0, grain: 0, bread: 0, beer: 0 };
}

/** The first solid row: the ground, WORLD.below rows deep, at the bottom of the map. The map's height follows the patron's goal. */
export function groundTop(s: SimState): number {
  return s.height - WORLD.below;
}

/** The row workers stand on, on the ground. */
export function groundRow(s: SimState): number {
  return groundTop(s) - 1;
}

/** How many levels of tower this map has room for. */
export function towerRoom(s: SimState): number {
  return Math.floor((groundTop(s) - WORLD.above) / TOWER.floorHeight);
}

/**
 * Rows in one story of a building: its rooms are one wall sprite (24 px)
 * tall and stack straight on top of each other, with no deck showing
 * between them. The upstairs floor is an unseen deck in the top row of the
 * room below. (Tower floors are taller: TOWER.floorHeight, deck included.)
 */
export const HOUSE_STORY_ROWS = 3;

/** The row workers stand on in a building's story (0 = ground floor, 1 = upstairs). */
export function storyRow(s: SimState, story: number): number {
  return groundRow(s) - story * HOUSE_STORY_ROWS;
}

/** The row of the unseen deck a building's upstairs stands on. */
export function houseDeckRow(s: SimState): number {
  return storyRow(s, 1) + 1;
}

/** Which story of a building a row is in. The deck belongs to the room below it. */
export function storyOfRow(s: SimState, y: number): number {
  return Math.max(0, Math.floor((groundRow(s) - y) / HOUSE_STORY_ROWS));
}

export interface SiteInit {
  kind: SiteKind;
  label: string;
  x0: number;
  x1: number;
  y?: number;
  level?: number;
  capacity?: number | null;
  buildingId?: number | null;
  supplies?: boolean;
  broken?: boolean;
}

/** A new, finished site. Placing something to be built gives it works afterwards. */
export function newSite(s: SimState, d: SiteInit): Site {
  const num = isFixture(d.kind) && !d.supplies && !d.broken ? freeNumber(s, d.kind) : 0;
  return {
    id: s.nextId++,
    kind: d.kind,
    label: num ? `${d.label} ${num}` : d.label,
    num,
    named: false,
    x0: d.x0,
    x1: d.x1,
    y: d.y ?? groundRow(s),
    level: d.level ?? 0,
    store: emptyStore(),
    capacity: d.capacity === undefined ? null : d.capacity,
    buildingId: d.buildingId ?? null,
    build: null,
    demolish: null,
    broken: d.broken ?? false,
    supplies: d.supplies ?? false,
  };
}

function isFixture(kind: SiteKind): kind is FixtureKind {
  return (FIXTURE_KINDS as readonly string[]).includes(kind);
}

/** The lowest number no other fixture of this kind has. */
function freeNumber(s: SimState, kind: SiteKind): number {
  const taken = new Set(s.sites.filter((x) => x.kind === kind).map((x) => x.num));
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

/** Where a fixture stands, for its full name: its building, a tower floor, or the base. */
export function siteWhere(s: SimState, site: Site): string {
  const b = buildingOf(s, site);
  if (b) return b.name;
  if (site.level > 0) return levelName(site.level);
  return s.tower && site.x0 >= s.tower.x0 && site.x1 <= s.tower.x1 ? levelName(0) : 'Base';
}

/** A fixture's full name, as menus show it: "Stockpile 3 (Mess Hall)". */
export function siteTitle(s: SimState, site: Site): string {
  return site.num ? `${site.label} (${siteWhere(s, site)})` : site.label;
}

/** A site in running text: "stockpile 3", or a name as the player wrote it. */
export function siteRef(site: Site): string {
  return site.named ? site.label : site.label.toLowerCase();
}

export function newBuilding(s: SimState, kind: Building['kind'], name: string, x0: number, width: number, stories: 1 | 2): Building {
  return { id: s.nextId++, kind, name, x0, x1: x0 + width - 1, stories, build: null, demolish: null };
}

// ------------------------------------------------------------------ the map

function fillGround(s: SimState): void {
  s.width = WORLD.width;
  s.height = mapHeight(s.settings.goal);
  s.tiles = new Array(s.width * s.height).fill(Tile.Air);
  for (let y = groundTop(s); y < s.height; y++) {
    for (let x = 0; x < s.width; x++) setTile(s, x, y, Tile.Dirt);
  }
}

const NATURE_LABEL: Record<NatureKind, string> = {
  home: 'Road home',
  forest: 'Forest',
  field: 'Field',
  well: 'Well',
  quarry: 'Quarry',
};

function addNature(s: SimState, kind: NatureKind, x0: number, width: number): void {
  s.sites.push(newSite(s, { kind, label: NATURE_LABEL[kind], x0, x1: x0 + width - 1 }));
}

/** The old shack: always on the map, with a broken oven in it. The demolition tutorial uses it. */
function addShack(s: SimState, x0: number): void {
  const shack = newBuilding(s, 'shack', 'Old shack', x0, MAP.shack, 1);
  s.buildings.push(shack);
  s.sites.push(newSite(s, { kind: 'oven', label: 'Broken oven', x0: x0 + 2, x1: x0 + 3, buildingId: shack.id, broken: true }));
}

/** The patron's starting supplies: a pile to take from until there's somewhere to store things. */
function addSupplies(s: SimState, x0: number): void {
  const pile = newSite(s, { kind: 'stockpile', label: "Patron's supplies", x0, x1: x0 + MAP.supplies - 1, capacity: 0, supplies: true });
  for (const [k, n] of Object.entries(BUILD.supplies)) pile.store[k as ItemType] = Math.round(n * s.settings.supplies);
  s.sites.push(pile);
}

/**
 * A fresh map for the P1 opening. The road home runs off the left edge and
 * the right edge is kept clear. The forest, quarry, field, well, the old
 * shack and the patron's supplies land in random order with random gaps,
 * leaving the rest of the land for the player.
 */
export function generateMap(s: SimState): void {
  fillGround(s);
  addNature(s, 'home', 0, MAP.roadWidth);
  type Feature = { kind: NatureKind | 'shack' | 'supplies'; width: number };
  const features: Feature[] = [
    { kind: 'forest', width: MAP.forest },
    { kind: 'quarry', width: MAP.quarry },
    { kind: 'field', width: MAP.field },
    { kind: 'well', width: MAP.well },
    { kind: 'shack', width: MAP.shack },
    { kind: 'supplies', width: MAP.supplies },
  ];
  // shuffle (Fisher-Yates on the sim's own generator)
  for (let i = features.length - 1; i > 0; i--) {
    const j = randInt(s.rng, 0, i);
    [features[i], features[j]] = [features[j], features[i]];
  }
  const left = MAP.roadWidth + MAP.minGap;
  const right = s.width - MAP.reservedRight;
  const used = features.reduce((n, f) => n + f.width, 0);
  // share the free land out as random gaps between features (at least minGap each)
  const slack = right - left - used - MAP.minGap * features.length;
  const cuts: number[] = [];
  for (let i = 0; i <= features.length; i++) cuts.push(randInt(s.rng, 0, 99));
  const total = cuts.reduce((a, b) => a + b, 0) || 1;
  let x = left;
  features.forEach((f, i) => {
    x += Math.floor((slack * cuts[i]) / total);
    if (f.kind === 'shack') addShack(s, x);
    else if (f.kind === 'supplies') addSupplies(s, x);
    else addNature(s, f.kind, x, f.width);
    x += f.width + MAP.minGap;
  });
}

/** A fixed map with the natural features where P0 had them. Used by the prebuilt start. */
export function fixedMap(s: SimState): void {
  fillGround(s);
  addNature(s, 'home', 0, MAP.roadWidth);
  addNature(s, 'forest', 6, MAP.forest);
  addNature(s, 'field', 20, MAP.field);
  addNature(s, 'well', 34, MAP.well);
  addNature(s, 'quarry', 108, MAP.quarry);
  addShack(s, 130);
}

// ------------------------------------------------------------- finding sites

/** Finished, working, and not being taken down. */
export function usable(site: Site): boolean {
  return site.build === null && !site.broken;
}

/** The first finished site of a kind, if there is one. */
export function findSite(s: SimState, kind: SiteKind): Site | null {
  return s.sites.find((x) => x.kind === kind && usable(x)) ?? null;
}

/** The first site of a kind. Throws if there isn't one (the road home and natural features always exist). */
export function siteOf(s: SimState, kind: SiteKind): Site {
  const site = s.sites.find((x) => x.kind === kind && !x.supplies);
  if (!site) throw new Error(`missing site ${kind}`);
  return site;
}

export function sitesOf(s: SimState, kind: SiteKind): Site[] {
  return s.sites.filter((x) => x.kind === kind && usable(x));
}

/** Finished stockpiles, including the patron's supplies (which can only be taken from). */
export function stockpiles(s: SimState): Site[] {
  return s.sites.filter((x) => (x.kind === 'stockpile' || x.kind === 'shelves') && usable(x));
}

export function storedTotal(site: Site): number {
  let n = 0;
  for (const k in site.store) n += site.store[k as ItemType];
  return n;
}

/** How much more a site will take. Nothing goes into a site being taken down. */
export function roomIn(site: Site): number {
  if (site.demolish || !usable(site)) return 0;
  if (site.capacity === null) return Infinity;
  return Math.max(0, site.capacity - storedTotal(site));
}

/**
 * Goods on their way into a store: what workers bringing goods there have
 * spoken for (a hauler's load, a cook's batch). Anyone but `except` (the
 * worker asking, by identity).
 */
export function incoming(s: SimState, site: Site, except: unknown = null): number {
  let n = 0;
  for (const w of s.workers) if (w !== except && w.activity.into === site.id) n += w.activity.bringing ?? 0;
  return n;
}

/** Room in a store that nobody is already bringing goods to fill. */
export function freeRoom(s: SimState, site: Site, except: unknown = null): number {
  const room = roomIn(site);
  return room === Infinity ? room : Math.max(0, room - incoming(s, site, except));
}

/** Walking distance, roughly: climbing counts extra. */
export function distance(a: Pt, b: Pt): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) * 3;
}

export function nearest<T extends Site>(sites: T[], from: Pt): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const site of sites) {
    const d = distance(siteCenter(site), from);
    if (d < bestD) {
      bestD = d;
      best = site;
    }
  }
  return best;
}

/** The stockpile a place in an order means. At the base, the nearest one that fits the bill. */
export function stockpilesAt(s: SimState, level: number): Site[] {
  return stockpiles(s).filter((x) => x.level === level);
}

/** The tower floor's own stockpile (P0 stand-in: every finished floor gets one). */
export function stockpileOn(s: SimState, level: number): Site | null {
  return stockpilesAt(s, level).find((x) => !x.supplies) ?? null;
}

/** Finished stores that keep this good, plus the patron's supplies (only ever taken from). */
export function storesFor(s: SimState, type: ItemType): Site[] {
  const kinds: readonly string[] = STORES_FOR[type.toUpperCase() as keyof typeof STORES_FOR];
  return s.sites.filter((x) => usable(x) && (x.supplies ? x.store[type] > 0 || kinds.includes(x.kind) : kinds.includes(x.kind)));
}

/** Is this inside the tower's walls (any level, the Ground Level room included)? */
export function inTowerSpan(s: SimState, x: { x0: number; x1: number }): boolean {
  return !!s.tower && x.x1 >= s.tower.x0 && x.x0 <= s.tower.x1;
}

/** The stores of this good that an order's place means (null = all of them). Finished ones only. */
export function storesAt(s: SimState, place: Place | null, type: ItemType): Site[] {
  const named = storesFor(s, type);
  // a wheelbarrow or cart only counts when it's named: goods never go into one (or come out of one) by default
  const all = named.filter((x) => !isVehicleKind(x.kind));
  if (place === null) return all;
  if (typeof place === 'number') return all.filter((x) => x.level === place);
  if (place === 'tower') return all.filter((x) => x.level > 0);
  if (place === 'camp') return all.filter((x) => !inTowerSpan(s, x));
  return storesNamed(named, place);
}

function storesNamed(all: Site[], place: Place): Site[] {
  if (typeof place !== 'object') return [];
  if ('fixture' in place) return all.filter((x) => x.kind === FIXTURE_WORD_KIND[place.fixture] && x.num === place.n);
  const name = place.name.toLowerCase();
  return all.filter((x) => x.named && x.label.toLowerCase() === name);
}

/** The wheelbarrows or carts an order's place names (by number or name). */
export function vehiclesAt(s: SimState, place: Place | null): Site[] {
  if (place === null || typeof place !== 'object') return [];
  const all = s.sites.filter((x) => isVehicleKind(x.kind));
  if ('fixture' in place) return all.filter((x) => x.kind === FIXTURE_WORD_KIND[place.fixture] && x.num === place.n);
  const name = place.name.toLowerCase();
  return all.filter((x) => x.named && x.label.toLowerCase() === name);
}

/** The nearest store at a place with this good in it (supplies count). */
export function sourceFor(s: SimState, place: Place, type: ItemType, from: Pt): Site | null {
  return nearest(storesAt(s, place, type).filter((x) => x.store[type] > 0), from);
}

/** The nearest store at a place (null = anywhere) with room for more, other than the ones in `not`. */
/**
 * The nearest store at a place that will take this good: one with room
 * for all `need` if there is one, or else any with room. Room others are
 * already bringing goods to fill doesn't count (`from` is the worker
 * asking, whose own load does).
 */
export function depotFor(s: SimState, place: Place | null, type: ItemType, from: Pt, not: readonly Site[] = [], need = 1): Site | null {
  const open = storesAt(s, place, type).filter((x) => !not.includes(x) && freeRoom(s, x, from) > 0);
  return nearest(open.filter((x) => freeRoom(s, x, from) >= need), from) ?? nearest(open, from);
}

export function buildingOf(s: SimState, site: Site): Building | null {
  return site.buildingId === null ? null : s.buildings.find((b) => b.id === site.buildingId) ?? null;
}

/**
 * A spot inside a site for this worker. Workers spread out by id so they
 * don't all stack on one tile.
 */
export function spotFor(site: { x0: number; x1: number; y: number }, workerId: number): Pt {
  const w = site.x1 - site.x0 + 1;
  return { x: site.x0 + (workerId * 7) % w, y: site.y };
}

export function siteCenter(site: { x0: number; x1: number; y: number }): Pt {
  return { x: Math.floor((site.x0 + site.x1) / 2), y: site.y };
}

export function inSite(site: Site, x: number, y: number): boolean {
  return y === site.y && x >= site.x0 && x <= site.x1;
}

/** A building's label: its name and what's inside, e.g. "Dormitory (Bed, Bed, Pantry)". */
/**
 * A building's map label: its name and what's in it. Stores show their
 * number or name (orders use them); everything else is just counted, so a
 * dorm reads "Dorm (Bed ×6)" rather than six numbers.
 */
export function buildingLabel(s: SimState, b: Building): string {
  const parts: string[] = [];
  const counts = new Map<string, number>();
  for (const x of s.sites) {
    if (x.buildingId !== b.id) continue;
    if (x.kind === 'stockpile' || x.kind === 'shelves') parts.push(x.label);
    else {
      const k = x.broken ? x.label : FIXTURE_LABEL[x.kind as FixtureKind];
      if (!counts.has(k)) parts.push(k);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const text = parts.map((p) => ((counts.get(p) ?? 1) > 1 ? `${p} ×${counts.get(p)}` : p));
  return text.length ? `${b.name} (${text.join(', ')})` : b.name;
}

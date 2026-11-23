import { randInt } from './rng';
import { BUILD, MAP, TOWER, WORLD } from './tuning';
import { Tile, type Building, type ItemType, type NatureKind, type Pt, type SimState, type Site, type SiteKind } from './types';

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

/** The row workers stand on, on the ground. */
export function groundRow(): number {
  return WORLD.groundRow - 1;
}

/** The row workers stand on in a building's story (0 = ground floor, 1 = upstairs). */
export function storyRow(story: number): number {
  return groundRow() - story * TOWER.floorHeight;
}

/** Which story of a building a standing row is on. */
export function storyOfRow(y: number): number {
  return Math.max(0, Math.round((groundRow() - y) / TOWER.floorHeight));
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
  return {
    id: s.nextId++,
    kind: d.kind,
    label: d.label,
    x0: d.x0,
    x1: d.x1,
    y: d.y ?? groundRow(),
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

export function newBuilding(s: SimState, kind: Building['kind'], name: string, x0: number, width: number, stories: 1 | 2): Building {
  return { id: s.nextId++, kind, name, x0, x1: x0 + width - 1, stories, build: null, demolish: null };
}

// ------------------------------------------------------------------ the map

function fillGround(s: SimState): void {
  s.width = WORLD.width;
  s.height = WORLD.height;
  s.tiles = new Array(s.width * s.height).fill(Tile.Air);
  for (let y = WORLD.groundRow; y < s.height; y++) {
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
  for (const [k, n] of Object.entries(BUILD.supplies)) pile.store[k as ItemType] = n;
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
  return sitesOf(s, 'stockpile');
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

/** The nearest stockpile at a place with this good in it (supplies count). */
export function sourceFor(s: SimState, level: number, type: ItemType, from: Pt): Site | null {
  return nearest(stockpilesAt(s, level).filter((x) => x.store[type] > 0), from);
}

/** The nearest stockpile at a place with room for more. */
export function depotFor(s: SimState, level: number, from: Pt): Site | null {
  return nearest(stockpilesAt(s, level).filter((x) => roomIn(x) > 0), from);
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
export function buildingLabel(s: SimState, b: Building): string {
  const inside = s.sites.filter((x) => x.buildingId === b.id).map((x) => x.label);
  return inside.length ? `${b.name} (${inside.join(', ')})` : b.name;
}

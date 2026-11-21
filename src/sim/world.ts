import { Tile, type ItemType, type Pt, type SimState, type Site, type SiteKind } from './types';
import { WORLD } from './tuning';

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
  return { stone: 0, wood: 0, grain: 0, bread: 0 };
}

interface SiteDef {
  kind: SiteKind;
  label: string;
  x0: number;
  x1: number;
}

/** P0 ground layout, left to right. The road home is at the left edge. */
const LAYOUT: SiteDef[] = [
  { kind: 'home', label: 'Road home', x0: 0, x1: 3 },
  { kind: 'forest', label: 'Forest', x0: 6, x1: 17 },
  { kind: 'field', label: 'Field', x0: 20, x1: 31 },
  { kind: 'well', label: 'Well', x0: 34, x1: 35 },
  { kind: 'kitchen', label: 'Kitchen', x0: 38, x1: 43 },
  { kind: 'beds', label: 'Bunkhouse', x0: 45, x1: 51 },
  { kind: 'scriptorium', label: 'Scriptorium', x0: 53, x1: 58 },
  { kind: 'board', label: 'Job board', x0: 60, x1: 61 },
  { kind: 'stockpile', label: 'Stockpile', x0: 63, x1: 71 },
  { kind: 'foundation', label: 'Tower site', x0: 74, x1: 93 },
  { kind: 'tavern', label: 'Tavern', x0: 97, x1: 104 },
  { kind: 'quarry', label: 'Quarry', x0: 108, x1: 123 },
];

export function buildWorld(s: SimState): void {
  s.width = WORLD.width;
  s.height = WORLD.height;
  s.tiles = new Array(s.width * s.height).fill(Tile.Air);
  for (let y = WORLD.groundRow; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) setTile(s, x, y, Tile.Dirt);
  }
  const standRow = WORLD.groundRow - 1;
  s.sites = LAYOUT.map((d) => ({
    id: s.nextId++,
    kind: d.kind,
    label: d.label,
    x0: d.x0,
    x1: d.x1,
    y: standRow,
    store: emptyStore(),
  }));
}

export function siteOf(s: SimState, kind: SiteKind): Site {
  const site = s.sites.find((x) => x.kind === kind);
  if (!site) throw new Error(`missing site ${kind}`);
  return site;
}

/**
 * A spot inside a site for this worker. Workers spread out by id so they
 * don't all stack on one tile.
 */
export function spotFor(site: Site, workerId: number): Pt {
  const w = site.x1 - site.x0 + 1;
  return { x: site.x0 + (workerId * 7) % w, y: site.y };
}

export function siteCenter(site: Site): Pt {
  return { x: Math.floor((site.x0 + site.x1) / 2), y: site.y };
}

export function inSite(site: Site, x: number, y: number): boolean {
  return y === site.y && x >= site.x0 && x <= site.x1;
}

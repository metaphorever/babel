import { log } from './actions';
import { patronFloorDone } from './patron';
import { TOWER, WORLD } from './tuning';
import { Tile, type BuildMaterial, type Pt, type Project, type SimState, type Site } from './types';
import { newSite, setTile, tileAt } from './world';

// Tower geometry. Floor k's deck sits 4k rows above the ground. Building
// floor k means raising the stone walls of the story below it and laying
// its wooden deck, working from the floor below. A ladder goes in last,
// alternating sides so every trip up crosses each floor.

export function deckRow(level: number): number {
  return WORLD.groundRow - level * TOWER.floorHeight;
}

/** The row workers stand on at a level (0 = the ground). */
export function standRow(level: number): number {
  return deckRow(level) - 1;
}

/** The tower's footprint. Only called once the site has been chosen. */
export function towerSpan(s: SimState): { x0: number; x1: number } {
  if (!s.tower) throw new Error('no tower site yet');
  return s.tower;
}

export function ladderX(s: SimState, level: number): number {
  const t = towerSpan(s);
  return level % 2 === 1 ? t.x0 + 1 : t.x1 - 1;
}

/** Where builders stand to work on a floor: spread across the story below it. */
export function buildSpot(s: SimState, level: number, workerId: number): Pt {
  const t = towerSpan(s);
  const width = t.x1 - t.x0 - 3;
  return { x: t.x0 + 2 + ((workerId * 5) % width), y: standRow(level - 1) };
}

/** Where blueprints are delivered: the middle of the top finished floor. */
export function topSpot(s: SimState): Pt {
  const t = towerSpan(s);
  return { x: Math.floor((t.x0 + t.x1) / 2), y: standRow(s.floors) };
}

export function newProject(s: SimState, level: number): Project {
  return {
    id: s.nextId++,
    level,
    needs: { stone: TOWER.stonePerFloor, wood: TOWER.woodPerFloor },
    placed: { stone: 0, wood: 0 },
  };
}

/** The floor builders work on now: the lowest one under way. */
export function activeProject(s: SimState): Project | null {
  return s.projects[0] ?? null;
}

/** Which material the project still needs, stone first (walls go up before the deck). */
export function neededMaterial(p: Project): BuildMaterial | null {
  if (p.placed.stone < p.needs.stone) return 'stone';
  if (p.placed.wood < p.needs.wood) return 'wood';
  return null;
}

export function projectFraction(p: Project): number {
  const need = p.needs.stone + p.needs.wood;
  return need === 0 ? 1 : (p.placed.stone + p.placed.wood) / need;
}

/**
 * A blueprint arrived at the top. It starts the next floor that isn't
 * already planned.
 */
export function startFloorFromBlueprint(s: SimState): Project | null {
  const planned = s.floors + s.projects.length;
  if (planned >= TOWER.maxFloors || !s.tower) return null;
  const p = newProject(s, planned + 1);
  s.projects.push(p);
  log(s, `A blueprint for floor ${p.level} is up. Builders can start.`);
  return p;
}

/** Set one unit of material in place, drawing the walls and deck as they grow. */
export function placeMaterial(s: SimState, p: Project, m: BuildMaterial): void {
  p.placed[m] = Math.min(p.needs[m], p.placed[m] + 1);
  drawProgress(s, p);
  if (neededMaterial(p) === null) completeFloor(s, p);
}

function drawProgress(s: SimState, p: Project): void {
  const T = towerSpan(s);
  const deck = deckRow(p.level);
  // walls: three rows on each side of the story below, bottom up
  const wallTiles = Math.floor((p.placed.stone / p.needs.stone) * 6);
  for (let i = 0; i < wallTiles; i++) {
    const row = deck + 3 - Math.floor(i / 2);
    const x = i % 2 === 0 ? T.x0 : T.x1;
    if (tileAt(s, x, row) === Tile.Air) setTile(s, x, row, Tile.Wall);
  }
  // deck: planks laid from the middle outward. With an even width the
  // middle sits left of center, so the outward sweep starts to the right:
  // mid, mid+1, mid-1, mid+2 ... which ends exactly at x0 and x1.
  const width = T.x1 - T.x0 + 1;
  const planks = Math.floor((p.placed.wood / p.needs.wood) * width);
  const mid = Math.floor((T.x0 + T.x1) / 2);
  for (let i = 0; i < planks; i++) {
    const x = mid + (i % 2 === 1 ? (i + 1) / 2 : -i / 2);
    setTile(s, x, deck, Tile.Deck);
  }
}

function completeFloor(s: SimState, p: Project): void {
  const deck = deckRow(p.level);
  // the ladder runs from the story below up through a hole in the new deck
  const lx = ladderX(s, p.level);
  for (let y = deck; y <= deck + TOWER.floorHeight - 1; y++) setTile(s, lx, y, Tile.Ladder);
  s.floors = p.level;
  s.projects = s.projects.filter((x) => x !== p);
  s.sites.push(floorStockpile(s, p.level));
  patronFloorDone(s, p.level);
  log(s, `Floor ${p.level} is finished! The tower stands ${p.level} ${p.level === 1 ? 'floor' : 'floors'} tall.`);
}

function floorStockpile(s: SimState, level: number): Site {
  const x0 = towerSpan(s).x0 + TOWER.stockpileInset;
  return newSite(s, { kind: 'stockpile', label: 'Stockpile', x0, x1: x0 + TOWER.stockpileWidth - 1, y: standRow(level), level });
}

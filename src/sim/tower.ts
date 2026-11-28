import { log } from './actions';
import { floorName, levelName } from './lang';
import { patronFloorDone } from './patron';
import { TOWER } from './tuning';
import { Tile, type BuildMaterial, type Pt, type Project, type SimState } from './types';
import { groundTop, setTile, tileAt, towerRoom } from './world';

// Tower geometry. Floor k's deck sits 4k rows above the ground. Building
// floor k means raising the stone walls of the story below it and laying
// its wooden deck, working from the floor below. A finished floor is an
// empty room: the ladder up to it, and everything else in it, are fixtures
// the player places and workers build.

export function deckRow(s: SimState, level: number): number {
  return groundTop(s) - level * TOWER.floorHeight;
}

/** The row workers stand on at a level (0 = the ground). */
export function standRow(s: SimState, level: number): number {
  return deckRow(s, level) - 1;
}

/** The tower's footprint. Only called once the site has been chosen. */
export function towerSpan(s: SimState): { x0: number; x1: number } {
  if (!s.tower) throw new Error('no tower site yet');
  return s.tower;
}

/** Where builders stand to work on a floor: spread across the story below it. */
export function buildSpot(s: SimState, level: number, workerId: number): Pt {
  const t = towerSpan(s);
  const width = t.x1 - t.x0 - 3;
  return { x: t.x0 + 2 + ((workerId * 5) % width), y: standRow(s, level - 1) };
}

/** Where blueprints are delivered: the middle of the top finished floor. */
export function topSpot(s: SimState): Pt {
  const t = towerSpan(s);
  return { x: Math.floor((t.x0 + t.x1) / 2), y: standRow(s, s.floors) };
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
  if (planned >= towerRoom(s) || !s.tower) return null;
  const p = newProject(s, planned + 1);
  s.projects.push(p);
  log(s, `A blueprint for ${floorName(p.level)} is up. Builders can start.`);
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
  const deck = deckRow(s, p.level);
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
  s.floors = p.level;
  s.projects = s.projects.filter((x) => x !== p);
  patronFloorDone(s, p.level);
  log(s, `${floorName(p.level)} is finished! The tower stands ${p.level} ${p.level === 1 ? 'level' : 'levels'} tall. Place a ladder on ${levelName(p.level - 1)} so workers can climb onto its roof and build the next level.`);
}

/** The rows a ladder on this level fills: from its room up through the deck of the floor above. */
export function ladderRows(s: SimState, level: number): { top: number; bottom: number } {
  return { top: deckRow(s, level + 1), bottom: standRow(s, level) };
}

/** Is there a finished ladder from this level up to the next? */
export function hasLadderUp(s: SimState, level: number): boolean {
  return s.sites.some((x) => x.kind === 'ladder' && x.level === level && x.build === null && !x.demolish);
}

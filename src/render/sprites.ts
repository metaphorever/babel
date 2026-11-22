import type { ItemType } from '../sim';
import { INK, PAPER } from './patterns';

// Sprites are built from character grids: '1' ink, '0' paper, '.' clear.
// Workers are assembled procedurally from their look seed, so every worker
// gets a distinct little pawn. This is placeholder art for P0; the real
// generator gets its own art pass later.

type Grid = string[];

const cache = new Map<string, HTMLCanvasElement>();

function toCanvas(grid: Grid): HTMLCanvasElement {
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const ch = grid[y][x];
      if (ch === '.') continue;
      g.fillStyle = ch === '1' ? INK : PAPER;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function mirror(grid: Grid): Grid {
  return grid.map((r) => r.split('').reverse().join(''));
}

/** Rotate a grid a quarter turn clockwise (for lying down). */
function rotate(grid: Grid): Grid {
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));
  const out: string[] = [];
  for (let c = 0; c < w; c++) {
    let row = '';
    for (let r = h - 1; r >= 0; r--) row += grid[r][c] ?? '.';
    out.push(row);
  }
  return out;
}

function robeFill(kind: number, c: number, r: number): string {
  switch (kind) {
    case 1:
      return (c + r) % 2 === 0 ? '1' : '0';
    case 2:
      return (c + r * 2) % 4 === 0 ? '0' : '1';
    case 3:
      return c % 2 === 0 ? '1' : '0';
    default:
      return '0';
  }
}

/** Build the facing-right grid for a look seed and walk frame. */
function workerGrid(look: number, frame: number): Grid {
  const robe = look & 3;
  const hat = (look >>> 2) & 3;
  const beard = ((look >>> 4) & 1) === 1;
  const tall = ((look >>> 5) & 1) === 1;

  const rows: string[][] = [];
  const row = (s: string) => rows.push(s.split(''));

  // headwear
  if (hat === 1) row('...111...');
  else if (hat === 2) row('..1.1.1..');
  else if (hat === 3) row('..11111..');
  else row('.........');
  // head (eye on the facing side)
  row(hat === 2 ? '.1111111.' : '..11111..');
  row(hat === 3 ? '.1100011.' : '..10001..');
  row(hat === 3 ? '.1100101.' : '..10010..');
  row(beard ? (hat === 3 ? '.1101111.' : '..10111..') : hat === 3 ? '.1100011.' : '..10001..');
  row('..11111..');
  // robe
  row('.1111111.');
  const robeRows = tall ? 5 : 4;
  for (let i = 0; i < robeRows; i++) {
    const r = ['.', '1'];
    for (let c = 2; c <= 6; c++) r.push(robeFill(robe, c, i));
    r.push('1', '.');
    rows.push(r);
  }
  {
    const r = ['1'];
    for (let c = 1; c <= 7; c++) r.push(robeFill(robe, c, robeRows));
    r.push('1');
    rows.push(r);
  }
  row('111111111');
  // feet
  row(frame === 0 ? '..1...1..' : frame === 1 ? '...1.1...' : '...1.1...');
  return rows.map((r) => r.join(''));
}

export function workerSprite(look: number, frame: number, facing: 1 | -1, lying: boolean): HTMLCanvasElement {
  const key = `w${look & 63}:${frame}:${facing}:${lying ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) {
    let g = workerGrid(look, lying ? 2 : frame);
    if (lying) g = rotate(g);
    if (facing < 0) g = mirror(g);
    c = toCanvas(g);
    cache.set(key, c);
  }
  return c;
}

const ITEMS: Record<ItemType, Grid> = {
  stone: ['.11.', '1101', '1111'],
  wood: ['11111', '10101', '11111'],
  grain: ['101', '010', '111'],
  bread: ['.111.', '10001', '11111'],
};

export function itemSprite(type: ItemType): HTMLCanvasElement {
  const key = `i${type}`;
  let c = cache.get(key);
  if (!c) {
    c = toCanvas(ITEMS[type]);
    cache.set(key, c);
  }
  return c;
}

const PROPS: Record<string, Grid> = {
  // a rolled scroll, held at the side
  scroll: ['.11.', '1001', '1001', '1001', '.11.'],
  // a courier's satchel
  bag: ['.11.', '1..1', '1111', '1001', '1111'],
  // a single sheet on the scriptorium desk
  sheet: ['111', '101', '111'],
};

export function propSprite(name: keyof typeof PROPS): HTMLCanvasElement {
  const key = `p${name}`;
  let c = cache.get(key);
  if (!c) {
    c = toCanvas(PROPS[name]);
    cache.set(key, c);
  }
  return c;
}

const GLYPHS: Record<string, Grid> = {
  z: ['1111', '..1.', '.1..', '1111'],
  '!': ['1', '1', '1', '.', '1'],
  '?': ['111', '..1', '.1.', '...', '.1.'],
  '$': ['.1.', '111', '1..', '111', '..1', '111', '.1.'],
};

/**
 * A reaction glyph inside a little thought cloud: white inside, black rim,
 * with a trail of two small bubbles down-left toward the worker's head.
 * The white fill keeps it readable against dark roofs and walls.
 */
export function thoughtSprite(ch: string): HTMLCanvasElement {
  const key = `t${ch}`;
  let c = cache.get(key);
  if (!c) {
    c = toCanvas(thoughtGrid(GLYPHS[ch] ?? GLYPHS['?']));
    cache.set(key, c);
  }
  return c;
}

function thoughtGrid(glyph: Grid): Grid {
  const gw = Math.max(...glyph.map((r) => r.length));
  const gh = glyph.length;
  const W = Math.max(gw + 6, 9);
  const H = gh + 4;
  const left = 3 + Math.floor((W - 6 - gw) / 2);
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const edgeRow = y === 0 || y === H - 1;
      const edgeCol = x === 0 || x === W - 1;
      if (edgeRow && edgeCol) row += '.'; // rounded corners
      else if (edgeRow || edgeCol) row += '1';
      else {
        const g = glyph[y - 2]?.[x - left];
        row += g === '1' ? '1' : '0';
      }
    }
    rows.push(row);
  }
  // the trail: a small bubble, then a dot, heading down-left
  rows.push('.111' + '.'.repeat(W - 4));
  rows.push('.101' + '.'.repeat(W - 4));
  rows.push('.111' + '.'.repeat(W - 4));
  rows.push('1' + '.'.repeat(W - 1));
  return rows;
}

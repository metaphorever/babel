import type { ItemType } from '../sim';
import { INK, PAPER } from './patterns';
import {
  BODY_CENTER_X,
  CELL,
  composeWorker,
  defaultArt,
  mirror,
  rotate,
  thoughtGrid,
  trim,
  type ArtSet,
  type Grid,
} from './spriteData';

// Turns art (grids) into canvases, cached. The art starts as the built-in
// placeholder set; loadArt() swaps in PNG sheets from public/art/ if they
// exist (see docs/SPRITES.md).

let art: ArtSet = defaultArt();
const cache = new Map<string, HTMLCanvasElement>();

export function setArt(next: ArtSet): void {
  art = next;
  cache.clear();
}

export function currentArt(): ArtSet {
  return art;
}

function toCanvas(grid: Grid): HTMLCanvasElement {
  const h = grid.length;
  const w = Math.max(1, ...grid.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const ch = grid[y][x];
      if (ch !== '1' && ch !== '0') continue;
      g.fillStyle = ch === '1' ? INK : PAPER;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function cached(key: string, make: () => Grid): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) {
    c = toCanvas(make());
    cache.set(key, c);
  }
  return c;
}

export interface WorkerSprite {
  canvas: HTMLCanvasElement;
  /** The column to line up with the worker's position (their feet stay on the bottom row). */
  anchorX: number;
}

export function workerSprite(look: number, frame: number, facing: 1 | -1, lying: boolean): WorkerSprite {
  const key = `w${look}:${frame}:${facing}:${lying ? 1 : 0}`;
  let canvas = cache.get(key);
  if (!canvas) {
    let g = composeWorker(art, look, lying ? 0 : frame);
    if (lying) g = trim(rotate(g));
    if (facing < 0) g = mirror(g);
    canvas = toCanvas(g);
    cache.set(key, canvas);
  }
  const anchorX = lying ? Math.floor(canvas.width / 2) : facing > 0 ? BODY_CENTER_X : CELL - 1 - BODY_CENTER_X;
  return { canvas, anchorX };
}

export function itemSprite(type: ItemType): HTMLCanvasElement {
  return cached(`i${type}`, () => art.items[type] ?? ['1']);
}

export function propSprite(name: 'scroll' | 'bag' | 'sheet'): HTMLCanvasElement {
  return cached(`p${name}`, () => art.props[name] ?? ['1']);
}

/** A reaction glyph (? ! $ z b) inside a thought cloud. */
export function thoughtSprite(ch: string): HTMLCanvasElement {
  return cached(`t${ch}`, () => thoughtGrid(art.glyphs[ch] ?? art.glyphs['?'] ?? ['1']));
}

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
import { allWorldArt, extraWorldArt } from './worldArt';
import { composePortrait, emptyPortraitArt, hasPortraitArt, portraitRecipe, type PortraitArt } from './portrait';
import { assembleCloud, paintCloud, type CloudSheet } from './clouds';

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

let portraitArt: PortraitArt = emptyPortraitArt();

export function setPortraitArt(next: PortraitArt): void {
  portraitArt = next;
  for (const k of [...cache.keys()]) if (k.startsWith('portrait:')) cache.delete(k);
}

/** A worker's 64x64 portrait, or null while there's no portrait art. */
export function portraitCanvas(look: number, parentLooks: readonly number[] = []): HTMLCanvasElement | null {
  if (!hasPortraitArt(portraitArt)) return null;
  return cached(`portrait:${look}:${parentLooks.join(',')}`, () => composePortrait(portraitArt, portraitRecipe(portraitArt, look, parentLooks)));
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
  /** The topmost drawn row (head or hat): carried loads and thought clouds sit on it. */
  top: number;
}

const workerTops = new Map<string, number>();

export function workerSprite(look: number, frame: number, facing: 1 | -1, lying: boolean): WorkerSprite {
  const key = `w${look}:${frame}:${facing}:${lying ? 1 : 0}`;
  let canvas = cache.get(key);
  if (!canvas) {
    let g = composeWorker(art, look, lying ? 0 : frame);
    // lying on their back: a quarter turn puts the head on the right, face down; flipping the rows turns them face up
    if (lying) g = trim(rotate(g).reverse());
    if (facing < 0) g = mirror(g);
    canvas = toCanvas(g);
    cache.set(key, canvas);
    workerTops.set(key, Math.max(0, g.findIndex((r) => /[01]/.test(r))));
  }
  const anchorX = lying ? Math.floor(canvas.width / 2) : facing > 0 ? BODY_CENTER_X : CELL - 1 - BODY_CENTER_X;
  return { canvas, anchorX, top: workerTops.get(key) ?? 0 };
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

const WORLD_ART = new Map([...allWorldArt(), ...extraWorldArt()].map((a) => [a.name, a.grid]));

/**
 * The night sky, faded in through an ordered dither: stage k of
 * NIGHT_STAGES shows the picture on the pixels whose 4x4 Bayer threshold is
 * under k/NIGHT_STAGES, and nothing elsewhere (so the dusk pattern shows
 * through). Null until the picture loads; then the built-in stars step aside.
 */
export const NIGHT_STAGES = 4;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
let nightStages: HTMLCanvasElement[] | null = null;
let nightBlack: HTMLCanvasElement[] = [];

function dithered(w: number, h: number, stage: number, src: (x: number, y: number) => boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const out = g.createImageData(w, h);
  const cut = (stage / NIGHT_STAGES) * 16;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (BAYER4[(y & 3) * 4 + (x & 3)] >= cut) continue;
      const i = (y * w + x) * 4;
      const ink = src(x, y);
      out.data[i] = out.data[i + 1] = out.data[i + 2] = ink ? 0 : 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

export function setNightSky(img: HTMLImageElement): void {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const ink = (x: number, y: number) => {
    const i = (y * c.width + x) * 4;
    return px[i + 3] < 128 || px[i] + px[i + 1] + px[i + 2] < 384;
  };
  nightStages = [];
  nightBlack = [];
  for (let k = 1; k <= NIGHT_STAGES; k++) {
    nightStages.push(dithered(c.width, c.height, k, ink));
    nightBlack.push(dithered(4, 4, k, () => true)); // the plain black above the picture
  }
}

/** The night sky at a stage (1..NIGHT_STAGES), and a 4x4 tile of its black, or null if there's no picture. */
export function nightSky(stage: number): { picture: HTMLCanvasElement; black: HTMLCanvasElement } | null {
  if (!nightStages || stage < 1) return null;
  const k = Math.min(NIGHT_STAGES, stage) - 1;
  return { picture: nightStages[k], black: nightBlack[k] };
}

let cloudSheet: CloudSheet | null = null;
const clouds = new Map<string, HTMLCanvasElement | null>();

/** Swap in the cloud parts loaded from public/art/clouds.png. */
export function setCloudSheet(next: CloudSheet): void {
  cloudSheet = next;
  clouds.clear();
}

/**
 * Cloud number i of a game's sky, built from the parts with the game's
 * settings (CLOUD_DEFAULTS), the same every time for the same game. Null
 * until the parts load (the sky then draws its stand-in clouds).
 */
export function cloudSprite(gameSeed: number, i: number): HTMLCanvasElement | null {
  if (!cloudSheet) return null;
  const key = `${gameSeed}:${i}`;
  if (clouds.has(key)) return clouds.get(key)!;
  let made: HTMLCanvasElement | null = null;
  for (let k = 0; k < 5 && !made; k++) {
    const cloud = assembleCloud(cloudSheet, (Math.imul(gameSeed ^ 0x9e3779b9, 0x85ebca6b) + i * 7919 + k * 104729) >>> 0);
    if (!cloud.ok) continue;
    const pic = paintCloud(cloud, 'rand');
    const c = document.createElement('canvas');
    c.width = pic.w;
    c.height = pic.h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(pic.w, pic.h);
    for (let p = 0; p < pic.w * pic.h; p++) {
      if (!pic.px[p]) continue;
      const v = pic.px[p] === 1 ? 0 : 255;
      img.data.set([v, v, v, 255], p * 4);
    }
    g.putImageData(img, 0, 0);
    made = c;
  }
  clouds.set(key, made);
  return made;
}

/** Swap in world art loaded from public/art/world.png. */
export function setWorldArt(next: Record<string, Grid>): void {
  for (const [name, grid] of Object.entries(next)) WORLD_ART.set(name, grid);
  for (const key of [...cache.keys()]) if (key.startsWith('world:')) cache.delete(key);
}

/**
 * A piece of world art (buildings, fixtures, nature) by name, e.g.
 * 'building.wall-left'. These are the built-in grids that also go onto the
 * MacPaint sheets; when the user's art arrives it replaces them here.
 */
export function worldSprite(name: string): HTMLCanvasElement {
  return cached(`world:${name}`, () => WORLD_ART.get(name) ?? ['1']);
}

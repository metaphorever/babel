// Art that arrives as screenshots of MacPaint (art-src/shots/), and where
// each piece is in them. See docs/SPRITES.md ("How art actually arrives").
//
// Two kinds of screenshot:
//  - A screenshot of a whole working sheet (or its top-left part). It's lined
//    up against the sheet by its title, then read box by box like a .bin page.
//  - Loose pieces drawn outside the boxes, or set pieces on their own. Each is
//    a rectangle in a screenshot, with its mask either a second rectangle
//    (offset to the right) or worked out: white touching the edge of the
//    picture is see-through, enclosed white is solid paper.
//
// Every delivery updates this list by hand, then `npm run art:import`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Grid } from '../src/render/spriteData';
import { PAINT_H, PAINT_W } from './macpaint';
import { decodePngBits } from './png';
import { type Page, renderPage } from './sheets';

const SHOTS = join(process.cwd(), 'art-src', 'shots');

/** Screenshots of whole sheets, by page name. */
export const SHEET_SHOTS: Record<string, string> = {
  'Babel World': 'world-clover-horse-ladder.png',
  'Babel Buildings': 'clover-buildings-final.png',
};

/** Sheet slots that a screenshot leaves alone or draws over by accident: keep the built-in art. */
// (tree and crop: the horse is drawn over their boxes; the forest and field set pieces replaced them anyway)
export const KEEP_BUILT_IN = ['sky.cloud', 'sky.sun', 'sky.moon', 'nature.wagon', 'terrain.dirt-top', 'tower.ladder', 'nature.tree', 'nature.crop'];

export interface Loose {
  name: string;
  file: string;
  /** x, y, w, h in the screenshot. Omit for the whole picture. */
  rect?: [number, number, number, number];
  /** How far right the mask is drawn; omit to work the mask out. */
  maskDx?: number;
  /** No see-through parts at all (terrain tiles). */
  opaque?: boolean;
}

export const LOOSE: Loose[] = [
  { name: 'nature.forest', file: 'clover-forest.png' },
  { name: 'nature.field', file: 'clover-field.png' },
  // drawn just right of its box (the box itself is unchanged)
  { name: 'terrain.dirt-top', file: 'world-clover-horse-ladder.png', rect: [32, 49, 8, 8], opaque: true },
  // Stunt Copter's wagon (after Duane Blehm), two frames of a walk cycle
  { name: 'nature.wagon', file: 'world-clover-horse-ladder.png', rect: [146, 147, 70, 22] },
  { name: 'nature.wagon-step', file: 'world-clover-horse-ladder.png', rect: [224, 147, 70, 22] },
  // third delivery (2026-11-25): the ladder is a full block, 16x16, drawn over its old 8x8 box (the box wasn't moved,
  // so nothing below it on the sheet shifts); the wagon has no driver now (the game draws a worker there)
  { name: 'tower.ladder', file: 'world-clover-horse-ladder.png', rect: [233, 49, 16, 16], maskDx: 20 },
  // a free horse, two walking frames, for later (not used in the game yet)
  { name: 'nature.horse', file: 'world-clover-horse-ladder.png', rect: [70, 82, 25, 19] },
  { name: 'nature.horse-step', file: 'world-clover-horse-ladder.png', rect: [103, 82, 25, 19] },
  { name: 'sky.sun', file: 'world-clover-horse-ladder.png', rect: [2, 188, 46, 45], maskDx: 58 },
  { name: 'sky.moon', file: 'world-clover-horse-ladder.png', rect: [116, 187, 40, 44], maskDx: 48 },
];

/**
 * Portraits: one Photoshop file of parts. Each layer named for its part
 * (Body, Head, Beard, Nose, Eyes, Eyebrows, Mouth, Hair, Hat) inside any
 * group is one variant of that part; the groups are only for the user's
 * convenience. Layers outside groups (tracing references, a backdrop) are
 * ignored.
 */
export const PORTRAIT_PSD = 'portraits-working-file-.psd';

/**
 * The portrait backgrounds: a screenshot of MacPaint's pattern palette. A
 * grid of boxes, each with a 1-pixel black border and the 8x8 pattern
 * repeating inside it. `dropped` are the ones the user ruled out
 * (2026-11-25: they fight the outline's dither).
 */
export const PORTRAIT_PATTERNS = { file: 'macpaint-patterns.png', cols: 5, rows: 7, pitchX: 20, pitchY: 17, dropped: [2, 5, 10, 11, 12] };

/** The kept patterns as 8x8 grids, numbered as on the palette (1 at the top left, by rows). */
export function readPatterns(): { n: number; grid: Grid }[] {
  const p = PORTRAIT_PATTERNS;
  const s = shot(p.file);
  const out: { n: number; grid: Grid }[] = [];
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      const n = r * p.cols + c + 1;
      if (p.dropped.includes(n)) continue;
      const x0 = c * p.pitchX + 1;
      const y0 = r * p.pitchY + 1;
      const at = (x: number, y: number) => s.bits[(y0 + y) * s.w + x0 + x];
      const grid: string[] = [];
      for (let y = 0; y < 8; y++) {
        let line = '';
        for (let x = 0; x < 8; x++) line += at(x, y) ? '1' : '0';
        grid.push(line);
      }
      // it should repeat every 8 pixels across its whole box
      let off = 0;
      for (let y = 0; y < p.pitchY - 1; y++) for (let x = 0; x < p.pitchX - 1; x++) if (String(at(x, y)) !== grid[y % 8][x % 8]) off++;
      if (off) console.warn(`  note     pattern ${n} doesn't repeat cleanly (${off} pixels)`);
      out.push({ n, grid });
    }
  }
  return out;
}

const cache = new Map<string, ReturnType<typeof decodePngBits>>();
function shot(file: string) {
  let s = cache.get(file);
  if (!s) {
    s = decodePngBits(new Uint8Array(readFileSync(join(SHOTS, file))));
    if (s.grey > 8) console.warn(`  note     ${file} has ${s.grey} grey pixels (rounded): was it scaled?`);
    cache.set(file, s);
  }
  return s;
}

/**
 * A sheet screenshot laid onto a full MacPaint page, lined up by matching
 * the sheet's title and first labels. Whatever's outside the screenshot is
 * left blank (so those slots read as not drawn).
 */
export function sheetFromShot(page: Page, file: string): Uint8Array {
  const s = shot(file);
  const ref = renderPage(page);
  let best = { dx: 0, dy: 0, score: -Infinity };
  for (let dy = 0; dy < 64 && dy + s.h <= PAINT_H; dy++) {
    for (let dx = 0; dx < 64 && dx + s.w <= PAINT_W; dx++) {
      let score = 0;
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < s.w; x++) {
          const a = s.bits[y * s.w + x];
          const b = ref[(y + dy) * PAINT_W + x + dx];
          if (a && b) score++;
          else if (a !== b) score--;
        }
      }
      if (score > best.score) best = { dx, dy, score };
    }
  }
  const px = new Uint8Array(PAINT_W * PAINT_H);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) px[(y + best.dy) * PAINT_W + x + best.dx] = s.bits[y * s.w + x];
  console.log(`  read     shots/${file} (lined up at ${best.dx},${best.dy})`);
  return px;
}

/** A loose piece as a grid: '1' ink, '0' paper, '.' clear. */
export function readLoose(l: Loose): Grid {
  const s = shot(l.file);
  const [x0, y0, w, h] = l.rect ?? [0, 0, s.w, s.h];
  const ink = (x: number, y: number) => s.bits[(y0 + y) * s.w + x0 + x] === 1;
  let solid: (x: number, y: number) => boolean;
  if (l.opaque) solid = () => true;
  else if (l.maskDx !== undefined) {
    const dx = l.maskDx;
    solid = (x, y) => s.bits[(y0 + y) * s.w + x0 + dx + x] === 1 || ink(x, y);
  } else {
    // flood the see-through white in from the edges
    const clear = new Uint8Array(w * h);
    const stack: number[] = [];
    for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
    for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
    while (stack.length) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      if (x < 0 || y < 0 || x >= w || y >= h || clear[y * w + x] || ink(x, y)) continue;
      clear[y * w + x] = 1;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    solid = (x, y) => !clear[y * w + x];
  }
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) r += !solid(x, y) ? '.' : ink(x, y) ? '1' : '0';
    rows.push(r);
  }
  return rows;
}

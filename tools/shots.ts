// Art that arrives as screenshots of MacPaint (art-src/shots/), and where
// each piece is in them. See docs/SPRITES.md ("How art actually arrives").
//
// Two kinds of screenshot:
//  - A screenshot of a whole working sheet (or its top-left part). It's lined
//    up against the sheet by its title, then read box by box.
//  - Loose pieces drawn outside the boxes, or set pieces on their own. Each is
//    a rectangle in a screenshot, with its mask either a second rectangle
//    (offset to the right) or worked out: white touching the edge of the
//    picture is see-through, enclosed white is solid paper.
//
// Every delivery updates this list by hand, then `npm run art:import`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Grid } from '../src/render/spriteData';
import { decodePngBits, decodePngRgba } from './png';
import { PAINT_H, PAINT_W, type Page, renderPage } from './sheets';

const SHOTS = join(process.cwd(), 'art-src', 'shots');

/** Screenshots of whole sheets, by page name. */
export const SHEET_SHOTS: Record<string, string> = {
  'Babel Workers': 'workers-clover-6.png',
  'Babel World': 'world-clover-horse-ladder.png',
  'Babel Buildings': 'clover-buildings-final.png',
  'Babel To Do': 'todo-clover.png',
};

/**
 * Boxes on the To Do sheet that are new sprites, and the names they go into
 * the atlas under. (Shelves, wheelbarrow and cart already have their real
 * names on the sheet.) Boxes not listed here (the winches, the site marker,
 * the Scriptorium's icons) aren't drawn yet or aren't used from the atlas.
 */
export const TODO_NAMES: Record<string, string> = {
  'todo.stable': 'fixture.stable',
  'todo.flagpole.s': 'fixture.flagpole-s',
  'todo.flagpole.m': 'fixture.flagpole-m',
  'todo.flagpole.l': 'fixture.flagpole-l',
  'todo.flag.s': 'flag.s',
  'todo.flag.m': 'flag.m',
  'todo.flag.l': 'flag.l',
  'todo.bell.s': 'fixture.bell-s',
  'todo.bell.s.ring': 'fixture.bell-s-ring',
  'todo.bell.m': 'fixture.bell-m',
  'todo.bell.m.ring': 'fixture.bell-m-ring',
  'todo.bell.l': 'fixture.bell-l',
  'todo.bell.l.ring': 'fixture.bell-l-ring',
};

/**
 * Boxes whose pink pixels (255,174,201) mark where the game fills in a
 * pattern: a flag's cloth, hatched in its colour. Each gets a second sprite,
 * `<name>-fill`, with '1' wherever the box is pink.
 */
export const PINK_FILLS = ['todo.flag.s', 'todo.flag.m', 'todo.flag.l'];

/**
 * The heraldic tinctures (DESIGN.md 16.7), drawn on the To Do sheet as
 * 16x12 swatches in a column, top to bottom. Each is cut down to the
 * smallest tile that repeats, so the game can tile it over any cloth.
 */
export const TINCTURES = {
  file: 'todo-clover.png',
  x: 207,
  y: 317,
  w: 16,
  h: 12,
  pitch: 16,
  order: ['yellow', 'white', 'blue', 'red', 'purple', 'black', 'green'],
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
  /** How far down the mask is (with maskDx): another frame's mask, for a frame drawn without one. */
  maskDy?: number;
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
  // the To Do sheet (2026-11-28). The cart rolls: a second frame drawn under its box, with no mask
  // box of its own (the outline is the same, so it borrows the first frame's)
  { name: 'fixture.cart-roll', file: 'todo-clover.png', rect: [122, 271, 32, 16], maskDx: 36, maskDy: -20 },
  // the rope pulley in three parts, in boxes the user drew over the old one: the head (the only fixed
  // part), a stretch of rope (two strands, dotted) and the bucket on its strand
  { name: 'pulley.head', file: 'todo-clover.png', rect: [239, 258, 16, 10], maskDx: 20 },
  { name: 'pulley.rope', file: 'todo-clover.png', rect: [239, 272, 16, 16], maskDx: 20 },
  { name: 'pulley.bucket', file: 'todo-clover.png', rect: [239, 292, 16, 10], maskDx: 20 },
  // a platform one block out from the tower, level with a floor; a pulley goes on it
  // the stairs were drawn a row below their box (and the mask a pixel right of its own)
  { name: 'fixture.stairs', file: 'todo-clover.png', rect: [113, 103, 32, 32], maskDx: 37 },
  { name: 'tower.ledge', file: 'todo-clover.png', rect: [293, 269, 16, 8], maskDx: 21 },
  // buildings a story as tall as a tower level (32, was 24), edited in a copy of the atlas (1 pixel between
  // pieces), the same pieces with 8 more rows of wall
  { name: 'building.wall-left', file: 'todo-clover.png', rect: [291, 604, 8, 32], opaque: true },
  { name: 'building.wall', file: 'todo-clover.png', rect: [300, 604, 8, 32], opaque: true },
  { name: 'building.wall-right', file: 'todo-clover.png', rect: [309, 604, 8, 32], opaque: true },
  { name: 'building.door', file: 'todo-clover.png', rect: [318, 604, 8, 32], opaque: true },
  { name: 'building.window', file: 'todo-clover.png', rect: [327, 604, 8, 32], opaque: true },
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
/** Where each sheet screenshot lined up on its page, by file. */
export const SHOT_OFFSET = new Map<string, { dx: number; dy: number }>();

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
  SHOT_OFFSET.set(file, { dx: best.dx, dy: best.dy });
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
    const dy = l.maskDy ?? 0;
    solid = (x, y) => s.bits[(y0 + dy + y) * s.w + x0 + dx + x] === 1 || ink(x, y);
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

/** '1' wherever a box in a screenshot is pink (the pattern's area), or null if none is. */
export function readPink(file: string, x0: number, y0: number, w: number, h: number): Grid | null {
  const png = decodePngRgba(new Uint8Array(readFileSync(join(SHOTS, file))));
  const pink = (x: number, y: number) => {
    const i = ((y0 + y) * png.w + x0 + x) * 4;
    return png.rgba[i] === 255 && png.rgba[i + 1] === 174 && png.rgba[i + 2] === 201;
  };
  let any = false;
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) {
      const p = pink(x, y);
      any ||= p;
      r += p ? '1' : '.';
    }
    rows.push(r);
  }
  return any ? rows : null;
}

/** The tinctures, each cut to the smallest tile that repeats across its swatch. */
export function readTinctures(): Record<string, Grid> {
  const t = TINCTURES;
  const s = shot(t.file);
  const out: Record<string, Grid> = {};
  t.order.forEach((name, i) => {
    const at = (x: number, y: number) => s.bits[(t.y + i * t.pitch + y) * s.w + t.x + x];
    const repeats = (pw: number, ph: number) => {
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (at(x, y) !== at(x % pw, y % ph)) return false;
      return true;
    };
    let best: [number, number] | null = null;
    for (let ph = 1; ph <= t.h && !best; ph++) {
      for (let pw = 1; pw <= t.w; pw++) {
        if (repeats(pw, ph)) {
          best = [pw, ph];
          break;
        }
      }
    }
    const [pw, ph] = best ?? [t.w, t.h];
    if (!best) console.warn(`  note     tincture ${name} doesn't repeat inside its swatch; kept whole`);
    out[name] = Array.from({ length: ph }, (_, y) => Array.from({ length: pw }, (_, x) => (at(x, y) ? '1' : '0')).join(''));
  });
  return out;
}

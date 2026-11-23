// Reference pictures for drawing, written to art-src/:
//
//   forest-current.png       the forest exactly as the game draws it now (1x),
//                            to draw over as one big set piece
//   portrait-template.png    the worker portrait template: a 64x64 frame with
//                            guide lines, a few example parts for each layer,
//                            and some put together
//
// Each also comes at 4x (…@4x.png) for looking at on a modern screen.
//
//   npm run art:reference

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Bitmap, CLEAR, INK, PAPER, type Fill } from '../src/render/bitmap';
import type { Grid } from '../src/render/spriteData';
import { drawText, textWidth } from './font';
import { encodePng } from './png';

const OUT = join(process.cwd(), 'art-src');
mkdirSync(OUT, { recursive: true });

/** Clear shows as white: these are references, not sprites. */
function save(name: string, b: Bitmap): void {
  for (const scale of [1, 4]) {
    const w = b.w * scale;
    const h = b.h * scale;
    const px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = b.get(Math.floor(x / scale), Math.floor(y / scale)) === INK ? 0 : 255;
        px.set([v, v, v, 255], (y * w + x) * 4);
      }
    }
    const file = scale === 1 ? `${name}.png` : `${name}@${scale}x.png`;
    writeFileSync(join(OUT, file), encodePng(w, h, px));
    console.log(`  wrote    art-src/${file} (${w}x${h})`);
  }
}

function label(b: Bitmap, text: string, x: number, y: number): void {
  drawText(text.toUpperCase(), x, y, (px, py) => b.set(px, py, INK));
}

function dottedBox(b: Bitmap, x: number, y: number, w: number, h: number): void {
  for (let i = 0; i < w; i += 2) {
    b.set(x + i, y, INK);
    b.set(x + i, y + h - 1, INK);
  }
  for (let i = 0; i < h; i += 2) {
    b.set(x, y + i, INK);
    b.set(x + w - 1, y + i, INK);
  }
}

function stampGrid(b: Bitmap, x: number, y: number, g: Grid): void {
  b.stamp(x, y, g);
}

// ---------------------------------------------------------------- the forest

/** The same trees the renderer draws (Renderer.tree), at the same spacing. */
function forest(): Bitmap {
  const width = 12 * 8;
  const height = 34;
  const b = new Bitmap(width, height);
  b.rect(0, 0, width, height, PAPER);
  const base = height;
  // the map puts the forest at a tile boundary; x is measured from its left edge
  for (let x = 2; x < width - 8; x += 13) {
    const h = 22 + ((x * 7) % 9);
    b.rect(x + 4, base - h + 8, 2, h - 8, INK);
    const widths = [3, 5, 7, 9, 9, 9, 7, 5, 3];
    const top = base - h;
    widths.forEach((w, i) => {
      const lx = x + 5 - Math.ceil(w / 2);
      const edge = i === 0 || i === widths.length - 1;
      b.rect(lx, top + i * 2, w, 2, INK);
      if (!edge) b.rect(lx + 1, top + i * 2, w - 2, 2, 'checker');
    });
  }
  return b;
}

// -------------------------------------------------------------- portraits

/**
 * Portraits are 64x64, head and shoulders, built from layers drawn back to
 * front: body, hair (behind the head), head (with neck, ears and face),
 * beard, hat. Key lines (rows, counting from 0 at the top):
 */
const P = 64;
const CX = 31.5; // the middle falls between columns 31 and 32
const LINES: [number, string][] = [
  [2, 'tallest hat'],
  [14, 'top of head'],
  [28, 'eyes'],
  [37, 'mouth'],
  [42, 'chin'],
  [50, 'shoulders'],
];

type Inside = (x: number, y: number) => boolean;

/** Fill a shape with a pattern and outline it in ink. */
function shape(b: Bitmap, inside: Inside, fill: Fill, outline = true): void {
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (outline && edge) b.set(x, y, INK);
      else if (typeof fill === 'number') b.set(x, y, fill);
      else b.rect(x, y, 1, 1, fill);
    }
  }
}

const ellipse = (cx: number, cy: number, rx: number, ry: number): Inside => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function part(draw: (b: Bitmap) => void): Grid {
  const b = new Bitmap(P, P); // starts clear: see-through
  draw(b);
  return b.toGrid();
}

const BODIES: [string, Grid][] = [
  [
    'robe',
    part((b) => {
      shape(b, (x, y) => y >= 47 && y < P && Math.abs(x - CX) <= Math.min(30, 11 + (y - 47) * 1.8), 'light');
      // a V at the neck
      for (let i = 0; i < 7; i++) {
        b.set(27 + Math.floor(i * 0.6), 47 + i, INK);
        b.set(36 - Math.floor(i * 0.6), 47 + i, INK);
      }
    }),
  ],
  [
    'tunic',
    part((b) => {
      shape(b, (x, y) => y >= 48 && y < P && Math.abs(x - CX) <= Math.min(29, 13 + (y - 48) * 1.4), 'sparse');
      shape(b, (x, y) => y >= 47 && y <= 51 && Math.abs(x - CX) <= 7, PAPER);
    }),
  ],
  [
    'cloak',
    part((b) => {
      shape(b, (x, y) => y >= 46 && y < P && Math.abs(x - CX) <= Math.min(31, 10 + (y - 46) * 2.2), 'diag');
      shape(b, ellipse(CX, 52, 2.5, 2.5), PAPER);
    }),
  ],
];

const HAIRS: [string, Grid][] = [
  ['none', part(() => undefined)],
  ['short', part((b) => shape(b, (x, y) => ellipse(CX, 26, 13.5, 16.5)(x, y) && y <= 25, 'dark'))],
  ['long', part((b) => shape(b, (x, y) => (ellipse(CX, 27, 15, 16)(x, y) && y <= 30) || (y > 30 && y <= 50 && Math.abs(x - CX) <= 15 - (y - 30) * 0.15), 'dark'))],
  [
    'curly',
    part((b) =>
      shape(
        b,
        (x, y) => {
          if (ellipse(CX, 27, 14, 15)(x, y) && y <= 24) return true;
          for (let k = 0; k < 7; k++) if (ellipse(CX - 13 + k * 4.4, 15 + Math.abs(k - 3) * 2, 3.2, 3.2)(x, y)) return true;
          return false;
        },
        'checker',
      ),
    ),
  ],
];

function face(b: Bitmap, cx: number, eyeY: number, mouthY: number, mouthW: number): void {
  b.rect(Math.round(cx - 6), eyeY, 2, 2, INK);
  b.rect(Math.round(cx + 4), eyeY, 2, 2, INK);
  // nose
  for (let i = 0; i < 4; i++) b.set(Math.round(cx), eyeY + 2 + i, INK);
  b.set(Math.round(cx) - 1, eyeY + 5, INK);
  b.rect(Math.round(cx - mouthW / 2) + 1, mouthY, mouthW, 1, INK);
}

function head(rx: number, ry: number, cy: number, mouthW = 6): Grid {
  return part((b) => {
    // neck first, so the jaw line draws over it
    shape(b, (x, y) => y >= 38 && y <= 50 && Math.abs(x - CX) <= 4.5, PAPER);
    shape(b, ellipse(CX - rx - 0.5, 29, 2.5, 4), PAPER);
    shape(b, ellipse(CX + rx + 0.5, 29, 2.5, 4), PAPER);
    shape(b, ellipse(CX, cy, rx, ry), PAPER);
    face(b, CX, 28, 37, mouthW);
  });
}

const HEADS: [string, Grid][] = [
  ['round', head(12, 14, 28)],
  ['long', head(10, 15, 28, 5)],
  ['broad', head(13.5, 13, 29, 8)],
];

const BEARDS: [string, Grid][] = [
  ['none', part(() => undefined)],
  [
    'short',
    part((b) => {
      shape(b, (x, y) => ellipse(CX, 28, 12.6, 14.6)(x, y) && y >= 34 && !(y >= 36 && y <= 38 && Math.abs(x - CX) <= 4), 'dark');
    }),
  ],
  [
    'long',
    part((b) => {
      shape(b, (x, y) => y >= 34 && y <= 56 && Math.abs(x - CX) <= 12.5 - Math.max(0, y - 40) * 0.6 && !(y >= 36 && y <= 38 && Math.abs(x - CX) <= 4), 'checker');
    }),
  ],
  ['moustache', part((b) => shape(b, (x, y) => y >= 34 && y <= 36 && Math.abs(x - CX) <= 6 - (y === 36 ? 0 : 1), INK, false))],
];

const HATS: [string, Grid][] = [
  ['none', part(() => undefined)],
  [
    'turban',
    part((b) => {
      shape(b, ellipse(CX, 14, 14.5, 9), 'hstripe');
      shape(b, ellipse(CX + 6, 10, 3, 3), PAPER);
    }),
  ],
  [
    'hood',
    part((b) => {
      // the face hole stays see-through: a hat like this needs a mask in MacPaint
      shape(b, (x, y) => ellipse(CX, 28, 17, 19)(x, y) && y <= 46 && !ellipse(CX, 30, 11, 13)(x, y), 'light');
    }),
  ],
  ['cap', part((b) => shape(b, (x, y) => ellipse(CX, 19, 12.8, 8)(x, y) && y <= 19, INK, false))],
];

function compose(...layers: Grid[]): Grid {
  const b = new Bitmap(P, P);
  for (const g of layers) b.stamp(0, 0, g);
  return b.toGrid();
}

function portraits(): Bitmap {
  const cell = P + 16;
  const left = 8;
  const width = left + 4 * cell + 8;
  const rows: [string, [string, Grid][]][] = [
    ['1. body', BODIES],
    ['2. hair (behind the head)', HAIRS],
    ['3. head (neck, ears, face)', HEADS],
    ['4. beard', BEARDS],
    ['5. hat', HATS],
  ];
  const topH = P + 28;
  const rowH = P + 18;
  const height = topH + rows.length * rowH + rowH + 24;
  const b = new Bitmap(width, height);
  b.rect(0, 0, width, height, PAPER);

  // the template itself, with its guide lines
  label(b, 'worker portrait: 64 x 64, head and shoulders', left, 4);
  const tx = left;
  const ty = 16;
  dottedBox(b, tx - 1, ty - 1, P + 2, P + 2);
  let lastLabel = -99;
  for (const [row, text] of LINES) {
    for (let x = 0; x < P; x += 4) b.set(tx + x, ty + row, INK);
    b.rect(tx + P + 2, ty + row, 4, 1, INK);
    // labels close together are nudged apart, with a leader line back to their row
    const ly = Math.max(ty + row - 2, lastLabel + 7);
    lastLabel = ly;
    if (ly !== ty + row - 2) for (let y = ty + row; y <= ly + 2; y++) b.set(tx + P + 6, y, INK);
    label(b, `${row} ${text}`, tx + P + 8, ly);
  }
  // the middle: between columns 31 and 32
  for (let y = 0; y < P; y += 4) {
    b.set(tx + 31, ty + y, INK);
    b.set(tx + 32, ty + y, INK);
  }
  label(b, 'middle: columns 31 and 32', tx + P + 8, ty + P - 6);
  const note = ['layers, back to front:', 'body, hair, head, beard, hat.', 'white touching the edge is', 'see-through. a hood (a hole', 'in the middle) needs a mask.'];
  note.forEach((line, i) => label(b, line, tx + P + 8 + 120, ty + 4 + i * 8));

  // the parts
  rows.forEach(([title, parts], ri) => {
    const y = topH + ri * rowH;
    label(b, title, left, y);
    parts.forEach(([name, g], i) => {
      const x = left + i * cell;
      dottedBox(b, x - 1, y + 7, P + 2, P + 2);
      stampGrid(b, x, y + 8, g);
      label(b, name, x + Math.floor((P - textWidth(name.toUpperCase())) / 2), y + P + 10);
    });
  });

  // put together
  const y = topH + rows.length * rowH;
  label(b, 'put together', left, y);
  const combos: Grid[] = [
    compose(BODIES[0][1], HAIRS[1][1], HEADS[0][1], BEARDS[1][1], HATS[0][1]),
    compose(BODIES[1][1], HAIRS[2][1], HEADS[1][1], BEARDS[2][1], HATS[1][1]),
    compose(BODIES[2][1], HAIRS[0][1], HEADS[2][1], BEARDS[3][1], HATS[2][1]),
    compose(BODIES[0][1], HAIRS[3][1], HEADS[1][1], BEARDS[0][1], HATS[3][1]),
  ];
  combos.forEach((g, i) => {
    const x = left + i * cell;
    dottedBox(b, x - 1, y + 7, P + 2, P + 2);
    stampGrid(b, x, y + 8, g);
  });
  return b;
}

console.log('Reference art:');
save('forest-current', forest());
save('portrait-template', portraits());
void CLEAR;

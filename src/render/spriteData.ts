// The art, as plain data. No browser APIs here, so the exporter tool can
// read it too.
//
// A Grid is rows of characters: '1' ink (black), '0' paper (white),
// '.' clear, 'r' an anchor marker (red in the PNG sheets; drawn as clear).
//
// Workers are built from layered parts, each drawn in the same 16x16 frame
// (feet on the bottom row, body centered on column 7):
//   body   robe, arms and feet, in walk frames (columns of the sheet)
//   head   face
//   beard  drawn over the head
//   hat    drawn over the head (can use paper to cover head pixels)
// Head-layer parts are drawn for a neck at HEAD_ANCHOR. Each body cell
// marks its neck with one red pixel; the head layers move to sit there, so
// tall, short or stooped bodies all work.
//
// The art here is the built-in placeholder set. PNG sheets in public/art/
// replace it when present (see docs/SPRITES.md).

export type Grid = string[];

export const CELL = 16;
/** Where the neck is in the head-layer frame. */
export const HEAD_ANCHOR = { x: 7, y: 7 };
/** The column the body is centered on (drawn at the worker's position). */
export const BODY_CENTER_X = 7;
export const WALK_FRAMES = 2;

export interface ArtSet {
  /** [variant][frame] */
  body: Grid[][];
  head: Grid[];
  beard: Grid[];
  hat: Grid[];
  items: Record<string, Grid>;
  props: Record<string, Grid>;
  glyphs: Record<string, Grid>;
}

/** Item, prop and glyph names, in sheet order. */
export const ITEM_NAMES = ['stone', 'wood', 'grain', 'bread'] as const;
export const PROP_NAMES = ['scroll', 'bag', 'sheet'] as const;
export const GLYPH_NAMES = ['z', '!', '?', '$', 'b'] as const;
/** Small sprites sit in 8x8 cells, top-left; empty space is trimmed on load. */
export const SMALL_CELL = 8;

// ------------------------------------------------------------- helpers

export function blank(w = CELL, h = CELL): Grid {
  return Array.from({ length: h }, () => '.'.repeat(w));
}

/** Draw `rows` onto `grid` at (x, y); '.' in rows leaves the grid alone. */
export function stamp(grid: Grid, x: number, y: number, rows: Grid): Grid {
  const out = grid.slice();
  rows.forEach((row, dy) => {
    const gy = y + dy;
    if (gy < 0 || gy >= out.length) return;
    const chars = out[gy].split('');
    for (let dx = 0; dx < row.length; dx++) {
      const gx = x + dx;
      if (row[dx] === '.' || gx < 0 || gx >= chars.length) continue;
      chars[gx] = row[dx];
    }
    out[gy] = chars.join('');
  });
  return out;
}

export function findMarker(grid: Grid): { x: number; y: number } | null {
  for (let y = 0; y < grid.length; y++) {
    const x = grid[y].indexOf('r');
    if (x >= 0) return { x, y };
  }
  return null;
}

/**
 * Without a marker (MacPaint sheets have no red), the neck is the pixel
 * just above the body's topmost drawn pixel in its center column.
 */
export function autoNeck(grid: Grid): { x: number; y: number } | null {
  for (let y = 0; y < grid.length; y++) {
    const c = grid[y][BODY_CENTER_X];
    if (c === '1' || c === '0') return { x: BODY_CENTER_X, y: y - 1 };
  }
  return null;
}

/** Markers become clear when drawn. */
export function clean(grid: Grid): Grid {
  return grid.map((r) => r.replace(/r/g, '.'));
}

export function mirror(grid: Grid): Grid {
  return grid.map((r) => r.split('').reverse().join(''));
}

/** A quarter turn clockwise (lying down). */
export function rotate(grid: Grid): Grid {
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

/** Cut away clear rows and columns around the drawing. */
export function trim(grid: Grid): Grid {
  let top = 0;
  let bottom = grid.length - 1;
  const empty = (r: string) => /^[.r]*$/.test(r);
  while (top <= bottom && empty(grid[top])) top++;
  while (bottom >= top && empty(grid[bottom])) bottom--;
  if (top > bottom) return ['.'];
  const rows = grid.slice(top, bottom + 1);
  const w = Math.max(...rows.map((r) => r.length));
  let left = w;
  let right = 0;
  for (const r of rows) {
    for (let x = 0; x < r.length; x++) {
      if (r[x] !== '.' && r[x] !== 'r') {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  return rows.map((r) => r.padEnd(w, '.').slice(left, right + 1));
}

// ------------------------------------------------------------ the parts

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

/** Placeholder bodies: four robe patterns, normal and tall. */
function defaultBodies(): Grid[][] {
  const out: Grid[][] = [];
  for (const tall of [false, true]) {
    for (let robe = 0; robe < 4; robe++) {
      const frames: Grid[] = [];
      for (let f = 0; f < WALK_FRAMES; f++) {
        const rows: string[] = [];
        const robeRows = tall ? 5 : 4;
        rows.push('.1111111.'); // shoulders
        for (let i = 0; i < robeRows; i++) {
          let r = '.1';
          for (let c = 2; c <= 6; c++) r += robeFill(robe, c, i);
          rows.push(r + '1.');
        }
        let flare = '1';
        for (let c = 1; c <= 7; c++) flare += robeFill(robe, c, robeRows);
        rows.push(flare + '1');
        rows.push('111111111'); // hem
        rows.push(f === 0 ? '..1...1..' : '...1.1...'); // feet
        const top = CELL - rows.length;
        let g = stamp(blank(), BODY_CENTER_X - 4, top, rows);
        // the neck: one row above the shoulders, centered
        g = stamp(g, BODY_CENTER_X, top - 1, ['r']);
        frames.push(g);
      }
      out.push(frames);
    }
  }
  return out;
}

// head-layer parts are drawn with the neck at HEAD_ANCHOR (7, 7): the
// head's bottom edge sits on row 7, so the face spans rows 3 to 7
const HX = HEAD_ANCHOR.x - 4; // left edge of a 9-wide drawing centered on the anchor
const HY = HEAD_ANCHOR.y - 4; // top of the face

function defaultHeads(): Grid[] {
  // the eye is on the right: everyone is drawn facing right
  return [stamp(blank(), HX, HY, ['..11111..', '..10001..', '..10010..', '..10001..', '..11111..'])];
}

function defaultBeards(): Grid[] {
  return [stamp(blank(), HX, HY, ['', '', '', '....11...'])];
}

function defaultHats(): Grid[] {
  return [
    // cap
    stamp(blank(), HX, HY - 1, ['...111...']),
    // turban
    stamp(blank(), HX, HY - 1, ['..1.1.1..', '.1111111.']),
    // hood
    stamp(blank(), HX, HY - 1, ['..11111..', '', '.1.....1.', '.1.....1.', '.1.....1.']),
  ];
}

export function defaultArt(): ArtSet {
  return {
    body: defaultBodies(),
    head: defaultHeads(),
    beard: defaultBeards(),
    hat: defaultHats(),
    items: {
      stone: ['.11.', '1101', '1111'],
      wood: ['11111', '10101', '11111'],
      grain: ['101', '010', '111'],
      bread: ['.111.', '10001', '11111'],
    },
    props: {
      // a rolled scroll, held at the side
      scroll: ['.11.', '1001', '1001', '1001', '.11.'],
      // a courier's satchel
      bag: ['.11.', '1..1', '1111', '1001', '1111'],
      // a single sheet on the scriptorium desk
      sheet: ['111', '101', '111'],
    },
    glyphs: {
      z: ['1111', '..1.', '.1..', '1111'],
      '!': ['1', '1', '1', '.', '1'],
      '?': ['111', '..1', '.1.', '...', '.1.'],
      $: ['.1.', '111', '1..', '111', '..1', '111', '.1.'],
      // a bundle on a stick: thinking of going home
      b: ['..111', '.1001', '.1111', '.1...', '1....'],
    },
  };
}

// --------------------------------------------------------- composition

/** Which part of each layer a worker wears, from their look seed. */
export function partsFor(art: ArtSet, look: number) {
  const body = look % art.body.length;
  const head = (look >>> 5) % art.head.length;
  // a beard about half the time, a hat about three times in four (when there are any)
  const beard = art.beard.length && ((look >>> 9) & 1) ? ((look >>> 10) % art.beard.length) + 1 : 0;
  const hat = art.hat.length && ((look >>> 14) & 3) !== 0 ? ((look >>> 16) % art.hat.length) + 1 : 0;
  return { body, head, beard, hat };
}

/** One worker, standing, facing right, as a 16x16 grid. */
export function composeWorker(art: ArtSet, look: number, frame: number): Grid {
  const p = partsFor(art, look);
  const frames = art.body[p.body];
  const bodyCell = frames[frame % frames.length];
  const neck = findMarker(bodyCell) ?? autoNeck(bodyCell) ?? HEAD_ANCHOR;
  const dx = neck.x - HEAD_ANCHOR.x;
  const dy = neck.y - HEAD_ANCHOR.y;
  let g = clean(bodyCell);
  g = stamp(g, dx, dy, clean(art.head[p.head]));
  if (p.beard) g = stamp(g, dx, dy, clean(art.beard[p.beard - 1]));
  if (p.hat) g = stamp(g, dx, dy, clean(art.hat[p.hat - 1]));
  return g;
}

/**
 * A reaction glyph inside a little thought cloud: white inside, black rim,
 * with a trail of two small bubbles down-left toward the worker's head.
 */
export function thoughtGrid(glyph: Grid): Grid {
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
  rows.push('.111' + '.'.repeat(W - 4));
  rows.push('.101' + '.'.repeat(W - 4));
  rows.push('.111' + '.'.repeat(W - 4));
  rows.push('1' + '.'.repeat(W - 1));
  return rows;
}

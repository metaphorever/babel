// The MacPaint working sheets: which sprite goes where on which page, how a
// page is drawn, and how an edited page is read back.
//
// Every sprite sits in a box with its MASK in a second box to its right.
// Black in the mask means "this pixel is part of the sprite"; white means
// clear. Where the mask is black, the sprite box says ink (black) or paper
// (white). That's how classic Mac games stored sprites in 1 bit.
//
// Dotted frames around the boxes and the labels are guides: they sit
// outside the boxes and are ignored when reading back. A sprite whose
// mask is left completely white counts as "not drawn" (spare slots).

import {
  CELL,
  GLYPH_NAMES,
  ITEM_NAMES,
  PROP_NAMES,
  SMALL_CELL,
  WALK_FRAMES,
  clean,
  defaultArt,
  type ArtSet,
  type Grid,
} from '../src/render/spriteData';
import { allWorldArt, buildingArt, fixtureArt, natureArt, skyArt, terrainArt, type WorldSprite } from '../src/render/worldArt';
import { drawText, textWidth } from './font';
import { PAINT_H, PAINT_W } from './macpaint';

export interface Slot {
  key: string;
  label: string;
  w: number;
  h: number;
  grid: Grid | null;
}

export interface Group {
  title: string;
  /** Slots per row. */
  perRow: number;
  slots: Slot[];
}

export interface Page {
  /** File name, without extension. Also the Mac file name. */
  name: string;
  title: string;
  groups: Group[];
}

/** Extra empty slots for new variants. */
const SPARE = { body: 4, head: 3, beard: 3, hat: 3 };

function pad(g: Grid, w: number, h: number): Grid {
  const rows = g.slice(0, h).map((r) => r.padEnd(w, '.').slice(0, w));
  while (rows.length < h) rows.push('.'.repeat(w));
  return rows;
}

const world = (list: WorldSprite[]): Slot[] =>
  list.map((s) => ({ key: s.name, label: s.label, w: s.grid[0].length, h: s.grid.length, grid: s.grid }));

/** The pages and what's on them, filled with the given art. */
export function buildPages(art: ArtSet = defaultArt(), worldArt?: { terrain: WorldSprite[]; nature: WorldSprite[]; buildings: WorldSprite[]; fixtures: WorldSprite[]; sky: WorldSprite[] }): Page[] {
  const wa = worldArt ?? { terrain: terrainArt(), nature: natureArt(), buildings: buildingArt(), fixtures: fixtureArt(), sky: skyArt() };
  const bodies: Slot[] = [];
  const nBody = art.body.length + SPARE.body;
  for (let v = 0; v < nBody; v++) {
    for (let f = 0; f < WALK_FRAMES; f++) {
      const g = art.body[v]?.[f];
      bodies.push({ key: `body.${v}.${f}`, label: f === 0 ? `BODY ${v + 1}` : `STEP`, w: CELL, h: CELL, grid: g ? clean(g) : null });
    }
  }
  const parts = (kind: 'head' | 'beard' | 'hat', label: string): Slot[] => {
    const list = art[kind];
    return Array.from({ length: list.length + SPARE[kind] }, (_, i) => ({
      key: `${kind}.${i}`,
      label: `${label} ${i + 1}`,
      w: CELL,
      h: CELL,
      grid: list[i] ? clean(list[i]) : null,
    }));
  };
  const small = (kind: 'items' | 'props' | 'glyphs', names: readonly string[], labels?: Record<string, string>): Slot[] =>
    names.map((n) => ({ key: `${kind}.${n}`, label: labels?.[n] ?? n.toUpperCase(), w: SMALL_CELL, h: SMALL_CELL, grid: art[kind][n] ? pad(art[kind][n], SMALL_CELL, SMALL_CELL) : null }));

  return [
    {
      name: 'Babel Workers',
      title: 'BABEL WORKERS',
      groups: [
        { title: 'BODIES: STANDING, STEP. FEET ON THE BOTTOM ROW, CENTERED ON COLUMN 7. FACING RIGHT.', perRow: 6, slots: bodies },
        { title: 'HEADS (NECK AT 7,7)', perRow: 6, slots: parts('head', 'HEAD') },
        { title: 'BEARDS (OVER THE HEAD)', perRow: 6, slots: parts('beard', 'BEARD') },
        { title: 'HATS (OVER HEAD AND BEARD)', perRow: 6, slots: parts('hat', 'HAT') },
        { title: 'ITEMS', perRow: 8, slots: small('items', ITEM_NAMES) },
        { title: 'PROPS', perRow: 8, slots: small('props', PROP_NAMES) },
        {
          title: 'THOUGHT SYMBOLS (A CLOUD IS ADDED AROUND THEM)',
          perRow: 8,
          slots: small('glyphs', GLYPH_NAMES, { z: 'ASLEEP', '!': 'UNPAID', '?': 'CONFUSED', $: 'PAID', b: 'QUITTING' }),
        },
      ],
    },
    {
      name: 'Babel World',
      title: 'BABEL WORLD',
      groups: [
        { title: 'TERRAIN AND TOWER TILES (8X8)', perRow: 6, slots: world(wa.terrain) },
        { title: 'NATURE AND THE MAP', perRow: 4, slots: world(wa.nature) },
        { title: 'SKY', perRow: 4, slots: world(wa.sky) },
      ],
    },
    {
      name: 'Babel Buildings',
      title: 'BABEL BUILDINGS',
      groups: [
        { title: 'GENERIC BUILDING PARTS: ONE TILE WIDE, ONE STORY TALL, ROOF ON TOP', perRow: 5, slots: world(wa.buildings.slice(0, 8)) },
        { title: 'SPECIAL BUILDINGS', perRow: 2, slots: world(wa.buildings.slice(8)) },
        { title: 'FIXTURES (MOSTLY PLACEHOLDERS FOR P1)', perRow: 4, slots: world(wa.fixtures) },
      ],
    },
  ];
}

// ---------------------------------------------------------------- layout

export interface Placed {
  slot: Slot;
  /** Sprite box and mask box, top-left corners. */
  sx: number;
  sy: number;
  mx: number;
  my: number;
}

export interface Layout {
  placed: Placed[];
  labels: { text: string; x: number; y: number; scale: number }[];
  frames: { x: number; y: number; w: number; h: number }[];
  bottom: number;
}

const MARGIN = 10;
const MASK_GAP = 4; // between a sprite box and its mask box
const COL_GAP = 12;
const LABEL_H = 8;

/** Where everything on a page goes. Throws if it doesn't fit. */
export function layoutPage(page: Page): Layout {
  const out: Layout = { placed: [], labels: [], frames: [], bottom: 0 };
  let y = MARGIN;
  out.labels.push({ text: page.title, x: MARGIN, y, scale: 2 });
  out.labels.push({ text: 'LEFT BOX: SPRITE. RIGHT BOX: MASK (BLACK = SOLID, WHITE = SEE-THROUGH).', x: MARGIN, y: y + 14, scale: 1 });
  y += 28;
  for (const g of page.groups) {
    out.labels.push({ text: g.title, x: MARGIN, y, scale: 1 });
    y += 9;
    const cw = Math.max(...g.slots.map((s) => s.w));
    const ch = Math.max(...g.slots.map((s) => s.h));
    const colW = Math.max(cw * 2 + MASK_GAP, ...g.slots.map((s) => textWidth(s.label))) + COL_GAP;
    const rowH = LABEL_H + ch + 8;
    g.slots.forEach((slot, i) => {
      const col = i % g.perRow;
      const row = Math.floor(i / g.perRow);
      const x = MARGIN + col * colW;
      const top = y + row * rowH;
      out.labels.push({ text: slot.label, x, y: top, scale: 1 });
      const sy = top + LABEL_H;
      const p: Placed = { slot, sx: x, sy, mx: x + slot.w + MASK_GAP, my: sy };
      out.placed.push(p);
      out.frames.push({ x: p.sx, y: p.sy, w: slot.w, h: slot.h }, { x: p.mx, y: p.my, w: slot.w, h: slot.h });
      if (x + colW - COL_GAP > PAINT_W - MARGIN) throw new Error(`"${page.name}" is too wide at ${slot.key}`);
    });
    y += Math.ceil(g.slots.length / g.perRow) * rowH + 6;
  }
  out.bottom = y;
  if (y > PAINT_H - MARGIN) throw new Error(`"${page.name}" is too tall (${y}px; MacPaint pages are ${PAINT_H})`);
  return out;
}

/** Draw a page: one byte per pixel, 1 = black. */
export function renderPage(page: Page): Uint8Array {
  const px = new Uint8Array(PAINT_W * PAINT_H);
  const plot = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < PAINT_W && y < PAINT_H) px[y * PAINT_W + x] = 1;
  };
  const lay = layoutPage(page);
  for (const l of lay.labels) drawText(l.text, l.x, l.y, plot, l.scale);
  // dotted guide frames, one pixel outside each box
  for (const f of lay.frames) {
    for (let x = f.x - 1; x <= f.x + f.w; x += 2) {
      plot(x, f.y - 1);
      plot(x, f.y + f.h);
    }
    for (let y = f.y - 1; y <= f.y + f.h; y += 2) {
      plot(f.x - 1, y);
      plot(f.x + f.w, y);
    }
  }
  for (const p of lay.placed) {
    const g = p.slot.grid;
    if (!g) continue;
    for (let y = 0; y < p.slot.h; y++) {
      for (let x = 0; x < p.slot.w; x++) {
        const c = g[y]?.[x] ?? '.';
        if (c === '1') plot(p.sx + x, p.sy + y);
        if (c === '1' || c === '0') plot(p.mx + x, p.my + y);
      }
    }
  }
  return px;
}

/** Read every slot back from a page's pixels. Empty masks come back as null. */
export function readPage(page: Page, px: Uint8Array): Map<string, Grid | null> {
  const out = new Map<string, Grid | null>();
  const at = (x: number, y: number) => px[y * PAINT_W + x];
  for (const p of layoutPage(page).placed) {
    const rows: string[] = [];
    let any = false;
    for (let y = 0; y < p.slot.h; y++) {
      let row = '';
      for (let x = 0; x < p.slot.w; x++) {
        if (!at(p.mx + x, p.my + y)) row += '.';
        else {
          any = true;
          row += at(p.sx + x, p.sy + y) ? '1' : '0';
        }
      }
      rows.push(row);
    }
    out.set(p.slot.key, any ? rows : null);
  }
  return out;
}

/** Turn slots read from the pages back into the game's art. */
export function slotsToArt(slots: Map<string, Grid | null>): { art: ArtSet; world: Record<string, Grid> } {
  const art = defaultArt();
  // bodies: a variant needs at least its standing frame
  const bodies: Grid[][] = [];
  for (let v = 0; slots.has(`body.${v}.0`); v++) {
    const frames: Grid[] = [];
    for (let f = 0; f < WALK_FRAMES; f++) {
      const g = slots.get(`body.${v}.${f}`);
      if (g) frames.push(g);
    }
    if (frames.length) bodies.push(frames);
  }
  if (bodies.length) art.body = bodies;
  for (const kind of ['head', 'beard', 'hat'] as const) {
    const list: Grid[] = [];
    for (let i = 0; slots.has(`${kind}.${i}`); i++) {
      const g = slots.get(`${kind}.${i}`);
      if (g) list.push(g);
    }
    if (list.length || kind !== 'head') art[kind] = list.length ? list : kind === 'head' ? art.head : [];
  }
  for (const [kind, names] of [
    ['items', ITEM_NAMES],
    ['props', PROP_NAMES],
    ['glyphs', GLYPH_NAMES],
  ] as const) {
    for (const n of names) {
      const g = slots.get(`${kind}.${n}`);
      if (g) art[kind][n] = g;
    }
  }
  const worldOut: Record<string, Grid> = {};
  for (const s of allWorldArt()) {
    const g = slots.get(s.name);
    worldOut[s.name] = g ?? s.grid;
  }
  return { art, world: worldOut };
}

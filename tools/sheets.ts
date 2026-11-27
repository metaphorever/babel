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
import { allWorldArt, buildingArt, extrasArt, fixtureArt, natureArt, skyArt, terrainArt, type WorldSprite } from '../src/render/worldArt';
import { drawText, textWidth } from './font';
import { BOARD_ICON, HAND_ICON, NAMED_ICON } from '../src/ui/scriptorium';

/** A 16x16 icon drawn as SVG rectangles ("M1 2h14v1H1z" ...) as a grid, so it can go on a sheet. */
function svgIcon(svg: string): Grid {
  const rows = Array.from({ length: 16 }, () => '0'.repeat(16).split(''));
  const d = /d="([^"]+)"/.exec(svg)?.[1] ?? '';
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)H\d+z/g)) {
    const [x, y, w, h] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) rows[yy][xx] = '1';
  }
  return rows.map((r) => r.join(''));
}

/** The tower site's marker as drawn in code now: dashes along the ground, a post with a cap at each end. */
function siteMarker(part: 'left' | 'middle' | 'right'): Grid {
  const rows = Array.from({ length: 8 }, () => '.'.repeat(8).split(''));
  for (let x = 0; x < 8; x++) if (x % 3 !== 2) rows[7][x] = '1';
  if (part === 'left') {
    for (let y = 2; y < 8; y++) rows[y][0] = '1';
    for (let x = 0; x < 3; x++) rows[2][x] = '1';
  }
  if (part === 'right') {
    for (let y = 2; y < 8; y++) rows[y][7] = '1';
    for (let x = 5; x < 8; x++) rows[2][x] = '1';
  }
  return rows.map((r) => r.join(''));
}

/** An empty box to draw something new in. */
const todo = (key: string, label: string, w: number, h: number, grid: Grid | null = null): Slot => ({ key: `todo.${key}`, label, w, h, grid });
/** A sheet is one MacPaint page: 576 x 720 pixels. */
export const PAINT_W = 576;
export const PAINT_H = 720;

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
export function buildPages(art: ArtSet = defaultArt(), worldArt?: { terrain: WorldSprite[]; nature: WorldSprite[]; buildings: WorldSprite[]; fixtures: WorldSprite[]; sky: WorldSprite[]; extras?: WorldSprite[] }): Page[] {
  const wa = worldArt ?? { terrain: terrainArt(), nature: natureArt(), buildings: buildingArt(), fixtures: fixtureArt(), sky: skyArt(), extras: extrasArt() };
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
    {
      // what's still Claude's placeholder (filled in) or not drawn at all yet (empty), outside the Workers page
      name: 'Babel To Do',
      title: 'BABEL TO DO',
      groups: [
        {
          title: 'CLOUD PARTS: OVERLAPPING BLOBS, FLAT BOTTOMS, FLUFFY TOPS (SEE CLOUD-REFERENCE.PNG)',
          perRow: 6,
          slots: Array.from({ length: 6 }, (_, i) => todo(`cloud.${i}`, `CLOUD PART ${i + 1}`, 32, 16)),
        },
        {
          title: 'FIXTURES: WHOLE BLOCKS (A BLOCK IS 16 PX). SHELVES: THE GAME PUTS STONE, WOOD AND GRAIN ON THEM.',
          perRow: 3,
          // the real name, so a drawing here replaces the stand-in in the game
          slots: [{ key: 'fixture.shelves', label: 'SHELVES (2 BLOCKS TALL)', w: 16, h: 32, grid: null }, todo('stairs', 'STAIRS (ONE LEVEL)', 32, 32)],
        },
        {
          title: 'TOWER SITE MARKER, BEFORE ANYTHING IS BUILT (NOW DRAWN IN CODE). THE MIDDLE REPEATS.',
          perRow: 3,
          slots: [todo('site.left', 'LEFT END', 8, 8, siteMarker('left')), todo('site.middle', 'MIDDLE', 8, 8, siteMarker('middle')), todo('site.right', 'RIGHT END', 8, 8, siteMarker('right'))],
        },
        {
          title: 'SCRIPTORIUM BUTTON ICONS (16X16, PLACEHOLDERS NOW)',
          perRow: 3,
          slots: [todo('icon.anyone', 'BOARD: ANYONE', 16, 16, svgIcon(BOARD_ICON)), todo('icon.named', 'BOARD: BY NAME', 16, 16, svgIcon(NAMED_ICON)), todo('icon.hand', 'HAND TO', 16, 16, svgIcon(HAND_ICON))],
        },
        {
          title: 'HAULING EQUIPMENT. WHEELBARROW AND CART ARE IN THE GAME AS STAND-INS, THE REST IS TO COME. THE GAME DRAWS THE LOAD.',
          perRow: 4,
          slots: [
            // the real names, so a drawing here replaces the stand-in in the game
            { key: 'fixture.wheelbarrow', label: 'WHEELBARROW', w: 16, h: 16, grid: null },
            { key: 'fixture.cart', label: 'CART', w: 32, h: 16, grid: null },
            todo('pulley', 'ROPE PULLEY', 16, 32),
            todo('winch', 'WINCH (BY HAND)', 32, 32),
            todo('winch-beast', 'WINCH (BY A BEAST)', 48, 32),
            todo('stable', 'STABLE STALL', 32, 32),
          ],
        },
        {
          // DESIGN.md 16.7: flags and bells come in three sizes; a flag's colour is heraldic hatching
          title: 'FLAGPOLES (NEXT). SMALL, MEDIUM, LARGE.',
          perRow: 3,
          slots: [todo('flagpole.s', 'POLE SMALL', 16, 32), todo('flagpole.m', 'POLE MEDIUM', 16, 48), todo('flagpole.l', 'POLE LARGE', 16, 64)],
        },
        {
          title: 'FLAGS: DRAW THE OUTLINE. THE GAME FILLS THE INSIDE WITH ITS COLOR AS HERALDIC HATCHING.',
          perRow: 3,
          slots: [todo('flag.s', 'FLAG SMALL', 8, 6), todo('flag.m', 'FLAG MEDIUM', 12, 8), todo('flag.l', 'FLAG LARGE', 16, 12)],
        },
        {
          title: 'BELLS (NEXT), HANGING IN THEIR FRAME: STILL, AND SWUNG WHILE RINGING.',
          perRow: 4,
          slots: [
            todo('bell.s', 'BELL SMALL', 16, 16),
            todo('bell.s.ring', 'RINGING', 16, 16),
            todo('bell.m', 'BELL MEDIUM', 32, 32),
            todo('bell.m.ring', 'RINGING', 32, 32),
            todo('bell.l', 'BELL LARGE', 48, 48),
            todo('bell.l.ring', 'RINGING', 48, 48),
          ],
        },
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

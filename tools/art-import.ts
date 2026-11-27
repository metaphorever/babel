// Reads the art in art-src/shots/ (screenshots of the sheets, loose pieces,
// the portrait PSD) and writes the game's PNG sprite sheets and manifest to
// public/art/. A sheet with no screenshot keeps the built-in art.
//
//   npm run art:import
//
// See docs/SPRITES.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CELL, GLYPH_NAMES, ITEM_NAMES, PROP_NAMES, SMALL_CELL, WALK_FRAMES, clean, type Grid } from '../src/render/spriteData';
import { allWorldArt } from '../src/render/worldArt';
import { bitsToPng, decodePngBits, decodePngRgba, gridsToPng } from './png';
import { partInfo, readCloudSheet, type CloudPartInfo } from '../src/render/clouds';
import { buildPages, readPage, renderPage, slotsToArt } from './sheets';
import { KEEP_BUILT_IN, LOOSE, PORTRAIT_PSD, SHEET_SHOTS, readLoose, readPatterns, sheetFromShot } from './shots';
import { readPsd } from './psd';
import { PORTRAIT_KINDS, PORTRAIT_SIZE, type PortraitKind } from '../src/render/portrait';
import { extraWorldArt } from '../src/render/worldArt';

const SRC = join(process.cwd(), 'art-src');
const OUT = join(process.cwd(), 'public', 'art');
mkdirSync(OUT, { recursive: true });

// -------------------------------------------------------- read the pages
const slots = new Map<string, Grid | null>();
for (const page of buildPages()) {
  let bits: Uint8Array;
  if (SHEET_SHOTS[page.name]) {
    bits = sheetFromShot(page, SHEET_SHOTS[page.name]);
  } else {
    console.log(`  built-in ${page.name} (no screenshot)`);
    bits = renderPage(page);
  }
  for (const [k, v] of readPage(page, bits)) slots.set(k, v);
}
const { art, world } = slotsToArt(slots);
const builtIn = new Map([...allWorldArt(), ...extraWorldArt()].map((s) => [s.name, s.grid]));
for (const name of KEEP_BUILT_IN) world[name] = builtIn.get(name)!;
for (const s of extraWorldArt()) world[s.name] = s.grid;
for (const l of LOOSE) {
  world[l.name] = readLoose(l);
  console.log(`  cut      ${l.name} from shots/${l.file}`);
}

// ------------------------------------------------- write the game's PNGs
const write = (file: string, data: Uint8Array) => {
  writeFileSync(join(OUT, file), data);
  console.log(`  wrote    public/art/${file}`);
};
write('workers-body.png', gridsToPng(art.body.map((frames) => frames.map(clean)), CELL, CELL));
write('workers-head.png', gridsToPng(art.head.map((g) => [g]), CELL, CELL));
write('workers-beard.png', gridsToPng(art.beard.map((g) => [g]), CELL, CELL));
write('workers-hat.png', gridsToPng(art.hat.map((g) => [g]), CELL, CELL));
write('items.png', gridsToPng([ITEM_NAMES.map((n) => art.items[n])], SMALL_CELL, SMALL_CELL));
write('props.png', gridsToPng([PROP_NAMES.map((n) => art.props[n])], SMALL_CELL, SMALL_CELL));
write('glyphs.png', gridsToPng([GLYPH_NAMES.map((n) => art.glyphs[n])], SMALL_CELL, SMALL_CELL));

// everything else goes into one atlas, with each sprite's rectangle in the manifest
const ATLAS_W = 256;
const rects: Record<string, [number, number, number, number]> = {};
let x = 0;
let y = 0;
let rowH = 0;
const placed: { grid: Grid; x: number; y: number }[] = [];
for (const [name, g] of Object.entries(world)) {
  const s = { name };
  const w = g[0].length;
  const h = g.length;
  if (x + w > ATLAS_W) {
    x = 0;
    y += rowH + 1;
    rowH = 0;
  }
  rects[s.name] = [x, y, w, h];
  placed.push({ grid: g, x, y });
  x += w + 1;
  rowH = Math.max(rowH, h);
}
const atlasH = y + rowH;
const atlas: Grid[][] = [[Array.from({ length: atlasH }, () => '.'.repeat(ATLAS_W))]];
for (const p of placed) {
  p.grid.forEach((line, dy) => {
    const row = atlas[0][0][p.y + dy].split('');
    for (let dx = 0; dx < line.length; dx++) row[p.x + dx] = line[dx];
    atlas[0][0][p.y + dy] = row.join('');
  });
}
write('world.png', gridsToPng(atlas, ATLAS_W, atlasH));

// the night sky: one picture as wide as the map, tiling sideways; its bottom
// edge sits on the horizon. Rounded to pure black and white here.
const SKY_SHOT = 'milkyway-horizontaltile.png';
let nightSky: string | undefined;
if (existsSync(join(SRC, 'shots', SKY_SHOT))) {
  const sky = decodePngBits(new Uint8Array(readFileSync(join(SRC, 'shots', SKY_SHOT))));
  if (sky.grey > 0) console.log(`  note     ${SKY_SHOT} has ${sky.grey} grey pixels (rounded at 50%)`);
  write('night-sky.png', bitsToPng(sky.bits, sky.w, sky.h));
  nightSky = 'night-sky.png';
}

// portraits: every named part in the PSD, by kind, each laid into the full 64x64 frame
let portraits: { file: string; cell: [number, number]; kinds: readonly string[]; counts: Record<string, number>; patterns: string[][] } | undefined;
if (existsSync(join(SRC, 'shots', PORTRAIT_PSD))) {
  const psd = readPsd(join(SRC, 'shots', PORTRAIT_PSD));
  console.log(`  read     shots/${PORTRAIT_PSD}`);
  const parts = Object.fromEntries(PORTRAIT_KINDS.map((k) => [k, [] as Grid[]])) as Record<PortraitKind, Grid[]>;
  let grey = 0;
  for (const l of psd.layers) {
    if (l.group === null || l.width === 0 || l.height === 0) continue;
    const kind = l.name.trim().toLowerCase() as PortraitKind;
    if (!PORTRAIT_KINDS.includes(kind)) {
      console.warn(`  note     "${l.name}" in group ${l.group} isn't a part name; left out`);
      continue;
    }
    grey += l.grey;
    const S = PORTRAIT_SIZE;
    const rows = Array.from({ length: S }, () => '.'.repeat(S).split(''));
    l.grid.forEach((line, dy) => {
      for (let dx = 0; dx < line.length; dx++) {
        const x = l.left + dx, y = l.top + dy;
        if (x >= 0 && y >= 0 && x < S && y < S && line[dx] !== '.') rows[y][x] = line[dx];
      }
    });
    parts[kind].push(rows.map((r) => r.join('')));
  }
  if (grey > 0) console.log(`  note     ${grey} portrait pixels weren't pure black, white or clear (rounded at 50%)`);
  write('portraits.png', gridsToPng(PORTRAIT_KINDS.map((k) => parts[k]), PORTRAIT_SIZE, PORTRAIT_SIZE));
  const patterns = readPatterns();
  portraits = {
    file: 'portraits.png',
    cell: [PORTRAIT_SIZE, PORTRAIT_SIZE],
    kinds: PORTRAIT_KINDS,
    counts: Object.fromEntries(PORTRAIT_KINDS.map((k) => [k, parts[k].length])),
    patterns: patterns.map((p) => p.grid),
  };
  console.log(`  portraits ${PORTRAIT_KINDS.map((k) => `${parts[k].length} ${k}`).join(', ')}; ${patterns.length} backgrounds`);
}

// clouds: the parts sheet, read box by box (the box colours and their yellow and
// orange sides say what each part is); the parts go in one atlas, their kinds
// and marked edges in the manifest
const CLOUD_SHOT = 'cloud-parts.png';
let clouds: { file: string; sets: number; parts: (CloudPartInfo & { rect: [number, number, number, number] })[] } | undefined;
if (existsSync(join(SRC, 'shots', CLOUD_SHOT))) {
  const png = decodePngRgba(new Uint8Array(readFileSync(join(SRC, 'shots', CLOUD_SHOT))));
  const { sheet, warnings, grey } = readCloudSheet(png.rgba, png.w, png.h);
  for (const w of warnings) console.warn(`  note     ${CLOUD_SHOT}: ${w}`);
  if (grey > 0) console.log(`  note     ${CLOUD_SHOT} has ${grey} grey pixels in its parts (rounded at 50%)`);
  const W = 256;
  let cx = 0, cy = 0, rowH = 0;
  const parts: NonNullable<typeof clouds>['parts'] = [];
  const at: { p: (typeof sheet.parts)[number]; x: number; y: number }[] = [];
  for (const p of sheet.parts) {
    if (cx + p.w > W) { cx = 0; cy += rowH + 1; rowH = 0; }
    parts.push({ ...partInfo(p), rect: [cx, cy, p.w, p.h] });
    at.push({ p, x: cx, y: cy });
    cx += p.w + 1;
    rowH = Math.max(rowH, p.h);
  }
  const H = cy + rowH;
  const grid = Array.from({ length: H }, () => '.'.repeat(W).split(''));
  for (const { p, x, y } of at) for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
    const v = p.px[j * p.w + i];
    if (v) grid[y + j][x + i] = v === 1 ? '1' : '0';
  }
  write('clouds.png', gridsToPng([[grid.map((r) => r.join(''))]], W, H));
  clouds = { file: 'clouds.png', sets: sheet.sets, parts };
  const count = (k: string) => sheet.parts.filter((p) => p.kind === k).length;
  console.log(`  clouds   ${count('top')} tops, ${count('midCap')} middle caps, ${count('midCenter')} centres, ${sheet.sets} bottom sets (${count('botCap')} caps, ${count('botMid')} middles), ${count('combo')} combined ends`);
}

const manifest = {
  version: 2,
  note: 'Generated by npm run art:import from the art in art-src/shots/. Edit that, not these. See docs/SPRITES.md.',
  sheets: {
    body: { file: 'workers-body.png', cell: [CELL, CELL], layout: `rows = body variants, columns = walk frames (${WALK_FRAMES})` },
    head: { file: 'workers-head.png', cell: [CELL, CELL], layout: 'rows = head variants' },
    beard: { file: 'workers-beard.png', cell: [CELL, CELL], layout: 'rows = beard variants' },
    hat: { file: 'workers-hat.png', cell: [CELL, CELL], layout: 'rows = hat variants' },
    items: { file: 'items.png', cell: [SMALL_CELL, SMALL_CELL], names: [...ITEM_NAMES] },
    props: { file: 'props.png', cell: [SMALL_CELL, SMALL_CELL], names: [...PROP_NAMES] },
    glyphs: { file: 'glyphs.png', cell: [SMALL_CELL, SMALL_CELL], names: [...GLYPH_NAMES] },
  },
  atlases: {
    world: { file: 'world.png', sprites: rects },
  },
  nightSky,
  portraits,
  clouds,
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('  wrote    public/art/manifest.json');
console.log(`Done: ${art.body.length} bodies, ${art.head.length} heads, ${art.beard.length} beards, ${art.hat.length} hats, ${Object.keys(rects).length} world sprites.`);

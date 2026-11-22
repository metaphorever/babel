// Writes the built-in placeholder art out as editable PNG sprite sheets in
// public/art/, plus the manifest the game reads. Run it with:
//
//   npm run art:export
//
// It won't overwrite sheets you've already drawn unless you pass --force.
// See docs/SPRITES.md for the format.

import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CELL,
  GLYPH_NAMES,
  ITEM_NAMES,
  PROP_NAMES,
  SMALL_CELL,
  WALK_FRAMES,
  composeWorker,
  defaultArt,
  type Grid,
} from '../src/render/spriteData';

const OUT = join(process.cwd(), 'public', 'art');
const force = process.argv.includes('--force');

// ------------------------------------------------------------ PNG writer

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** RGBA pixels to a PNG file. */
function png(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// --------------------------------------------------------------- sheets

/** Lay out cells [row][col] of cw x ch into one RGBA image. */
function sheet(cells: Grid[][], cw: number, ch: number): { w: number; h: number; px: Uint8Array } {
  const cols = Math.max(1, ...cells.map((r) => r.length));
  const w = cols * cw;
  const h = cells.length * ch;
  const px = new Uint8Array(w * h * 4);
  cells.forEach((row, ry) =>
    row.forEach((grid, rx) =>
      grid.forEach((line, y) => {
        for (let x = 0; x < line.length && x < cw; x++) {
          const i = ((ry * ch + y) * w + (rx * cw + x)) * 4;
          const c = line[x];
          if (c === '1') px.set([0, 0, 0, 255], i);
          else if (c === '0') px.set([255, 255, 255, 255], i);
          else if (c === 'r') px.set([255, 0, 0, 255], i);
        }
      }),
    ),
  );
  return { w, h, px };
}

function write(file: string, cells: Grid[][], cw: number, ch: number): void {
  const path = join(OUT, file);
  if (existsSync(path) && !force) {
    console.log(`  kept     ${file} (already exists; --force to overwrite)`);
    return;
  }
  const { w, h, px } = sheet(cells, cw, ch);
  writeFileSync(path, png(w, h, px));
  console.log(`  wrote    ${file}  (${w}x${h})`);
}

const art = defaultArt();
mkdirSync(OUT, { recursive: true });
console.log(`Writing sprite sheets to ${OUT}`);

write('workers-body.png', art.body, CELL, CELL);
write('workers-head.png', art.head.map((g) => [g]), CELL, CELL);
write('workers-beard.png', art.beard.map((g) => [g]), CELL, CELL);
write('workers-hat.png', art.hat.map((g) => [g]), CELL, CELL);
write('items.png', [ITEM_NAMES.map((n) => art.items[n])], SMALL_CELL, SMALL_CELL);
write('props.png', [PROP_NAMES.map((n) => art.props[n])], SMALL_CELL, SMALL_CELL);
write('glyphs.png', [GLYPH_NAMES.map((n) => art.glyphs[n])], SMALL_CELL, SMALL_CELL);

// a reference sheet of finished workers (not read by the game)
const looks = Array.from({ length: 32 }, (_, i) => Math.imul(i + 1, 2654435761) >>> 0);
const preview: Grid[][] = [];
for (let r = 0; r < 4; r++) preview.push(looks.slice(r * 8, r * 8 + 8).map((l) => composeWorker(art, l, 0)));
writeFileSync(join(OUT, 'workers-preview.png'), (() => {
  const { w, h, px } = sheet(preview, CELL, CELL);
  return png(w, h, px);
})());
console.log('  wrote    workers-preview.png  (reference only: 32 assembled workers)');

const manifest = {
  version: 1,
  note: 'Sprite sheets for Babel. See docs/SPRITES.md. Black = ink, white = paper, transparent = clear, pure red = anchor.',
  sheets: {
    body: { file: 'workers-body.png', cell: [CELL, CELL], layout: `rows = body variants, columns = walk frames (${WALK_FRAMES}); one red pixel marks the neck` },
    head: { file: 'workers-head.png', cell: [CELL, CELL], layout: 'rows = head variants, drawn with the neck at (7,7), facing right' },
    beard: { file: 'workers-beard.png', cell: [CELL, CELL], layout: 'rows = beard variants, drawn over the head' },
    hat: { file: 'workers-hat.png', cell: [CELL, CELL], layout: 'rows = hat variants, drawn over the head' },
    items: { file: 'items.png', cell: [SMALL_CELL, SMALL_CELL], names: [...ITEM_NAMES] },
    props: { file: 'props.png', cell: [SMALL_CELL, SMALL_CELL], names: [...PROP_NAMES] },
    glyphs: { file: 'glyphs.png', cell: [SMALL_CELL, SMALL_CELL], names: [...GLYPH_NAMES] },
  },
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('  wrote    manifest.json');

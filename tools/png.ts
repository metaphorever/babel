// A small PNG writer (RGBA, no filtering). Node only (uses zlib).
import { deflateSync, inflateSync } from 'node:zlib';
import type { Grid } from '../src/render/spriteData';

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

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Lay grids out in cells [row][col] of cw x ch: black ink, white paper, transparent clear. */
export function gridsToPng(cells: Grid[][], cw: number, ch: number): Uint8Array {
  const cols = Math.max(1, ...cells.map((r) => r.length));
  const w = cols * cw;
  const h = Math.max(1, cells.length) * ch;
  const px = new Uint8Array(w * h * 4);
  cells.forEach((row, ry) =>
    row.forEach((grid, rx) =>
      grid.forEach((line, y) => {
        for (let x = 0; x < line.length && x < cw && y < ch; x++) {
          const i = ((ry * ch + y) * w + (rx * cw + x)) * 4;
          if (line[x] === '1') px.set([0, 0, 0, 255], i);
          else if (line[x] === '0') px.set([255, 255, 255, 255], i);
        }
      }),
    ),
  );
  return encodePng(w, h, px);
}

/** A 1-bit page (1 = black) as an opaque black-and-white PNG, for previews. */
export function bitsToPng(bits: Uint8Array, w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = bits[i] ? 0 : 255;
    px.set([v, v, v, 255], i * 4);
  }
  return encodePng(w, h, px);
}

/**
 * Read a PNG (8-bit or less, any color type, not interlaced) as 1 bit:
 * 1 = black (darker than mid-grey and not transparent). Also counts pixels
 * that weren't pure black or white, which hint at a smeared screenshot.
 */
export function decodePngBits(file: Uint8Array): { w: number; h: number; bits: Uint8Array; grey: number } {
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let o = 8;
  let w = 0, h = 0, depth = 8, ct = 0;
  let plte: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (o < file.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...file.subarray(o + 4, o + 8));
    const d = file.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = dv.getUint32(o + 8);
      h = dv.getUint32(o + 12);
      depth = d[8];
      ct = d[9];
      if (d[12]) throw new Error('interlaced PNGs are not supported');
    }
    if (type === 'PLTE') plte = d;
    if (type === 'tRNS') trns = d;
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const chans = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ct];
  const bpp = Math.max(1, (chans * depth) / 8);
  const stride = Math.ceil((w * chans * depth) / 8);
  const px = new Uint8Array(stride * h);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const up = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = up;
      else if (f === 3) p = (a + up) >> 1;
      else if (f === 4) {
        const pp = a + up - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      line[x] = (line[x] + p) & 255;
    }
    px.set(line, y * stride);
    prev = line;
  }
  const sample = (y: number, i: number) =>
    depth === 8 ? px[y * stride + i] : (px[y * stride + ((i * depth) >> 3)] >> (8 - depth - ((i * depth) & 7))) & ((1 << depth) - 1);
  const bits = new Uint8Array(w * h);
  let grey = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r: number, g: number, b: number, a = 255;
      if (ct === 3) {
        const idx = sample(y, x);
        r = plte![idx * 3];
        g = plte![idx * 3 + 1];
        b = plte![idx * 3 + 2];
        if (trns && idx < trns.length) a = trns[idx];
      } else if (ct === 0) {
        r = g = b = depth === 8 ? px[y * stride + x] : (sample(y, x) * 255) / ((1 << depth) - 1);
      } else if (ct === 4) {
        r = g = b = px[y * stride + x * 2];
        a = px[y * stride + x * 2 + 1];
      } else {
        r = px[y * stride + x * chans];
        g = px[y * stride + x * chans + 1];
        b = px[y * stride + x * chans + 2];
        if (ct === 6) a = px[y * stride + x * 4 + 3];
      }
      const lum = (r + g + b) / 3;
      if (lum > 16 && lum < 240) grey++;
      bits[y * w + x] = a >= 128 && lum < 128 ? 1 : 0;
    }
  }
  return { w, h, bits, grey };
}

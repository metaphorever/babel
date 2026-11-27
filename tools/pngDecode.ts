// Reading a PNG without Node: splitting the file into its chunks, and turning
// the inflated image data into RGBA. The inflating itself is left to the
// caller (node:zlib in the tools, DecompressionStream in tests), so this
// module needs nothing but the language.

export interface PngParts {
  w: number;
  h: number;
  depth: number;
  colorType: number;
  plte: Uint8Array | null;
  trns: Uint8Array | null;
  /** The IDAT chunks joined: zlib data, still to be inflated. */
  data: Uint8Array;
}

/** Split a PNG (8-bit or less, any color type, not interlaced) into what pngPixels needs. */
export function parsePng(file: Uint8Array): PngParts {
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let o = 8;
  let w = 0, h = 0, depth = 8, colorType = 0;
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
      colorType = d[9];
      if (d[12]) throw new Error('interlaced PNGs are not supported');
    }
    if (type === 'PLTE') plte = d;
    if (type === 'tRNS') trns = d;
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const data = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let at = 0;
  for (const d of idat) { data.set(d, at); at += d.length; }
  return { w, h, depth, colorType: colorType, plte, trns, data };
}

/** The image as RGBA, 4 bytes a pixel, from its parts and its inflated data. */
export function pngPixels(png: PngParts, raw: Uint8Array): { w: number; h: number; rgba: Uint8Array } {
  const { w, h, depth, colorType: ct, plte, trns } = png;
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
  const rgba = new Uint8Array(w * h * 4);
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
      rgba.set([r, g, b, a], (y * w + x) * 4);
    }
  }
  return { w, h, rgba };
}

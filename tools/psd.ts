// A small Photoshop (.psd) reader: just enough for the portrait file. It
// reads the layer tree (groups and layers, top of the stack last) and each
// layer's pixels, rounded to 1 bit the way the rest of the art is: anything
// darker than mid-grey is ink, lighter is paper, and less than half opaque
// is see-through. 8-bit RGB or greyscale, raw or RLE-compressed layers.

import { readFileSync } from 'node:fs';

export interface PsdLayer {
  name: string;
  /** The group it's in (the innermost one), or null at the top level. */
  group: string | null;
  left: number;
  top: number;
  width: number;
  height: number;
  hidden: boolean;
  /** Row by row: '1' ink, '0' paper, '.' see-through. Empty for an empty layer. */
  grid: string[];
  /** Pixels that weren't pure black, white or clear, rounded. */
  grey: number;
}

export interface Psd {
  width: number;
  height: number;
  /** Bottom of the stack first, the order they're drawn in. Groups themselves aren't listed. */
  layers: PsdLayer[];
}

export function readPsd(file: string): Psd {
  const buf = readFileSync(file);
  let o = 0;
  const u8 = () => buf[o++];
  const u16 = () => { const v = buf.readUInt16BE(o); o += 2; return v; };
  const i16 = () => { const v = buf.readInt16BE(o); o += 2; return v; };
  const u32 = () => { const v = buf.readUInt32BE(o); o += 4; return v; };
  const i32 = () => { const v = buf.readInt32BE(o); o += 4; return v; };
  const str = (n: number) => { const s = buf.toString('latin1', o, o + n); o += n; return s; };

  if (str(4) !== '8BPS') throw new Error(`${file} isn't a Photoshop file`);
  if (u16() !== 1) throw new Error(`${file}: only classic .psd files are read (not .psb)`);
  o += 6;
  u16(); // channels
  const height = u32();
  const width = u32();
  const depth = u16();
  u16(); // colour mode
  if (depth !== 8) throw new Error(`${file}: 8 bits per channel only (it's ${depth})`);
  { const n = u32(); o += n; } // colour mode data
  { const n = u32(); o += n; } // image resources
  u32(); // layer and mask info length
  u32(); // layer info length
  const count = Math.abs(i16());

  interface Rec { name: string; top: number; left: number; bottom: number; right: number; chans: { id: number; len: number }[]; section: number; hidden: boolean }
  const recs: Rec[] = [];
  for (let i = 0; i < count; i++) {
    const top = i32(), left = i32(), bottom = i32(), right = i32();
    const nc = u16();
    const chans: { id: number; len: number }[] = [];
    for (let c = 0; c < nc; c++) chans.push({ id: i16(), len: u32() });
    str(4); // '8BIM'
    str(4); // blend mode
    u8(); // opacity
    u8(); // clipping
    const flags = u8();
    u8();
    const extra = u32();
    const end = o + extra;
    { const n = u32(); o += n; } // layer mask
    { const n = u32(); o += n; } // blending ranges
    const nlen = u8();
    let name = str(nlen);
    o += (4 - ((nlen + 1) % 4)) % 4;
    let section = 0;
    while (o < end) {
      str(4);
      const key = str(4);
      const len = u32();
      const st = o;
      if (key === 'luni') {
        const n = u32();
        let s = '';
        for (let k = 0; k < n; k++) s += String.fromCharCode(u16());
        name = s;
      } else if (key === 'lsct') section = u32();
      o = st + len + (len % 2);
      if (o > end) o = end;
    }
    o = end;
    recs.push({ name, top, left, bottom, right, chans, section, hidden: (flags & 2) !== 0 });
  }

  // each layer's channels, in the same order
  const pixels: Map<number, Uint8Array>[] = [];
  for (const r of recs) {
    const data = new Map<number, Uint8Array>();
    const w = r.right - r.left, h = r.bottom - r.top;
    for (const c of r.chans) {
      const st = o;
      const comp = u16();
      // user masks (-2, -3) use their own rectangle: not needed here
      if (c.id < -1 || w <= 0 || h <= 0) { o = st + c.len; continue; }
      const px = new Uint8Array(w * h);
      if (comp === 0) {
        for (let k = 0; k < w * h; k++) px[k] = u8();
      } else if (comp === 1) {
        const counts: number[] = [];
        for (let y = 0; y < h; y++) counts.push(u16());
        for (let y = 0; y < h; y++) {
          const rowEnd = o + counts[y];
          let x = 0;
          while (o < rowEnd) {
            const n = buf.readInt8(o++);
            if (n >= 0) for (let k = 0; k <= n; k++) px[y * w + x++] = u8();
            else if (n !== -128) {
              const v = u8();
              for (let k = 0; k < 1 - n; k++) px[y * w + x++] = v;
            }
          }
        }
      } else throw new Error(`${file}: layer "${r.name}" uses compression ${comp}, which isn't read`);
      data.set(c.id, px);
      o = st + c.len;
    }
    pixels.push(data);
  }

  // the tree: a group's closing marker (section 3) comes first in the file, its header (1 or 2) last
  const layers: PsdLayer[] = [];
  const stack: string[] = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.section === 3) {
      // find this group's name: the matching header further up the list
      let depthCount = 0;
      let name = '';
      for (let j = i + 1; j < recs.length; j++) {
        if (recs[j].section === 3) depthCount++;
        else if (recs[j].section === 1 || recs[j].section === 2) {
          if (depthCount === 0) { name = recs[j].name; break; }
          depthCount--;
        }
      }
      stack.push(name);
      continue;
    }
    if (r.section === 1 || r.section === 2) {
      stack.pop();
      continue;
    }
    const w = Math.max(0, r.right - r.left), h = Math.max(0, r.bottom - r.top);
    const data = pixels[i];
    const red = data.get(0), green = data.get(1) ?? red, blue = data.get(2) ?? red, alpha = data.get(-1);
    const grid: string[] = [];
    let grey = 0;
    for (let y = 0; y < h; y++) {
      let line = '';
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        const a = alpha ? alpha[k] : 255;
        const l = ((red?.[k] ?? 0) + (green?.[k] ?? 0) + (blue?.[k] ?? 0)) / 3;
        if ((a > 0 && a < 255) || (a >= 128 && l > 0 && l < 255)) grey++;
        line += a < 128 ? '.' : l < 128 ? '1' : '0';
      }
      grid.push(line);
    }
    layers.push({ name: r.name, group: stack.length ? stack[stack.length - 1] : null, left: r.left, top: r.top, width: w, height: h, hidden: r.hidden, grid, grey });
  }
  return { width, height, layers };
}

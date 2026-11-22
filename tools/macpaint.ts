// MacPaint documents, read and written. Pure functions on byte arrays, so
// they can be tested and used from any tool.
//
// The format: a 512-byte header (a version number, then pattern data we
// leave empty so MacPaint uses its default patterns), followed by 720
// scanlines of 576 pixels (72 bytes each), each line compressed on its own
// with PackBits. A set bit is black.
//
// On a classic Mac a file also has a type and creator ('PNTG' / 'MPNT')
// that live outside the file's bytes. MacBinary wraps those in, so an
// emulator can recreate a proper MacPaint document.

export const PAINT_W = 576;
export const PAINT_H = 720;
const ROW_BYTES = PAINT_W / 8;
const HEADER = 512;

// ------------------------------------------------------------- PackBits

export function packBits(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < src.length) {
    // a run of the same byte?
    let run = 1;
    while (i + run < src.length && run < 128 && src[i + run] === src[i]) run++;
    if (run >= 3) {
      out.push((257 - run) & 0xff, src[i]);
      i += run;
      continue;
    }
    // otherwise a literal stretch, up to the next run of 3 or more
    const start = i;
    let len = 0;
    while (i < src.length && len < 128) {
      if (i + 2 < src.length && src[i] === src[i + 1] && src[i] === src[i + 2]) break;
      i++;
      len++;
    }
    out.push(len - 1, ...src.subarray(start, start + len));
  }
  return Uint8Array.from(out);
}

/** Unpack exactly `size` bytes starting at `pos`. Returns the bytes and where reading stopped. */
export function unpackBits(src: Uint8Array, pos: number, size: number): { bytes: Uint8Array; pos: number } {
  const out = new Uint8Array(size);
  let o = 0;
  while (o < size && pos < src.length) {
    const n = src[pos++];
    if (n < 128) {
      const len = n + 1;
      for (let k = 0; k < len && o < size; k++) out[o++] = src[pos++];
    } else if (n > 128) {
      const len = 257 - n;
      const v = src[pos++];
      for (let k = 0; k < len && o < size; k++) out[o++] = v;
    }
    // 128 is a no-op
  }
  return { bytes: out, pos };
}

// ---------------------------------------------------------- the document

/** One byte per pixel in, 1 = black. Returns a MacPaint document's bytes. */
export function encodeMacPaint(pixels: Uint8Array): Uint8Array {
  if (pixels.length !== PAINT_W * PAINT_H) throw new Error('MacPaint pages are 576x720');
  const parts: Uint8Array[] = [new Uint8Array(HEADER)]; // version 0: default patterns
  const row = new Uint8Array(ROW_BYTES);
  for (let y = 0; y < PAINT_H; y++) {
    row.fill(0);
    for (let x = 0; x < PAINT_W; x++) if (pixels[y * PAINT_W + x]) row[x >> 3] |= 0x80 >> (x & 7);
    parts.push(packBits(row));
  }
  return concat(parts);
}

/** A MacPaint document (raw, or wrapped in MacBinary) to one byte per pixel, 1 = black. */
export function decodeMacPaint(file: Uint8Array): Uint8Array {
  const data = unwrapMacBinary(file) ?? file;
  if (data.length < HEADER) throw new Error('Too short to be a MacPaint document');
  const pixels = new Uint8Array(PAINT_W * PAINT_H);
  let pos = HEADER;
  for (let y = 0; y < PAINT_H; y++) {
    const r = unpackBits(data, pos, ROW_BYTES);
    pos = r.pos;
    for (let x = 0; x < PAINT_W; x++) pixels[y * PAINT_W + x] = (r.bytes[x >> 3] >> (7 - (x & 7))) & 1;
  }
  return pixels;
}

// -------------------------------------------------------------- MacBinary

function crc16(bytes: Uint8Array): number {
  // CRC-16/XMODEM, as MacBinary II uses
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** Wrap a data fork in a MacBinary II header with a Mac file name, type and creator. */
export function wrapMacBinary(name: string, data: Uint8Array, type = 'PNTG', creator = 'MPNT', date = new Date(0)): Uint8Array {
  const h = new Uint8Array(128);
  const dv = new DataView(h.buffer);
  const n = name.slice(0, 63);
  h[1] = n.length;
  for (let i = 0; i < n.length; i++) h[2 + i] = n.charCodeAt(i) & 0x7f;
  for (let i = 0; i < 4; i++) {
    h[65 + i] = type.charCodeAt(i);
    h[69 + i] = creator.charCodeAt(i);
  }
  dv.setUint32(83, data.length); // data fork length
  dv.setUint32(87, 0); // no resource fork
  const macSeconds = Math.floor(date.getTime() / 1000) + 2082844800; // seconds since 1904
  dv.setUint32(91, macSeconds >>> 0);
  dv.setUint32(95, macSeconds >>> 0);
  h[122] = 129; // MacBinary II
  h[123] = 129;
  dv.setUint16(124, crc16(h.subarray(0, 124)));
  const padded = new Uint8Array(Math.ceil(data.length / 128) * 128);
  padded.set(data);
  return concat([h, padded]);
}

/** If this is a MacBinary file, return its data fork; otherwise null. */
export function unwrapMacBinary(file: Uint8Array): Uint8Array | null {
  if (file.length < 128 || file[0] !== 0 || file[74] !== 0 || file[82] !== 0) return null;
  const nameLen = file[1];
  if (nameLen < 1 || nameLen > 63) return null;
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const len = dv.getUint32(83);
  if (len === 0 || 128 + len > file.length) return null;
  return file.subarray(128, 128 + len);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

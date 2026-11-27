// Clouds built from parts, the way workers are. See docs/SPRITES.md.
//
// The parts sheet (art-src/shots/cloud-parts.png) has each part in a 1px
// box on a pink (see-through) ground. The box colour says what it is:
//   green           a top piece (back layer)
//   blue + orange   a middle cap (the orange side is its inner edge, to be hidden)
//   blue + yellow   a middle centre (the yellow bottom sits on the bottom layer)
//   blue, orange,   a combined bottom + middle end: an end of a bottom set
//     no yellow     that is also that side's middle cap
//   red             a bottom middle (front layer)
//   blue, plain     a bottom cap
// A yellow or orange side marks the part's own pixels just inside it.
// Bottom parts come in sets, one row of boxes each (option 1 above option 2).
//
// The rules a cloud keeps (check() lists every break):
// - the bottom is one row: a cap or combined end, 1-5 middles, a cap or combined end
// - the middle sits on the bottom's top row; its yellow pixels touch the bottom
// - the middle caps' orange edges hide under the centres; the caps' outer ends show
// - every open (white) pixel of the bottom's top row has the middle (or a top) above it
// - 1-3 tops at the back: orange bottom hidden, at least 4px showing above the body,
//   never showing through it; cut off at the cloud's bottom if they sink that far
// - shorter clouds: middle + bottom, or top + bottom
// - a part is used at most twice a cloud (mirrored or not), never twice side by side
//   among the middle centres
//
// Coordinates: y = 0 is the top row of the bottom layer; the middle sits on
// it (its bottom row at y = -1); tops are further up (negative y).

export type CloudKind = 'top' | 'midCap' | 'midCenter' | 'botCap' | 'botMid' | 'combo';
export type Side = 'L' | 'R' | null;
/** A box side's marks, one character a pixel: '.' none, 'y' yellow, 'o' orange. */
export interface CloudEdges {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}
/** What the manifest says about a part (its pixels are a rectangle of clouds.png). */
export interface CloudPartInfo {
  name: string;
  kind: CloudKind;
  set?: number;
  side?: Side;
  /** For a combined end: how many of its bottom rows are bottom (the set's height). */
  band?: number;
  edges?: CloudEdges;
}
export interface CloudPart extends CloudPartInfo {
  base: string;
  set: number;
  side: Side;
  band: number;
  w: number;
  h: number;
  /** 0 clear, 1 ink, 2 paper */
  px: Uint8Array;
  /** YEL | ORG per pixel */
  mark: Uint8Array;
  mirrored: boolean;
  /** Rows cut off the bottom (top pieces sunk below the cloud). */
  cropped: number;
  yellow: [number, number][];
  conceal: [number, number][];
  topRow: number;
  /** First and last columns of the yellow edge (a combined end: its whole width). */
  yS: number;
  yE: number;
  firstCol: number;
  lastCol: number;
}
export interface CloudSheet {
  parts: CloudPart[];
  sets: number;
}

export const YEL = 1; // must sit on the bottom layer
export const ORG = 2; // must be hidden by a part in front

// ------------------------------------------------------------ reading the sheet

const PAL: [number, [number, number, number]][] = [
  [1, [255, 174, 201]], // pink
  [2, [0, 162, 232]], // blue
  [3, [237, 28, 36]], // red
  [4, [34, 177, 76]], // green
  [5, [255, 242, 0]], // yellow
  [6, [255, 127, 39]], // orange
];
const PINK = 1, BLUE = 2, RED = 3, GREEN = 4, YELLOW = 5, ORANGE = 6;

function classify(r: number, g: number, b: number): number {
  for (const [c, [pr, pg, pb]] of PAL) if ((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2 < 1200) return c;
  return 0;
}

/**
 * Read the parts sheet from RGBA pixels. See-through pixels count as white,
 * like the paint program shows them; grey is rounded to black or white.
 */
export function readCloudSheet(
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  comboSet = 2,
): { sheet: CloudSheet; warnings: string[]; grey: number } {
  const px = (i: number): [number, number, number] => {
    const a = rgba[i * 4 + 3] / 255;
    const mix = (v: number) => Math.round(v * a + 255 * (1 - a));
    return [mix(rgba[i * 4]), mix(rgba[i * 4 + 1]), mix(rgba[i * 4 + 2])];
  };
  const cls = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) cls[i] = classify(...px(i));
  const isBorder = (c: number) => c >= BLUE;
  const seen = new Uint8Array(w * h);
  const warnings = new Set<string>();
  let grey = 0;

  interface Raw { info: CloudPartInfo; x0: number; y0: number; x1: number; y1: number; w: number; h: number; px: Uint8Array }
  const raw: Raw[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !isBorder(cls[i])) continue;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    const colors = new Set<number>();
    const cols = new Map<number, number>(), rows = new Map<number, number>();
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w, y = (j - x) / w;
      colors.add(cls[j]);
      cols.set(x, (cols.get(x) ?? 0) + 1);
      rows.set(y, (rows.get(y) ?? 0) + 1);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      const nb: number[] = [];
      if (x > 0) nb.push(j - 1);
      if (x < w - 1) nb.push(j + 1);
      if (y > 0) nb.push(j - w);
      if (y < h - 1) nb.push(j + w);
      for (const k of nb) if (!seen[k] && isBorder(cls[k])) { seen[k] = 1; stack.push(k); }
    }
    if (x1 - x0 < 3 || y1 - y0 < 3) continue;
    // the box's sides are the outermost lines running at least half its length,
    // so a line drawn a pixel past a corner doesn't move the box
    const sides = (counts: Map<number, number>, len: number) => {
      const k = [...counts].filter(([, n]) => n >= len / 2).map(([v]) => v);
      return [Math.min(...k), Math.max(...k)];
    };
    const [bx0, bx1] = sides(cols, y1 - y0 + 1);
    const [by0, by1] = sides(rows, x1 - x0 + 1);
    const pw = bx1 - bx0 - 1, ph = by1 - by0 - 1;
    if (pw < 1 || ph < 1) continue;

    const grid = new Uint8Array(pw * ph);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const k = (by0 + 1 + y) * w + (bx0 + 1 + x);
      if (cls[k] === PINK) continue;
      if (cls[k] >= BLUE) { warnings.add(`a box colour inside a part near (${bx0 + 1 + x}, ${by0 + 1 + y}), read as see-through`); continue; }
      const [r, g, b] = px(k);
      if (!(r === g && g === b && (r === 0 || r === 255))) grey++;
      grid[y * pw + x] = (r * 299 + g * 587 + b * 114) / 1000 < 128 ? 1 : 2;
    }
    const mk = (c: number) => (c === YELLOW ? 'y' : c === ORANGE ? 'o' : '.');
    const edge = (n: number, at: (k: number) => number) => {
      let s = '';
      for (let k = 0; k < n; k++) s += mk(cls[at(k)]);
      return /[yo]/.test(s) ? s : undefined;
    };
    const edges: CloudEdges = {
      top: edge(pw, (k) => by0 * w + bx0 + 1 + k),
      bottom: edge(pw, (k) => by1 * w + bx0 + 1 + k),
      left: edge(ph, (k) => (by0 + 1 + k) * w + bx0),
      right: edge(ph, (k) => (by0 + 1 + k) * w + bx1),
    };
    for (const s of ['top', 'left', 'right'] as const) if (edges[s]?.includes('y')) warnings.add(`a yellow mark on a ${s} edge (only bottom edges are read as yellow)`);
    for (const s of Object.keys(edges) as (keyof CloudEdges)[]) if (!edges[s]) delete edges[s];
    const colOpaque = (x: number) => { let n = 0; for (let y = 0; y < ph; y++) if (grid[y * pw + x]) n++; return n; };
    const oRight = !!edges.right?.includes('o');
    let kind: CloudKind;
    let side: Side = null;
    if (colors.has(GREEN)) kind = 'top';
    else if (colors.has(ORANGE) && !colors.has(YELLOW)) { kind = 'combo'; side = oRight ? 'L' : 'R'; }
    else if (colors.has(ORANGE)) { kind = 'midCap'; side = oRight ? 'L' : 'R'; }
    else if (colors.has(YELLOW)) kind = 'midCenter';
    else if (colors.has(RED)) kind = 'botMid';
    else { kind = 'botCap'; side = colOpaque(pw - 1) >= colOpaque(0) ? 'L' : 'R'; }
    raw.push({ info: { name: '', kind, side, edges }, x0: bx0, y0: by0, x1: bx1, y1: by1, w: pw, h: ph, px: grid });
  }

  // bottom sets: one row of boxes each, top to bottom
  const bots = raw.filter((r) => r.info.kind === 'botMid' || r.info.kind === 'botCap').sort((a, b) => a.y0 - b.y0);
  let sets = 0, lastY = -999;
  for (const r of bots) { if (r.y0 - lastY > 20) sets++; lastY = r.y0; r.info.set = sets; }
  // names, in sheet order
  const byX = (a: Raw, b: Raw) => a.x0 - b.x0;
  const name = (list: Raw[], prefix: string) => list.forEach((r, i) => (r.info.name = `${prefix}${i + 1}`));
  const of = (kind: CloudKind, side?: Side) => raw.filter((r) => r.info.kind === kind && (side === undefined || r.info.side === side));
  name(of('top').sort(byX), 'T');
  name(of('midCap', 'L').sort(byX), 'ML');
  name(of('midCap', 'R').sort(byX), 'MR');
  name(of('midCenter').sort((a, b) => Math.round(a.y1 / 10) - Math.round(b.y1 / 10) || byX(a, b)), 'MC');
  const cs = Math.min(comboSet, sets);
  const band = Math.max(0, ...bots.filter((r) => r.info.set === cs).map((r) => r.h));
  name(of('combo').sort(byX), 'C');
  for (const r of of('combo')) { r.info.set = cs; r.info.band = band; }
  for (let s = 1; s <= sets; s++) {
    const inSet = (r: Raw) => r.info.set === s;
    name(of('botCap', 'L').filter(inSet).sort(byX), `${s}L`);
    name(of('botMid').filter(inSet).sort(byX), `${s}m`);
    name(of('botCap', 'R').filter(inSet).sort(byX), `${s}R`);
  }
  return { sheet: { parts: raw.map((r) => makePart(r.info, r.w, r.h, r.px)), sets }, warnings: [...warnings], grey };
}

/** A part from its manifest entry and pixels (0 clear, 1 ink, 2 paper). */
export function makePart(info: CloudPartInfo, w: number, h: number, px: Uint8Array): CloudPart {
  const mark = new Uint8Array(w * h);
  const e = info.edges ?? {};
  const put = (x: number, y: number, c: string) => { if (c === 'y') mark[y * w + x] |= YEL; if (c === 'o') mark[y * w + x] |= ORG; };
  for (let x = 0; x < w; x++) { put(x, 0, e.top?.[x] ?? '.'); put(x, h - 1, e.bottom?.[x] ?? '.'); }
  for (let y = 0; y < h; y++) { put(0, y, e.left?.[y] ?? '.'); put(w - 1, y, e.right?.[y] ?? '.'); }
  return finish({
    ...info,
    base: info.name,
    set: info.set ?? 0,
    side: info.side ?? null,
    band: info.band ?? 0,
    w, h, px, mark,
    mirrored: false,
    cropped: 0,
    yellow: [], conceal: [], topRow: 0, yS: -1, yE: -1, firstCol: 0, lastCol: 0,
  });
}

/** Work out what the assembler asks of a part over and over. */
function finish(p: CloudPart): CloudPart {
  const { w, h, px, mark } = p;
  p.yellow = [];
  p.conceal = [];
  p.topRow = h;
  p.yS = -1;
  p.yE = -1;
  p.firstCol = w;
  p.lastCol = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!px[i]) continue;
    p.topRow = Math.min(p.topRow, y);
    p.firstCol = Math.min(p.firstCol, x);
    p.lastCol = Math.max(p.lastCol, x);
    if (mark[i] & YEL) { p.yellow.push([x, y]); if (p.yS < 0) p.yS = x; p.yE = x; }
    // a combined end's bottom rows join the bottom piece beside them rather than hide
    if (mark[i] & ORG && !(p.band && y >= h - p.band)) p.conceal.push([x, y]);
  }
  if (p.kind === 'combo') { p.yS = 0; p.yE = w - 1; }
  return p;
}

const mirrors = new WeakMap<CloudPart, CloudPart>();
/** The part flipped left to right (cached, so mirror(mirror(p)) === p). */
export function mirror(p: CloudPart): CloudPart {
  const known = mirrors.get(p);
  if (known) return known;
  const { w, h } = p;
  const px = new Uint8Array(w * h), mark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    px[y * w + (w - 1 - x)] = p.px[y * w + x];
    mark[y * w + (w - 1 - x)] = p.mark[y * w + x];
  }
  const side: Side = p.side === 'L' ? 'R' : p.side === 'R' ? 'L' : null;
  const m = finish({ ...p, px, mark, side, mirrored: !p.mirrored, name: p.mirrored ? p.base : `${p.base}′` });
  mirrors.set(p, m);
  mirrors.set(m, p);
  return m;
}

const crops = new WeakMap<CloudPart, Map<number, CloudPart>>();
/** A top piece with only its first `rows` rows kept; the new bottom row is to be hidden. */
function crop(p: CloudPart, rows: number): CloudPart {
  let byRows = crops.get(p);
  if (!byRows) crops.set(p, (byRows = new Map()));
  const known = byRows.get(rows);
  if (known) return known;
  const px = p.px.slice(0, rows * p.w), mark = p.mark.slice(0, rows * p.w);
  for (let x = 0; x < p.w; x++) if (px[(rows - 1) * p.w + x]) mark[(rows - 1) * p.w + x] |= ORG;
  const c = finish({ ...p, h: rows, px, mark, cropped: p.h - rows });
  byRows.set(rows, c);
  return c;
}

// ------------------------------------------------------------ helpers

export function cloudRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const ri = (rng: Rng, a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
const pick = <T>(rng: Rng, arr: readonly T[]): T | null => (arr.length ? arr[Math.floor(rng() * arr.length)] : null);
/** From a list sorted least overlap first: anywhere, or from the least / most third. */
function choose<T>(rng: Rng, list: T[], mode: Spread): T | null {
  if (!list.length) return null;
  if (mode === 'random') return pick(rng, list);
  const k = Math.floor(rng() * Math.max(1, Math.ceil(list.length / 3)));
  return mode === 'less' ? list[k] : list[list.length - 1 - k];
}

class Uses {
  private m = new Map<string, number>();
  constructor(private limit: number) {}
  ok = (p: CloudPart) => (this.m.get(p.base) ?? 0) < this.limit;
  take(p: CloudPart) { this.m.set(p.base, (this.m.get(p.base) ?? 0) + 1); }
}

const both = (list: CloudPart[]) => list.flatMap((p) => [p, mirror(p)]);
const sided = (list: CloudPart[], side: Side) => list.map((p) => (p.side === side ? p : mirror(p)));

/** A paint grid with an offset, big enough for any cloud. */
export class CloudGrid {
  readonly a: Int16Array;
  constructor(readonly x0 = -200, readonly y0 = -220, readonly w = 600, readonly h = 280) {
    this.a = new Int16Array(w * h);
  }
  at(x: number, y: number): number {
    x -= this.x0; y -= this.y0;
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.a[y * this.w + x];
  }
  put(x: number, y: number, v: number): void {
    x -= this.x0; y -= this.y0;
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y * this.w + x] = v;
  }
  /** Paint a placement's opaque pixels with v (or each pixel's own value). */
  add(pl: Placement, v?: number): this {
    const { p, x, y } = pl;
    for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
      const c = p.px[j * p.w + i];
      if (c) this.put(x + i, y + j, v ?? c);
    }
    return this;
  }
}
const gridOf = (pls: Placement[]) => { const g = new CloudGrid(); for (const pl of pls) g.add(pl); return g; };

/** layer: 0 tops, 1 middle caps (and combined ends), 2 middle centres, 3 bottom */
export interface Placement { p: CloudPart; x: number; y: number; layer: 0 | 1 | 2 | 3; zMid?: number; zRand?: number }

const fitsYellow = (p: CloudPart, x: number, y: number, bottom: CloudGrid) => p.yellow.every(([i, j]) => bottom.at(x + i, y + j + 1));
function covers(p: CloudPart, x: number, y: number, pix: [number, number][]): boolean {
  for (const [ax, ay] of pix) {
    const i = ax - x, j = ay - y;
    if (i < 0 || j < 0 || i >= p.w || j >= p.h || !p.px[j * p.w + i]) return false;
  }
  return true;
}
function extent(pls: Placement[]) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const { p, x, y } of pls) {
    for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) if (p.px[j * p.w + i]) {
      x0 = Math.min(x0, x + i); x1 = Math.max(x1, x + i); y0 = Math.min(y0, y + j); y1 = Math.max(y1, y + j);
    }
  }
  return { x0, x1, y0, y1 };
}
/** Topmost opaque row in each column (Infinity where empty). */
function topsOf(g: CloudGrid, x0: number, x1: number): (x: number) => number {
  const t = new Map<number, number>();
  for (let x = x0; x <= x1; x++) {
    let v = Infinity;
    for (let y = g.y0; y < g.y0 + g.h; y++) if (g.at(x, y)) { v = y; break; }
    t.set(x, v);
  }
  return (x) => t.get(x) ?? Infinity;
}
/** Too close to a top already placed: their middles must be o.topSpread px apart. */
const crowded = (others: Placement[], p: CloudPart, x: number, o: CloudOptions) => others.some((t) => Math.abs(t.x + t.p.w / 2 - (x + p.w / 2)) < o.topSpread);

// ------------------------------------------------------------ layers

type Why = (reason: string) => null;

function layBottom(rng: Rng, sheet: CloudSheet, set: number, n: number, uses: Uses, withCombos: boolean, noTwins: boolean): Placement[] | null {
  // an end is a bottom cap, or (when there's a middle) a combined bottom + middle end
  const caps = sheet.parts.filter((p) => (p.kind === 'botCap' || (withCombos && p.kind === 'combo')) && p.set === set);
  const mids = sheet.parts.filter((p) => p.kind === 'botMid' && p.set === set);
  if (!mids.length) return null;
  const setH = Math.max(...mids.map((p) => p.h));
  const row: CloudPart[] = [];
  const L = pick(rng, sided(caps, 'L').filter(uses.ok));
  if (!L) return null;
  uses.take(L); row.push(L);
  for (let i = 0; i < n; i++) {
    const prev = row[row.length - 1];
    const m = pick(rng, both(mids).filter((p) => uses.ok(p) && !(noTwins && p.base === prev.base)));
    if (!m) return null;
    uses.take(m); row.push(m);
  }
  const R = pick(rng, sided(caps, 'R').filter(uses.ok));
  if (!R) return null;
  uses.take(R); row.push(R);
  // combined ends line up with the set by their bottoms, and go with the middle caps, behind the centres
  let x = 0;
  return row.map((p) => {
    const combo = p.kind === 'combo';
    const pl: Placement = { p, x, y: combo ? setH - p.h : 0, layer: combo ? 1 : 3 };
    x += p.w;
    return pl;
  });
}

function layMiddle(rng: Rng, sheet: CloudSheet, bottomPl: Placement[], uses: Uses, o: CloudOptions, why: Why): Placement[] | null {
  const bG = gridOf(bottomPl);
  const bw = bottomPl.reduce((s, pl) => s + pl.p.w, 0);
  const xs: number[] = [];
  for (let x = -80; x <= bw + 40; x++) xs.push(x);
  const caps = sheet.parts.filter((p) => p.kind === 'midCap');
  const centers = sheet.parts.filter((p) => p.kind === 'midCenter');

  // each end: the combined end already there, or a middle cap as far out as it fits
  const capFor = (side: 'L' | 'R'): (Placement & { own: boolean }) | null => {
    const end = side === 'L' ? bottomPl[0] : bottomPl[bottomPl.length - 1];
    if (end.p.kind === 'combo') return { ...end, own: false };
    const p = pick(rng, sided(caps, side).filter(uses.ok));
    if (!p) return why(`middle: out of ${side === 'L' ? 'left' : 'right'} caps`);
    const y = -p.h;
    const fit = xs.filter((x) => fitsYellow(p, x, y, bG));
    if (!fit.length) return why(`middle: ${p.name} can't sit on this bottom`);
    const k = Math.floor(rng() * Math.min(o.capJitter + 1, fit.length));
    uses.take(p);
    return { p, x: side === 'L' ? fit[k] : fit[fit.length - 1 - k], y, layer: 1, own: true };
  };
  const capL = capFor('L');
  if (!capL) return null;
  const capR = capFor('R');
  if (!capR) return null;
  const { p: L, x: xL, y: yL } = capL;
  const { p: R, x: xR, y: yR } = capR;
  if (xR + R.w <= xL + L.w || xR <= xL) return why('middle: bottom too short for both caps');
  const own = [capL, capR].filter((c) => c.own).map(({ own: _, ...pl }) => pl);

  // the caps are the cloud's ends: centres stay o.capShow px inside their outer edges
  const outerL = xL + L.firstCol, outerR = xR + R.lastCol;
  if (outerR - outerL < 2 * o.capShow + 8) return why('middle: bottom too short for both caps');
  const eL = L.conceal.map(([i, j]): [number, number] => [xL + i, yL + j]);
  const eR = R.conceal.map(([i, j]): [number, number] => [xR + i, yR + j]);
  const eRcol = Math.min(...eR.map(([x]) => x));
  const ryStart = xR + R.yS;
  const placed: Placement[] = [];
  let reach = xL + L.yE; // the right end of the middle's bottom edge so far
  let lastX = -Infinity;
  for (let step = 0; step < 12; step++) {
    const leftToHide = eR.filter((pt) => !placed.some((c) => covers(c.p, c.x, c.y, [pt])));
    const prev = placed[placed.length - 1];
    const cands: { v: CloudPart; x: number; y: number; finishes: boolean; overlap: number }[] = [];
    for (const v of both(centers).filter(uses.ok)) {
      if (o.noTwins !== 'off' && prev && v.base === prev.p.base) continue; // never beside itself
      const y = -v.h;
      for (const x of xs) {
        if (x <= lastX) continue;
        if (x + v.firstCol < outerL + o.capShow || x + v.lastCol > outerR - o.capShow) continue;
        const ys = x + v.yS, ye = x + v.yE;
        if (ys > reach + 1) continue; // no gap along the bottom edge
        if (step === 0 && !covers(v, x, y, eL)) continue;
        const finishes = covers(v, x, y, leftToHide) && ye >= ryStart - 1;
        if (!finishes && (ye <= reach || x + v.w / 2 >= eRcol)) continue; // move on, and don't overrun the right cap
        if (!fitsYellow(v, x, y, bG)) continue;
        cands.push({ v, x, y, finishes, overlap: reach - ys });
      }
    }
    if (!cands.length) return why(step === 0 ? `middle: no centre hides ${L.name}'s edge` : "middle: centres can't reach the right cap");
    const fin = cands.filter((c) => c.finishes);
    const c = choose(rng, (fin.length ? fin : cands).sort((a, b) => a.overlap - b.overlap), o.overlap)!;
    uses.take(c.v);
    placed.push({ p: c.v, x: c.x, y: c.y, layer: 2 });
    reach = Math.max(reach, c.x + c.v.yE);
    lastX = c.x;
    if (c.finishes) return [...own, ...placed];
  }
  return why('middle: too many centres');
}

/** Every height (and the cut it needs) a top piece at column x may sit at, highest first. */
function topSpots(v: CloudPart, x: number, body: CloudGrid, bodyTopAt: (x: number) => number, bodyTop: number, bottomRow: number) {
  const out: { p: CloudPart; y: number }[] = [];
  for (let y = bodyTop - v.h; y <= bottomRow; y++) {
    if (y + v.topRow > bodyTop - 4) break; // at least 4px must show above the body
    const p = y + v.h - 1 > bottomRow ? crop(v, bottomRow - y + 1) : v;
    if (p.h < 1) break;
    if (!p.conceal.every(([i, j]) => body.at(x + i, y + j))) continue;
    let leak = false;
    for (let j = 0; j < p.h && !leak; j++) for (let i = 0; i < p.w; i++) {
      if (!p.px[j * p.w + i]) continue;
      const ax = x + i, ay = y + j;
      if (!body.at(ax, ay) && ay >= bodyTopAt(ax)) { leak = true; break; }
    }
    if (!leak) out.push({ p, y });
  }
  return out;
}

function pickSpot<T>(rng: Rng, spots: T[], sink: Sink): T | null {
  if (!spots.length) return null;
  if (sink === 'least') return spots[0];
  if (sink === 'most') return spots[spots.length - 1];
  return pick(rng, spots);
}

/** n top pieces anywhere over the body, behind it. */
function layTopsOver(rng: Rng, sheet: CloudSheet, bodyPl: Placement[], n: number, uses: Uses, o: CloudOptions, why: Why, placedTops: Placement[] = []): Placement[] | null {
  const body = gridOf(bodyPl);
  const e = extent(bodyPl);
  const bodyTopAt = topsOf(body, e.x0 - 80, e.x1 + 80);
  const tops = sheet.parts.filter((p) => p.kind === 'top');
  const out: Placement[] = [];
  for (let k = 0; k < n; k++) {
    let done = false;
    for (let t = 0; t < 60 && !done; t++) {
      const v = pick(rng, both(tops).filter(uses.ok));
      if (!v) return why('tops: out of top pieces');
      const x = ri(rng, e.x0 - Math.floor(v.w / 3), e.x1 - Math.ceil((2 * v.w) / 3));
      if (crowded([...placedTops, ...out], v, x, o)) continue;
      const s = pickSpot(rng, topSpots(v, x, body, bodyTopAt, e.y0, e.y1), o.sink);
      if (!s) continue;
      uses.take(v);
      out.push({ p: s.p, x, y: s.y, layer: 0 });
      done = true;
    }
    if (!done) return why('tops: no spot for another top');
  }
  return out;
}

/** The bottom's open top: white pixels on its top row, which need something above them. */
function openTop(bottomPl: Placement[]): [number, number][] {
  const out: [number, number][] = [];
  for (const { p, x } of bottomPl) for (let i = 0; i < p.w; i++) if (p.px[i] === 2) out.push([x + i, 0]);
  return out;
}

/** Tops straight on a bottom: first they cover its open top, then any extras. */
function layTopsOnBottom(rng: Rng, sheet: CloudSheet, bottomPl: Placement[], n: number, uses: Uses, o: CloudOptions, why: Why): Placement[] | null {
  const body = gridOf(bottomPl);
  const e = extent(bottomPl);
  const bodyTopAt = topsOf(body, e.x0 - 80, e.x1 + 80);
  const tops = sheet.parts.filter((p) => p.kind === 'top');
  const open = openTop(bottomPl);
  const out: Placement[] = [];
  const over = new CloudGrid();
  for (let step = 0; step < 3; step++) {
    const left = open.filter(([x]) => !over.at(x, -1));
    if (!left.length) break;
    const c0 = left[0][0];
    const cands: { v: CloudPart; p: CloudPart; x: number; y: number; gain: number }[] = [];
    for (const v of both(tops).filter(uses.ok)) {
      for (let x = c0 - v.w + 1; x <= c0; x++) {
        if (crowded(out, v, x, o)) continue;
        for (const s of topSpots(v, x, body, bodyTopAt, 0, e.y1)) {
          const i = c0 - x, j = -1 - s.y;
          if (j < 0 || j >= s.p.h || !s.p.px[j * s.p.w + i]) continue;
          let gain = 0;
          for (const [ox] of left) { const ii = ox - x; if (ii >= 0 && ii < s.p.w && s.p.px[j * s.p.w + ii]) gain++; }
          cands.push({ v, x, ...s, gain });
        }
      }
    }
    if (!cands.length) return why("tops: nothing covers the bottom's open top");
    cands.sort((a, b) => b.gain - a.gain);
    const best = cands.filter((c) => c.gain >= cands[Math.floor(cands.length / 3)].gain);
    const c = (o.sink === 'random' ? pick(rng, best) : pickSpot(rng, best.sort((a, b) => a.y - b.y), o.sink))!;
    uses.take(c.v);
    const pl: Placement = { p: c.p, x: c.x, y: c.y, layer: 0 };
    out.push(pl);
    over.add(pl);
  }
  if (open.some(([x]) => !over.at(x, -1))) return why('tops: open top still showing after 3 tops');
  if (out.length > n) return why(`tops: needs ${out.length} tops to cover the bottom`);
  if (out.length < n) {
    const more = layTopsOver(rng, sheet, bottomPl, n - out.length, uses, o, why, out);
    if (!more) return null;
    out.push(...more);
  }
  return out;
}

// ------------------------------------------------------------ the cloud

export type Shape = 'full' | 'mb' | 'tb';
type Spread = 'random' | 'less' | 'more';
type Sink = 'random' | 'least' | 'most';
export interface CloudOptions {
  /** full, middle + bottom, top + bottom, or a mix (60 / 25 / 15) */
  shape: Shape | 'mix';
  /** a bottom set, or 0 for any */
  set: number;
  /** bottom middles, or 0 for 1-5 */
  nMid: number;
  /** tops, or 0 for 1-3 */
  nTop: number;
  sink: Sink;
  overlap: Spread;
  /** uses of one part per cloud, mirrored or not */
  limit: number;
  /** the same part side by side: allowed, not among the middle centres, or not in the bottom either */
  noTwins: 'off' | 'mid' | 'both';
  /** how far in from the ends of where they fit the middle caps may sit */
  capJitter: number;
  /** px of each middle cap's outer end the centres leave showing */
  capShow: number;
  /** px between the middles of any two top pieces */
  topSpread: number;
  tries: number;
}
/** The game's settings (the user's pick, 2026-11-26): everything random, no twin centres side by side. */
export const CLOUD_DEFAULTS: CloudOptions = {
  shape: 'mix', set: 0, nMid: 0, nTop: 0, sink: 'random', overlap: 'random',
  limit: 2, noTwins: 'mid', capJitter: 3, capShow: 4, topSpread: 8, tries: 300,
};

export interface Cloud {
  shape: Shape;
  set: number;
  placements: Placement[];
  ok: boolean;
  breaks: Break[];
  tries: number;
  seed: number;
  /** why the failed tries failed, and how often */
  reasons: Map<string, number>;
}

/** Build a cloud: the first of up to o.tries that keeps every rule, or the closest (ok false). */
export function assembleCloud(sheet: CloudSheet, seed: number, opts: Partial<CloudOptions> = {}): Cloud {
  const o = { ...CLOUD_DEFAULTS, ...opts };
  const rng = cloudRng(seed);
  const shape: Shape = o.shape !== 'mix' ? o.shape : (() => { const r = rng(); return r < 0.6 ? 'full' : r < 0.85 ? 'mb' : 'tb'; })();
  const reasons = new Map<string, number>();
  const why: Why = (r) => { reasons.set(r, (reasons.get(r) ?? 0) + 1); return null; };
  let best: Cloud | null = null;
  for (let t = 1; t <= o.tries; t++) {
    const uses = new Uses(o.limit);
    const set = o.set || ri(rng, 1, sheet.sets);
    const nMid = o.nMid || ri(rng, 1, 5);
    const nTop = o.nTop || ri(rng, 1, 3);
    const bottom = layBottom(rng, sheet, set, nMid, uses, shape !== 'tb', o.noTwins === 'both');
    if (!bottom) { why('bottom: out of pieces'); continue; }
    const pls = [...bottom];
    if (shape !== 'tb') {
      const mid = layMiddle(rng, sheet, bottom, uses, o, why);
      if (!mid) continue;
      pls.push(...mid);
    }
    if (shape !== 'mb') {
      const tops = shape === 'full' ? layTopsOver(rng, sheet, pls, nTop, uses, o, why) : layTopsOnBottom(rng, sheet, bottom, nTop, uses, o, why);
      if (!tops) continue;
      pls.push(...tops);
    }
    // the two draw orders within a layer: middle in front, or random
    const e = extent(pls);
    const mid = (e.x0 + e.x1) / 2;
    for (const pl of pls) {
      pl.zMid = -Math.abs(pl.x + pl.p.w / 2 - mid);
      pl.zRand = rng();
    }
    const cloud: Cloud = { shape, set, placements: pls, ok: false, breaks: [], tries: t, seed, reasons };
    cloud.breaks = checkCloud(cloud, 'mid');
    if (!cloud.breaks.length) return { ...cloud, ok: true };
    if (!best || cloud.breaks.length < best.breaks.length) best = cloud;
  }
  return best ?? { shape, set: 0, placements: [], ok: false, breaks: [], tries: o.tries, seed, reasons };
}

export type DrawOrder = 'mid' | 'rand';
/** Placements back to front. */
export function drawOrder(cloud: Cloud, z: DrawOrder): Placement[] {
  const key = z === 'rand' ? 'zRand' : 'zMid';
  return [...cloud.placements].sort((a, b) => a.layer - b.layer || (a[key] ?? 0) - (b[key] ?? 0));
}

export const CLOUD_RULES = {
  yellow: 'yellow edge not on the bottom',
  orange: 'orange edge showing',
  open: 'open top of the bottom showing',
  leak: 'top piece showing through the body',
  height: 'top piece less than 4px above the body',
} as const;
export interface Break { x: number; y: number; rule: keyof typeof CLOUD_RULES }

/** Every rule break, as pixels. */
export function checkCloud(cloud: Cloud, z: DrawOrder): Break[] {
  const order = drawOrder(cloud, z);
  const out: Break[] = [];
  if (!order.length) return out;
  const front = new CloudGrid();
  order.forEach((pl, i) => front.add(pl, i + 1));
  const bottom = gridOf(order.filter((pl) => pl.layer === 3 || pl.p.kind === 'combo'));
  const body = gridOf(order.filter((pl) => pl.layer > 0));
  const above = gridOf(order.filter((pl) => pl.layer < 3));
  const hasBottom = order.some((pl) => pl.layer === 3);
  const e = extent(order.filter((pl) => pl.layer > 0));
  const bodyTopAt = topsOf(body, e.x0 - 100, e.x1 + 100);
  order.forEach((pl, i) => {
    const { p, x, y } = pl;
    if (hasBottom && (pl.layer === 1 || pl.layer === 2)) for (const [a, b] of p.yellow) if (!bottom.at(x + a, y + b + 1)) out.push({ x: x + a, y: y + b, rule: 'yellow' });
    for (const [a, b] of p.conceal) if (front.at(x + a, y + b) === i + 1) out.push({ x: x + a, y: y + b, rule: 'orange' });
    if (pl.layer === 0) {
      for (let j = 0; j < p.h; j++) for (let k = 0; k < p.w; k++) {
        if (!p.px[j * p.w + k] || front.at(x + k, y + j) !== i + 1) continue;
        if (y + j >= bodyTopAt(x + k)) out.push({ x: x + k, y: y + j, rule: 'leak' });
      }
      if (y + p.topRow > e.y0 - 4) for (let k = 0; k < p.w; k++) if (p.px[p.topRow * p.w + k]) out.push({ x: x + k, y: y + p.topRow, rule: 'height' });
    }
  });
  for (const [x, y] of openTop(order.filter((pl) => pl.layer === 3))) if (!above.at(x, y - 1)) out.push({ x, y, rule: 'open' });
  return out;
}

/** The cloud's pixels: 0 clear, 1 ink, 2 paper; (x0, y0) is the top-left in cloud coordinates. */
export function paintCloud(cloud: Cloud, z: DrawOrder): { x0: number; y0: number; w: number; h: number; px: Uint8Array } {
  const order = drawOrder(cloud, z);
  if (!order.length) return { x0: 0, y0: 0, w: 1, h: 1, px: new Uint8Array(1) };
  const g = gridOf(order);
  const e = extent(order);
  const w = e.x1 - e.x0 + 1, h = e.y1 - e.y0 + 1;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = g.at(e.x0 + x, e.y0 + y);
  return { x0: e.x0, y0: e.y0, w, h, px };
}

/** "1L2 1m3 1m1′ 1R1 | ML1 MC2 MR2′ | T3": bottom | middle | tops, left to right; ′ mirrored, ✂n rows cut. */
export function describeCloud(cloud: Cloud): string {
  const names = (test: (pl: Placement) => boolean) =>
    cloud.placements.filter(test).sort((a, b) => a.x - b.x).map((pl) => pl.p.name + (pl.p.cropped ? `✂${pl.p.cropped}` : ''));
  const combo = (pl: Placement) => pl.p.kind === 'combo';
  return [names((pl) => pl.layer === 3 || combo(pl)), names((pl) => (pl.layer === 1 || pl.layer === 2) && !combo(pl)), names((pl) => pl.layer === 0)]
    .filter((l) => l.length)
    .map((l) => l.join(' '))
    .join(' | ');
}

/** The manifest's entry for a part (its edges; the pixels go in clouds.png). */
export function partInfo(p: CloudPart): CloudPartInfo {
  const info: CloudPartInfo = { name: p.name, kind: p.kind };
  if (p.set) info.set = p.set;
  if (p.side) info.side = p.side;
  if (p.band) info.band = p.band;
  if (p.edges && Object.keys(p.edges).length) info.edges = p.edges;
  return info;
}

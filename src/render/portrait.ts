import type { Grid } from './spriteData';

// Worker portraits: 64x64, built from parts the user draws in Photoshop
// (art-src/shots/portraits-working-file-.psd). Each part is drawn in the
// same 64x64 frame, so any body goes with any head, any hair, and so on.
// Parts are stacked in PORTRAIT_KINDS order, given a white outline that
// fades out in a dither, and set on one of the MacPaint background patterns.
// Everything is picked from the worker's look seed, so a face never changes;
// a child by birth takes most of their parts from their parents.

export const PORTRAIT_SIZE = 64;

/** Part kinds, bottom of the stack first. Kinds with no parts drawn yet are skipped. */
export const PORTRAIT_KINDS = ['body', 'head', 'beard', 'nose', 'eyes', 'eyebrows', 'mouth', 'hair', 'hat'] as const;
export type PortraitKind = (typeof PORTRAIT_KINDS)[number];

/** Kinds a portrait can go without: the rest always have one. */
const OPTIONAL: Partial<Record<PortraitKind, number>> = {
  /** About a third of faces have a beard (two of the first six drawn do). */
  beard: 0.35,
  /** Hats aren't drawn yet; when they are, about half wear one. */
  hat: 0.5,
};

/** The white outline: solid rings, then rings dithered to these densities (the user's pick: 1 px, then ½, ¼, ⅛). */
export const OUTLINE = { solid: 1, fade: [1 / 2, 1 / 4, 1 / 8] };

/** A child by birth takes each part from one of their parents this often. */
const INHERIT = 0.75;

export interface PortraitArt {
  /** Each kind's parts: full 64x64 grids, '1' ink, '0' paper, '.' see-through. */
  parts: Record<PortraitKind, Grid[]>;
  /** Background patterns, 8x8, '1' ink, '0' paper. */
  patterns: Grid[];
}

export function emptyPortraitArt(): PortraitArt {
  const parts = {} as Record<PortraitKind, Grid[]>;
  for (const k of PORTRAIT_KINDS) parts[k] = [];
  return { parts, patterns: [] };
}

/** Which part of each kind (-1: none) and which background. */
export interface PortraitRecipe {
  parts: Record<PortraitKind, number>;
  pattern: number;
}

/** A well-mixed 32-bit hash (integer maths only, so it's the same in every browser). */
function hash(a: number, b: number): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** A number in [0, 1) from a seed and a salt. */
const roll = (seed: number, salt: number) => hash(seed, salt) / 4294967296;

/** One worker's own picks, from their look alone. */
function ownRecipe(art: PortraitArt, look: number): PortraitRecipe {
  const parts = {} as Record<PortraitKind, number>;
  PORTRAIT_KINDS.forEach((k, i) => {
    const n = art.parts[k].length;
    const chance = OPTIONAL[k];
    if (n === 0 || (chance !== undefined && roll(look, 100 + i) >= chance)) parts[k] = -1;
    else parts[k] = Math.floor(roll(look, i) * n);
  });
  const pattern = art.patterns.length ? Math.floor(roll(look, 99) * art.patterns.length) : -1;
  return { parts, pattern };
}

/**
 * What a worker's portrait is made of. With parents' looks (a child by
 * birth), each part is most likely one of the parents', so families look
 * alike. The background is always their own.
 */
export function portraitRecipe(art: PortraitArt, look: number, parentLooks: readonly number[] = []): PortraitRecipe {
  const own = ownRecipe(art, look);
  if (parentLooks.length === 0) return own;
  const parents = parentLooks.map((p) => ownRecipe(art, p));
  PORTRAIT_KINDS.forEach((k, i) => {
    if (roll(look, 200 + i) >= INHERIT) return;
    const from = parents[Math.floor(roll(look, 300 + i) * parents.length)];
    own.parts[k] = from.parts[k];
  });
  return own;
}

// a 4x4 ordered (Bayer) dither: a pixel is paper when its threshold is under the density
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The portrait as a 64x64 grid of '1' ink and '0' paper. */
export function composePortrait(art: PortraitArt, recipe: PortraitRecipe): Grid {
  const S = PORTRAIT_SIZE;
  // the figure on its own: -1 see-through, 0 paper, 1 ink
  const fig = new Int8Array(S * S).fill(-1);
  for (const k of PORTRAIT_KINDS) {
    const i = recipe.parts[k];
    const g = i >= 0 ? art.parts[k][i] : undefined;
    if (!g) continue;
    for (let y = 0; y < S && y < g.length; y++) {
      const row = g[y];
      for (let x = 0; x < S && x < row.length; x++) {
        const ch = row[x];
        if (ch === '1') fig[y * S + x] = 1;
        else if (ch === '0') fig[y * S + x] = 0;
      }
    }
  }
  // the outline: grow the silhouette a ring at a time (up, down, left, right, so corners come out rounded)
  let solid = Uint8Array.from(fig, (v) => (v >= 0 ? 1 : 0));
  const ring = new Uint8Array(S * S);
  const rings = OUTLINE.solid + OUTLINE.fade.length;
  for (let r = 1; r <= rings; r++) {
    const next = solid.slice();
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        if (solid[i]) continue;
        if ((x > 0 && solid[i - 1]) || (x < S - 1 && solid[i + 1]) || (y > 0 && solid[i - S]) || (y < S - 1 && solid[i + S])) {
          next[i] = 1;
          ring[i] = r;
        }
      }
    }
    solid = next;
  }
  const pat = recipe.pattern >= 0 ? art.patterns[recipe.pattern] : undefined;
  const out: string[] = [];
  for (let y = 0; y < S; y++) {
    let line = '';
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (fig[i] >= 0) {
        line += fig[i] ? '1' : '0';
        continue;
      }
      const r = ring[i];
      const paper = r > 0 && (r <= OUTLINE.solid || BAYER[(y % 4) * 4 + (x % 4)] < OUTLINE.fade[r - OUTLINE.solid - 1] * 16);
      line += paper ? '0' : pat && pat[y % 8][x % 8] === '1' ? '1' : '0';
    }
    out.push(line);
  }
  return out;
}

/** Does the art have enough to draw a portrait at all? */
export function hasPortraitArt(art: PortraitArt): boolean {
  return art.parts.body.length > 0 && art.parts.head.length > 0;
}

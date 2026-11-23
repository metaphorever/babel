// 1-bit dither patterns. Every fill in the world is pure black ink on white
// paper; tones come from these patterns, the way classic Mac games did it.

export const INK = '#000000';
export const PAPER = '#ffffff';

/** 4x4 patterns as rows of bits (1 = ink). */
const DEFS: Record<string, number[][]> = {
  white: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  sparse: [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 0]], // 12.5%
  light: [[1, 0, 0, 0], [0, 0, 1, 0], [1, 0, 0, 0], [0, 0, 1, 0]], // 25%
  checker: [[1, 0, 1, 0], [0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 0, 1]], // 50%
  dark: [[1, 1, 1, 0], [1, 0, 1, 1], [1, 1, 1, 0], [1, 0, 1, 1]], // 75%
  black: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
  hstripe: [[1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  vstripe: [[1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]],
  diag: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
  brick: [[1, 1, 1, 1], [1, 0, 0, 0], [1, 1, 1, 1], [0, 0, 1, 0]],
};

export type PatternName = keyof typeof DEFS;

export class Patterns {
  private cache = new Map<string, CanvasPattern>();

  constructor(private ctx: CanvasRenderingContext2D) {
    for (const name of Object.keys(DEFS)) {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      const g = c.getContext('2d')!;
      g.fillStyle = PAPER;
      g.fillRect(0, 0, 4, 4);
      g.fillStyle = INK;
      DEFS[name].forEach((row, y) => row.forEach((bit, x) => bit && g.fillRect(x, y, 1, 1)));
      this.cache.set(name, ctx.createPattern(c, 'repeat')!);
    }
  }

  // Patterns follow the context transform, so drawing the world through a
  // camera translate keeps them anchored to the world (no shimmer on pan).

  get(name: PatternName): CanvasPattern {
    return this.cache.get(name)!;
  }

  private inkCache = new Map<string, CanvasPattern>();

  /** The pattern's ink only, with the paper left see-through (for overlays like the placement preview). */
  inkOnly(name: PatternName): CanvasPattern {
    let p = this.inkCache.get(name);
    if (!p) {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      const g = c.getContext('2d')!;
      g.fillStyle = INK;
      DEFS[name].forEach((row, y) => row.forEach((bit, x) => bit && g.fillRect(x, y, 1, 1)));
      p = this.ctx.createPattern(c, 'repeat')!;
      this.inkCache.set(name, p);
    }
    return p;
  }

  stipple(name: PatternName, x: number, y: number, w: number, h: number): void {
    this.ctx.fillStyle = this.inkOnly(name);
    this.ctx.fillRect(x, y, w, h);
  }

  fill(name: PatternName, x: number, y: number, w: number, h: number): void {
    this.ctx.fillStyle = this.get(name);
    this.ctx.fillRect(x, y, w, h);
  }
}

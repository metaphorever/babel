import type { Grid } from './spriteData';

// A tiny 1-bit drawing surface for building art as data (no browser needed).
// Pixels are clear, ink or paper; fills can use the same dither patterns the
// renderer uses.

export const CLEAR = 0;
export const INK = 1;
export const PAPER = 2;
export type Px = typeof CLEAR | typeof INK | typeof PAPER;

const PATTERNS: Record<string, number[][]> = {
  sparse: [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
  light: [[1, 0, 0, 0], [0, 0, 1, 0], [1, 0, 0, 0], [0, 0, 1, 0]],
  checker: [[1, 0, 1, 0], [0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 0, 1]],
  dark: [[1, 1, 1, 0], [1, 0, 1, 1], [1, 1, 1, 0], [1, 0, 1, 1]],
  hstripe: [[1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  vstripe: [[1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]],
  brick: [[1, 1, 1, 1], [1, 0, 0, 0], [1, 1, 1, 1], [0, 0, 1, 0]],
  diag: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
};
export type Fill = Px | keyof typeof PATTERNS;

export class Bitmap {
  readonly px: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint8Array(w * h);
  }

  set(x: number, y: number, v: Px): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = v;
  }

  get(x: number, y: number): Px {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return CLEAR;
    return this.px[y * this.w + x] as Px;
  }

  /** Fill a rectangle with a value, or with a dither pattern (ink and paper). */
  rect(x: number, y: number, w: number, h: number, fill: Fill = INK): this {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (typeof fill === 'number') this.set(xx, yy, fill);
        else this.set(xx, yy, PATTERNS[fill][yy & 3][xx & 3] ? INK : PAPER);
      }
    }
    return this;
  }

  /** A black outline with a filled inside. */
  box(x: number, y: number, w: number, h: number, inner: Fill = PAPER): this {
    this.rect(x, y, w, h, INK);
    if (w > 2 && h > 2) this.rect(x + 1, y + 1, w - 2, h - 2, inner);
    return this;
  }

  /** Draw grid rows ('1' ink, '0' paper, '.' leave alone) at (x, y). */
  stamp(x: number, y: number, rows: string[]): this {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        if (row[dx] === '1') this.set(x + dx, y + dy, INK);
        else if (row[dx] === '0') this.set(x + dx, y + dy, PAPER);
      }
    });
    return this;
  }

  toGrid(): Grid {
    const out: string[] = [];
    for (let y = 0; y < this.h; y++) {
      let row = '';
      for (let x = 0; x < this.w; x++) {
        const v = this.px[y * this.w + x];
        row += v === INK ? '1' : v === PAPER ? '0' : '.';
      }
      out.push(row);
    }
    return out;
  }
}

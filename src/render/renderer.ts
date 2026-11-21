import { MOOD, Tile, type SimState, type Site, type Worker } from '../sim';
import { INK, PAPER, Patterns, type PatternName } from './patterns';
import { glyphSprite, itemSprite, workerSprite } from './sprites';

export const TILE = 8; // native pixels per tile
export const ZOOMS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Draws the world at native resolution into a small buffer, then scales it
 * up by a whole number so pixels stay crisp. Zoom is in device pixels per
 * native pixel, which keeps pixels square on high-DPI screens too.
 */
export class Renderer {
  camX = 0;
  camY = 0;
  zoom = 3;
  showNames = false;

  private buffer = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;
  private pat: Patterns;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.g = this.buffer.getContext('2d')!;
    this.pat = new Patterns(this.g);
  }

  /** Canvas size in device pixels. */
  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const w = Math.floor(window.innerWidth * this.dpr);
    const h = Math.floor(window.innerHeight * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = `${window.innerWidth}px`;
      this.canvas.style.height = `${window.innerHeight}px`;
    }
  }

  get viewW(): number {
    return Math.ceil(this.canvas.width / this.zoom);
  }
  get viewH(): number {
    return Math.ceil(this.canvas.height / this.zoom);
  }

  /** CSS pixel position (e.g. from a mouse event) to world native pixels. */
  screenToWorld(cssX: number, cssY: number): { x: number; y: number } {
    return {
      x: Math.floor(this.camX) + (cssX * this.dpr) / this.zoom,
      y: Math.floor(this.camY) + (cssY * this.dpr) / this.zoom,
    };
  }

  /** Change zoom, keeping the world point under the cursor fixed. */
  zoomAt(dir: number, cssX: number, cssY: number): void {
    const i = ZOOMS.indexOf(this.zoom as (typeof ZOOMS)[number]);
    const ni = Math.max(0, Math.min(ZOOMS.length - 1, i + dir));
    if (ni === i) return;
    const before = this.screenToWorld(cssX, cssY);
    this.zoom = ZOOMS[ni];
    const after = this.screenToWorld(cssX, cssY);
    this.camX += before.x - after.x;
    this.camY += before.y - after.y;
  }

  clampCamera(s: SimState): void {
    const worldW = s.width * TILE;
    const worldH = s.height * TILE;
    const maxX = Math.max(0, worldW - this.viewW);
    const maxY = Math.max(0, worldH - this.viewH);
    this.camX = Math.max(-this.viewW / 2, Math.min(maxX + this.viewW / 2, this.camX));
    this.camY = Math.max(-this.viewH / 2, Math.min(maxY, this.camY));
  }

  centerOn(wx: number, wy: number): void {
    this.camX = wx - this.viewW / 2;
    this.camY = wy - this.viewH / 2;
  }

  // ------------------------------------------------------------------ draw

  render(s: SimState, alpha: number, selected: number | null, hover: number | null): void {
    this.resize();
    const bw = this.viewW;
    const bh = this.viewH;
    if (this.buffer.width !== bw || this.buffer.height !== bh) {
      this.buffer.width = bw;
      this.buffer.height = bh;
      this.pat = new Patterns(this.g);
    }
    const g = this.g;
    const cx = Math.floor(this.camX);
    const cy = Math.floor(this.camY);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, bw, bh);
    g.translate(-cx, -cy);

    this.drawTiles(s, cx, cy, bw, bh);
    for (const site of s.sites) this.drawSite(s, site);
    this.drawItems(s);
    for (const w of s.workers) this.drawWorker(s, w, alpha, w.id === selected);

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buffer, 0, 0, bw, bh, 0, 0, bw * this.zoom, bh * this.zoom);
    this.drawLabels(s, alpha, selected, hover);
  }

  private rect(x: number, y: number, w: number, h: number, p: PatternName = 'black'): void {
    this.pat.fill(p, x, y, w, h);
  }

  /** Black outline with a patterned inside. */
  private box(x: number, y: number, w: number, h: number, inner: PatternName = 'white'): void {
    this.rect(x, y, w, h, 'black');
    if (w > 2 && h > 2) this.rect(x + 1, y + 1, w - 2, h - 2, inner);
  }

  private drawTiles(s: SimState, cx: number, cy: number, bw: number, bh: number): void {
    const x0 = Math.max(0, Math.floor(cx / TILE));
    const x1 = Math.min(s.width - 1, Math.floor((cx + bw) / TILE));
    const y0 = Math.max(0, Math.floor(cy / TILE));
    const y1 = Math.min(s.height - 1, Math.floor((cy + bh) / TILE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.tiles[y * s.width + x];
        if (t === Tile.Air) continue;
        const px = x * TILE;
        const py = y * TILE;
        if (t === Tile.Dirt) {
          const above = y > 0 ? s.tiles[(y - 1) * s.width + x] : Tile.Air;
          let depth = 0;
          for (let k = 1; k <= 4 && y - k >= 0 && s.tiles[(y - k) * s.width + x] === Tile.Dirt; k++) depth = k;
          this.rect(px, py, TILE, TILE, depth >= 3 ? 'checker' : depth >= 1 ? 'light' : 'sparse');
          if (above !== Tile.Dirt) this.rect(px, py, TILE, 1);
        } else if (t === Tile.Deck) {
          this.rect(px, py, TILE, TILE, 'brick');
          this.rect(px, py, TILE, 1);
        } else if (t === Tile.Ladder) {
          this.rect(px + 1, py, 1, TILE);
          this.rect(px + 6, py, 1, TILE);
          this.rect(px + 1, py + 2, 6, 1);
          this.rect(px + 1, py + 6, 6, 1);
        }
      }
    }
  }

  private drawSite(s: SimState, site: Site): void {
    const left = site.x0 * TILE;
    const width = (site.x1 - site.x0 + 1) * TILE;
    const base = (site.y + 1) * TILE; // ground surface
    switch (site.kind) {
      case 'home': {
        this.rect(left + 12, base - 18, 2, 18);
        this.box(left + 2, base - 18, 20, 7, 'white');
        // arrow pointing left (the road home)
        this.rect(left + 5, base - 15, 13, 1);
        this.rect(left + 6, base - 16, 1, 3);
        this.rect(left + 7, base - 17, 1, 5);
        break;
      }
      case 'forest': {
        for (let x = left + 2; x < left + width - 8; x += 13) {
          const h = 22 + ((x * 7) % 9);
          this.tree(x, base, h);
        }
        break;
      }
      case 'field': {
        for (let x = left + 1; x < left + width - 1; x += 2) {
          const h = 5 + ((x * 3) % 3);
          this.rect(x, base - h, 1, h);
          if ((x >> 1) % 2 === 0) this.rect(x - 1, base - h - 1, 3, 2, 'checker');
        }
        break;
      }
      case 'well': {
        this.box(left + 1, base - 7, 14, 7, 'brick');
        this.rect(left + 2, base - 20, 1, 13);
        this.rect(left + 13, base - 20, 1, 13);
        this.rect(left, base - 22, 16, 2);
        this.rect(left + 7, base - 19, 1, 6);
        this.box(left + 5, base - 13, 5, 4, 'checker');
        break;
      }
      case 'kitchen': {
        this.building(left, width, base, 22);
        this.box(left + 4, base - 11, 12, 11, 'brick');
        this.rect(left + 7, base - 6, 6, 4);
        this.rect(left + 12, base - 30, 4, 9); // chimney
        // larder shelf
        this.rect(left + 20, base - 10, width - 24, 1);
        const n = Math.min(site.store.bread, 10);
        for (let i = 0; i < n; i++) this.g.drawImage(itemSprite('bread'), left + 20 + i * 5 - (i >= 5 ? 25 : 0), base - 13 - (i >= 5 ? 4 : 0));
        break;
      }
      case 'beds': {
        this.building(left, width, base, 20);
        for (let i = 0; i < 6; i++) {
          const bx = left + 3 + i * 9;
          this.box(bx, base - 4, 8, 3, 'checker');
          this.rect(bx, base - 6, 2, 2);
        }
        break;
      }
      case 'board': {
        this.rect(left + 2, base - 14, 1, 14);
        this.rect(left + 13, base - 14, 1, 14);
        this.box(left, base - 20, 16, 11, 'light');
        const n = Math.min(s.notices.length, 6);
        for (let i = 0; i < n; i++) {
          const nx = left + 2 + (i % 3) * 4;
          const ny = base - 18 + Math.floor(i / 3) * 4;
          this.box(nx, ny, 4, 4, 'white');
        }
        break;
      }
      case 'stockpile': {
        // dashed boundary on the ground
        for (let x = left; x < left + width; x += 2) this.rect(x, base - 1, 1, 1);
        const order = ['stone', 'wood', 'grain'] as const;
        const zone = Math.floor(width / 3);
        order.forEach((type, zi) => {
          const n = Math.min(site.store[type], 24);
          const spr = itemSprite(type);
          for (let i = 0; i < n; i++) {
            const col = i % 4;
            const row = Math.floor(i / 4);
            this.g.drawImage(spr, left + zi * zone + 2 + col * (spr.width + 1) + (row % 2) * 2, base - 4 - row * 3);
          }
        });
        break;
      }
      case 'foundation': {
        for (let x = left; x < left + width; x += 3) this.rect(x, base - 1, 2, 1);
        this.rect(left, base - 6, 1, 6);
        this.rect(left + width - 1, base - 6, 1, 6);
        this.rect(left, base - 6, 3, 1);
        this.rect(left + width - 3, base - 6, 3, 1);
        break;
      }
      case 'tavern': {
        this.building(left, width, base, 22);
        this.box(left + 8, base - 12, 7, 12, 'dark'); // door
        // hanging sign: a mug
        this.rect(left + width - 14, base - 27, 1, 4);
        this.box(left + width - 18, base - 23, 9, 8, 'white');
        this.box(left + width - 16, base - 21, 4, 5, 'checker');
        this.rect(left + width - 12, base - 20, 1, 2);
        break;
      }
      case 'quarry': {
        // a stepped rock face rising to the right
        for (let x = left; x < left + width + 8; x += 4) {
          const t = (x - left) / (width + 8);
          const h = Math.floor(6 + t * 40 + ((x * 13) % 7));
          this.rect(x, base - h, 4, h, 'dark');
          this.rect(x, base - h, 4, 1);
        }
        break;
      }
    }
  }

  private tree(x: number, base: number, h: number): void {
    this.rect(x + 4, base - h + 8, 2, h - 8);
    const widths = [3, 5, 7, 9, 9, 9, 7, 5, 3];
    const top = base - h;
    widths.forEach((w, i) => {
      const lx = x + 5 - Math.ceil(w / 2);
      const edge = i === 0 || i === widths.length - 1;
      this.rect(lx, top + i * 2, w, 2, edge ? 'black' : 'black');
      if (!edge) this.rect(lx + 1, top + i * 2, w - 2, 2, 'checker');
    });
  }

  private building(left: number, width: number, base: number, h: number): void {
    this.box(left, base - h, width, h, 'white');
    // pitched roof made of stepped rows
    for (let i = 0; i < 4; i++) this.rect(left - 2 + i * 2, base - h - 1 - i, width + 4 - i * 4, 1);
    this.rect(left - 2, base - h, width + 4, 1);
  }

  private drawItems(s: SimState): void {
    const stack = new Map<number, number>();
    for (const it of s.items) {
      const key = it.y * s.width + it.x;
      const n = stack.get(key) ?? 0;
      stack.set(key, n + 1);
      if (n >= 8) continue;
      const spr = itemSprite(it.type);
      this.g.drawImage(spr, it.x * TILE + 1 + (n % 2) * 3, (it.y + 1) * TILE - spr.height - Math.floor(n / 2) * 3);
    }
  }

  /** Interpolated feet position in native pixels. */
  workerPos(w: Worker, alpha: number): { x: number; y: number } {
    let fx = w.x;
    let fy = w.y;
    if (w.stepProgress > 0 && w.path.length > 0 && w.stepCost > 0) {
      const t = Math.min(1, (w.stepProgress + alpha) / w.stepCost);
      fx += (w.path[0].x - w.x) * t;
      fy += (w.path[0].y - w.y) * t;
    }
    return { x: Math.round(fx * TILE + TILE / 2), y: Math.round((fy + 1) * TILE) };
  }

  private drawWorker(s: SimState, w: Worker, alpha: number, selected: boolean): void {
    const g = this.g;
    const { x, y } = this.workerPos(w, alpha);
    const lying = w.activity.kind === 'sleep' && w.activity.stage >= 1;
    const moving = w.stepProgress > 0;
    const frame = moving ? (Math.floor(s.tick / 4) % 2) : 0;
    const spr = workerSprite(w.look, frame, w.facing, lying);
    const sx = x - Math.floor(spr.width / 2);
    const sy = y - spr.height;
    g.drawImage(spr, sx, sy);
    if (w.carrying && !lying) {
      const it = itemSprite(w.carrying);
      g.drawImage(it, x - Math.floor(it.width / 2), sy - it.height);
    }
    const glyph = this.statusGlyph(s, w, lying);
    if (glyph) {
      const gs = glyphSprite(glyph);
      g.drawImage(gs, x + 4, sy - gs.height - 2);
    }
    if (selected) {
      // a little pointer above the head
      const ty = sy - (w.carrying ? 10 : 6);
      this.rect(x - 2, ty - 3, 5, 1);
      this.rect(x - 1, ty - 2, 3, 1);
      this.rect(x, ty - 1, 1, 1);
    }
  }

  private statusGlyph(s: SimState, w: Worker, lying: boolean): string | null {
    if (lying) return 'z';
    for (const m of w.moodlets) {
      const age = s.tick - (m.until - (m.kind === 'missed' ? MOOD.missedJobTicks : MOOD.failedJob.ticks));
      if ((m.kind === 'missed' || m.kind === 'failed') && age < 160) return m.kind === 'missed' ? '!' : '?';
      if (m.kind === 'paid' && s.tick - (m.until - MOOD.gotPaid.ticks) < 60) return '$';
    }
    return null;
  }

  private drawLabels(s: SimState, alpha: number, selected: number | null, hover: number | null): void {
    const ctx = this.ctx;
    const z = this.zoom;
    const cx = Math.floor(this.camX);
    const cy = Math.floor(this.camY);
    const fontPx = Math.round(11 * this.dpr);
    ctx.font = `${fontPx}px Geneva, Verdana, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    const tag = (text: string, sx: number, sy: number, invert = false) => {
      const w = Math.ceil(ctx.measureText(text).width) + 6 * this.dpr;
      const h = fontPx + 4 * this.dpr;
      ctx.fillStyle = invert ? INK : PAPER;
      ctx.fillRect(Math.round(sx - w / 2), Math.round(sy), w, h);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, Math.round(this.dpr));
      ctx.strokeRect(Math.round(sx - w / 2) + 0.5, Math.round(sy) + 0.5, w - 1, h - 1);
      ctx.fillStyle = invert ? PAPER : INK;
      ctx.fillText(text, sx, sy + 2 * this.dpr);
    };
    for (const site of s.sites) {
      const mid = ((site.x0 + site.x1 + 1) / 2) * TILE;
      const ground = (site.y + 1) * TILE;
      tag(site.label, (mid - cx) * z, (ground - cy) * z + 6 * this.dpr);
    }
    for (const w of s.workers) {
      if (!(this.showNames || w.id === selected || w.id === hover)) continue;
      const p = this.workerPos(w, alpha);
      tag(w.name, (p.x - cx) * z, (p.y - cy) * z + 2 * this.dpr, w.id === selected);
    }
  }

  /** Topmost worker under a world point, if any. */
  workerAt(s: SimState, wx: number, wy: number): Worker | null {
    for (let i = s.workers.length - 1; i >= 0; i--) {
      const w = s.workers[i];
      const p = this.workerPos(w, 0);
      if (wx >= p.x - 6 && wx <= p.x + 6 && wy >= p.y - 16 && wy <= p.y + 1) return w;
    }
    return null;
  }

  siteAt(s: SimState, wx: number, wy: number): Site | null {
    for (const site of s.sites) {
      const left = site.x0 * TILE;
      const right = (site.x1 + 1) * TILE;
      const ground = (site.y + 1) * TILE;
      if (wx >= left && wx < right && wy >= ground - 32 && wy <= ground + 14) return site;
    }
    return null;
  }
}

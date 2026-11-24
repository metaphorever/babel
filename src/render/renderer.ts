import { CONFUSION, MOOD, TOWER, Tile, WORLD, darkness, hourOf, type Building, type SimState, type Site, type Worker } from '../sim';
import { activeProject, deckRow, projectFraction } from '../sim/tower';
import { worksFraction } from '../sim/build';
import { buildingLabel, groundRow } from '../sim/world';
import { INK, PAPER, Patterns, type PatternName } from './patterns';
import { itemSprite, propSprite, thoughtSprite, workerSprite, worldSprite } from './sprites';

/** Height in pixels of one story's walls (the deck above it makes up the rest of a floor). */
const STORY_PX = 24;
const ROOF_PX = 6;

/** Set pieces drawn whole from the world art. */
const NATURE_ART = { home: 'nature.sign-home', forest: 'nature.forest', field: 'nature.field', well: 'nature.well' } as const;
/** The notices pinned up in the job board's art (x, y, w, h), in the order they're posted. */
const BOARD_NOTICES: [number, number, number, number][] = [[2, 4, 6, 7], [9, 4, 6, 7], [2, 13, 6, 3], [9, 13, 6, 3]];
/** The supply wagon's bed in its art: where it starts, how wide, the row of its top rail, and the most items piled per good. */
const WAGON_BED = { x: 1, w: 32, rail: 11, most: 10 };
/** The gaps between each pair of columns in the scriptorium's art (rows from its top), where the writing queue stacks up. */
const SCRIPTORIUM_GAPS = [{ x: 6, top: 6, bottom: 27 }, { x: 37, top: 6, bottom: 27 }] as const;
const SCRIPTORIUM_GAP_W = 5;
/** What's on the pantry's shelves in its art, in the order it's eaten last to first. */
const PANTRY_LOAVES: [number, number, number, number][] = [[2, 4, 5, 3], [9, 4, 5, 3], [1, 9, 14, 3]];
/** How long the supply wagon takes to roll in at the start of a new game. */
const WAGON_ARRIVE_TICKS = 160;

/** The placement preview: where something would go, and which tiles are in the way. */
export interface Ghost {
  x0: number;
  x1: number;
  /** The row it stands on. */
  y: number;
  /** How tall to draw it, in pixels. */
  height: number;
  blocked: boolean[];
  ok: boolean;
}

/** What's under the cursor: a site (fixture, board...) or a building. */
export type Thing = { kind: 'site'; site: Site } | { kind: 'building'; building: Building };

/** How tall a building is drawn, roof included. */
export function buildingHeight(stories: number): number {
  return (stories - 1) * TOWER.floorHeight * 8 + STORY_PX + ROOF_PX;
}

export const TILE = 8; // native pixels per tile
export const ZOOMS = [1, 2, 3, 4, 5, 6] as const;
/** Scroll in steps of the dither pattern size, so patterns never shimmer. */
const SCROLL_STEP = 4;

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
  /** The placement preview, while placing something. */
  ghost: Ghost | null = null;
  /** A box drawn around whatever demolish mode is pointing at. */
  highlight: { x0: number; x1: number; y: number; height: number } | null = null;

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
      // exactly canvas pixels / dpr, so the browser never resamples the frame
      this.canvas.style.width = `${w / this.dpr}px`;
      this.canvas.style.height = `${h / this.dpr}px`;
    }
  }

  /**
   * The camera as drawn: snapped to whole dither tiles. A dither pattern
   * moved by one pixel turns into its own inverse, so a smooth one-pixel
   * pan makes patterns flicker to grey. Moving in steps of the pattern's
   * width (4 px) keeps every pattern in the same phase, the way classic
   * 1-bit games scrolled.
   */
  get viewX(): number {
    return Math.floor(this.camX / SCROLL_STEP) * SCROLL_STEP;
  }
  get viewY(): number {
    return Math.floor(this.camY / SCROLL_STEP) * SCROLL_STEP;
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
      x: this.viewX + (cssX * this.dpr) / this.zoom,
      y: this.viewY + (cssY * this.dpr) / this.zoom,
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
    // a hidden page has no size; drawing a zero-size canvas throws and would stop the loop
    if (bw <= 0 || bh <= 0) return;
    if (this.buffer.width !== bw || this.buffer.height !== bh) {
      this.buffer.width = bw;
      this.buffer.height = bh;
      this.pat = new Patterns(this.g);
    }
    const g = this.g;
    const cx = this.viewX;
    const cy = this.viewY;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, bw, bh);
    g.translate(-cx, -cy);

    this.drawSky(s, cx, cy, bw, bh);
    // buildings go behind the tiles, so a two-story building's deck and ladder show over its walls
    for (const b of s.buildings) this.drawBuilding(s, b);
    this.drawTiles(s, cx, cy, bw, bh);
    for (const site of s.sites) this.drawSite(s, site);
    this.drawItems(s);
    for (const w of s.workers) this.drawWorker(s, w, alpha, w.id === selected);
    if (this.ghost) this.drawGhost(this.ghost);
    if (this.highlight) this.drawHighlight(this.highlight);

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buffer, 0, 0, bw, bh, 0, 0, bw * this.zoom, bh * this.zoom);
    this.drawLabels(s, alpha, selected, hover);
  }

  private rect(x: number, y: number, w: number, h: number, p: PatternName = 'black'): void {
    this.pat.fill(p, x, y, w, h);
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
        let name: string;
        if (t === Tile.Dirt) {
          let depth = 0;
          for (let k = 1; k <= 3 && y - k >= 0 && s.tiles[(y - k) * s.width + x] === Tile.Dirt; k++) depth = k;
          name = depth === 0 ? 'terrain.dirt-top' : depth >= 3 ? 'terrain.dirt-deep' : 'terrain.dirt';
        } else if (t === Tile.Deck) name = s.tower && x >= s.tower.x0 && x <= s.tower.x1 ? 'tower.deck' : 'building.deck';
        else if (t === Tile.Wall) name = 'tower.wall';
        else name = 'tower.ladder';
        this.g.drawImage(worldSprite(name), px, py);
      }
    }
  }

  /** Draw only the bottom part of something (the part built so far). */
  private clipUp(left: number, base: number, width: number, height: number, frac: number, draw: () => void): void {
    const g = this.g;
    const h = Math.max(0, Math.min(height, Math.ceil(height * frac)));
    g.save();
    g.beginPath();
    g.rect(left, base - h, width, h);
    g.clip();
    draw();
    g.restore();
  }

  /** A dotted outline: something planned but not built yet. */
  private dotted(x: number, y: number, w: number, h: number): void {
    const g = this.g;
    g.fillStyle = INK;
    for (let i = 0; i < w; i += 2) {
      g.fillRect(x + i, y, 1, 1);
      g.fillRect(x + i, y + h - 1, 1, 1);
    }
    for (let i = 0; i < h; i += 2) {
      g.fillRect(x, y + i, 1, 1);
      g.fillRect(x + w - 1, y + i, 1, 1);
    }
  }

  /** Something under construction: a dotted outline of the whole, with the built part filled in from the bottom. */
  private underway(left: number, base: number, width: number, height: number, frac: number, draw: () => void): void {
    this.dotted(left, base - height, width, height);
    this.clipUp(left, base, width, height, frac, draw);
  }

  /** Marked for demolition: hatched over. */
  private comingDown(left: number, base: number, width: number, height: number): void {
    this.pat.stipple('diag', left, base - height, width, height);
  }

  /** A generic building from its tileable parts: walls (with a door and windows) story by story, and a roof. */
  private drawBuilding(_s: SimState, b: Building): void {
    const left = b.x0 * TILE;
    const n = b.x1 - b.x0 + 1;
    const base = (groundRow() + 1) * TILE;
    const height = buildingHeight(b.stories);
    const draw = () => {
      if (b.kind === 'shack') {
        const spr = worldSprite('nature.shack');
        this.g.drawImage(spr, left + Math.floor((n * TILE - spr.width) / 2), base - spr.height);
        return;
      }
      const floorPx = TOWER.floorHeight * TILE;
      for (let k = 0; k < b.stories; k++) {
        const y = base - k * floorPx - STORY_PX;
        for (let i = 0; i < n; i++) {
          const piece = i === 0 ? 'wall-left' : i === n - 1 ? 'wall-right' : k === 0 && i === 1 ? 'door' : i % 3 === 2 ? 'window' : 'wall';
          this.g.drawImage(worldSprite(`building.${piece}`), left + i * TILE, y);
        }
      }
      const roofY = base - height;
      for (let i = 0; i < n; i++) {
        const piece = i === 0 ? 'roof-left' : i === n - 1 ? 'roof-right' : 'roof';
        this.g.drawImage(worldSprite(`building.${piece}`), left + i * TILE, roofY);
      }
    };
    if (b.build) this.underway(left, base, n * TILE, height, worksFraction(b.build), draw);
    else draw();
    if (b.demolish) this.comingDown(left, base, n * TILE, height);
  }

  /** Fixture art, bottom-aligned on the row it stands on. */
  private fixtureArt(site: Site): string {
    if (site.kind === 'oven') return site.broken ? 'fixture.oven-broken' : 'fixture.oven';
    if (site.kind === 'brewery') return 'fixture.brew';
    return `fixture.${site.kind}`;
  }

  private drawSite(s: SimState, site: Site): void {
    const left = site.x0 * TILE;
    const width = (site.x1 - site.x0 + 1) * TILE;
    const base = (site.y + 1) * TILE; // the floor it stands on
    const building = site.build ? worksFraction(site.build) : null;
    const withProgress = (height: number, draw: () => void) => {
      if (building !== null) this.underway(left, base, width, height, building, draw);
      else draw();
      if (site.demolish) this.comingDown(left, base, width, height);
    };
    switch (site.kind) {
      case 'home':
      case 'forest':
      case 'field':
      case 'well': {
        // set pieces: drawn whole, standing on the ground at the site's left edge
        const spr = worldSprite(NATURE_ART[site.kind]);
        this.g.drawImage(spr, left, base - spr.height);
        break;
      }
      case 'board': {
        const spr = worldSprite('building.board');
        withProgress(spr.height, () => {
          this.g.drawImage(spr, left, base - spr.height);
          // the art has four notices pinned up: show as many as are posted
          const top = base - spr.height;
          for (let i = Math.min(s.notices.length, BOARD_NOTICES.length); i < BOARD_NOTICES.length; i++) {
            const [nx, ny, nw, nh] = BOARD_NOTICES[i];
            this.rect(left + nx, top + ny, nw, nh, 'white');
          }
        });
        break;
      }
      case 'stockpile': {
        if (site.supplies) {
          this.drawWagon(s, left, base);
          break;
        }
        withProgress(8, () => {
          this.g.drawImage(worldSprite('fixture.stockpile'), left, base - 4);
          this.drawGoods(site, left, base, width);
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
      case 'scriptorium': {
        const spr = worldSprite('building.scriptorium');
        withProgress(spr.height, () => {
          const top = base - spr.height;
          this.g.drawImage(spr, left, top);
          if (site.build) return;
          // the writing queue, stacked from the bottom up between each pair of columns:
          // orders on the left, blueprints on the right, two rows a sheet
          const orders = s.designs.filter((d) => d.carrier.kind !== 'blueprint').length;
          const plans = s.designs.length - orders;
          const stack = (gap: { x: number; bottom: number; top: number }, n: number) => {
            const fits = Math.floor((gap.bottom - gap.top + 1) / 2);
            for (let i = 0; i < Math.min(n, fits); i++) {
              const y = top + gap.bottom - 1 - i * 2;
              this.rect(left + gap.x, y, SCRIPTORIUM_GAP_W, 1);
              this.rect(left + gap.x, y + 1, 1, 1);
              this.rect(left + gap.x + SCRIPTORIUM_GAP_W - 1, y + 1, 1, 1);
            }
          };
          stack(SCRIPTORIUM_GAPS[0], orders);
          stack(SCRIPTORIUM_GAPS[1], plans);
        });
        break;
      }
      case 'pantry': {
        const spr = worldSprite('fixture.pantry');
        withProgress(spr.height, () => {
          this.g.drawImage(spr, left, base - spr.height);
          // the art shows four loaves: each stands for a quarter of a full pantry
          const top = base - spr.height;
          const per = Math.max(1, (site.capacity ?? 20) / PANTRY_LOAVES.length);
          PANTRY_LOAVES.forEach(([lx, ly, lw, lh], i) => {
            if (site.store.bread <= i * per) this.rect(left + lx, top + ly, lw, lh, 'white');
          });
        });
        break;
      }
      case 'bar': {
        const spr = worldSprite('fixture.bar');
        withProgress(spr.height, () => {
          this.g.drawImage(spr, left, base - spr.height);
          // a mug on the counter while there's beer to pour
          if (site.store.beer > 0) {
            const mug = itemSprite('beer');
            this.g.drawImage(mug, left + 8 - Math.floor(mug.width / 2), base - spr.height + 8 - mug.height);
          }
        });
        break;
      }
      case 'shelves': {
        const spr = worldSprite('fixture.shelves');
        withProgress(spr.height, () => {
          this.g.drawImage(spr, left, base - spr.height);
          // a shelf each, bottom to top: stone, wood, grain
          (['stone', 'wood', 'grain'] as const).forEach((type, i) => {
            const item = itemSprite(type);
            const n = Math.min(3, Math.ceil(site.store[type] / 6));
            for (let k = 0; k < n; k++) this.g.drawImage(item, left + 2 + k * 4, base - 1 - i * 5 - item.height);
          });
        });
        break;
      }
      case 'bed':
      case 'oven':
      case 'brewery': {
        const spr = worldSprite(this.fixtureArt(site));
        withProgress(spr.height, () => this.g.drawImage(spr, left, base - spr.height));
        break;
      }
      case 'quarry': {
        // a stepped rock face rising to the right, cut from the rock texture
        const rock = worldSprite('nature.rock');
        const g = this.g;
        const steps: [number, number][] = [];
        for (let x = left; x < left + width + 8; x += 4) {
          const t = (x - left) / (width + 8);
          steps.push([x, Math.floor(6 + t * 40 + ((x * 13) % 7))]);
        }
        const tallest = Math.max(...steps.map(([, h]) => h));
        g.save();
        g.beginPath();
        for (const [x, h] of steps) g.rect(x, base - h, 4, h);
        g.clip();
        // tile on the world grid, so the texture doesn't swim as the face steps up
        const tx0 = Math.floor(left / rock.width) * rock.width;
        const ty0 = Math.floor((base - tallest) / rock.height) * rock.height;
        for (let ty = ty0; ty < base; ty += rock.height) for (let tx = tx0; tx < left + width + 8; tx += rock.width) g.drawImage(rock, tx, ty);
        g.restore();
        for (const [x, h] of steps) this.rect(x, base - h, 4, 1);
        break;
      }
    }
  }

  /** Stone, wood and grain stacked in a stockpile, a column each. */
  private drawGoods(site: Site, left: number, base: number, width: number): void {
    const order = ['stone', 'wood', 'grain'] as const;
    const zone = Math.floor(width / 3);
    order.forEach((type, zi) => {
      const n = Math.min(site.store[type], 12);
      const spr = itemSprite(type);
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / 2);
        this.g.drawImage(spr, left + zi * zone + (i % 2) * 2, base - 4 - row * 3);
      }
    });
  }

  /** The placement preview: shaded, outlined, with an X on every tile that's in the way. */
  private drawGhost(gh: Ghost): void {
    const left = gh.x0 * TILE;
    const width = (gh.x1 - gh.x0 + 1) * TILE;
    const base = (gh.y + 1) * TILE;
    this.pat.stipple(gh.ok ? 'sparse' : 'light', left, base - gh.height, width, gh.height);
    this.g.fillStyle = INK;
    this.g.strokeStyle = INK;
    // the bounding box
    this.rect(left, base - gh.height, width, 1);
    this.rect(left, base - 1, width, 1);
    this.rect(left, base - gh.height, 1, gh.height);
    this.rect(left + width - 1, base - gh.height, 1, gh.height);
    gh.blocked.forEach((b, i) => {
      if (!b) return;
      const x = left + i * TILE;
      const y = base - TILE;
      this.rect(x, y, TILE, TILE, 'white');
      for (let k = 1; k < TILE - 1; k++) {
        this.rect(x + k, y + k, 1, 1);
        this.rect(x + TILE - 1 - k, y + k, 1, 1);
      }
    });
  }

  private drawHighlight(hl: { x0: number; x1: number; y: number; height: number }): void {
    const left = hl.x0 * TILE - 2;
    const width = (hl.x1 - hl.x0 + 1) * TILE + 4;
    const base = (hl.y + 1) * TILE + 2;
    this.dotted(left, base - hl.height - 4, width, hl.height + 4);
    this.dotted(left + 1, base - hl.height - 3, width - 2, hl.height + 2);
  }

  /**
   * The sky: it darkens through dusk into a dithered night with stars and a
   * moon, and lightens again at dawn. Only the open sky changes. The ground
   * strip and the column around the tower stay paper-white, so workers are
   * always readable.
   */
  private drawSky(s: SimState, cx: number, cy: number, bw: number, bh: number): void {
    const d = darkness(s.tick);
    const horizon = (WORLD.groundRow - 9) * TILE; // just above the rooftops and treetops (two-story buildings included)
    const towerL = s.tower ? s.tower.x0 * TILE : -1;
    const towerR = s.tower ? (s.tower.x1 + 1) * TILE : -1;
    const towerTop = s.tower ? (deckRow(s.floors) - TOWER.floorHeight) * TILE : Infinity; // the open story above the top floor
    const inSky = (x: number, y: number) => y < horizon && !(x >= towerL && x < towerR && y >= towerTop);
    const pattern: PatternName | null = d < 0.15 ? null : d < 0.4 ? 'sparse' : d < 0.6 ? 'light' : d < 0.85 ? 'checker' : 'dark';
    const skyBottom = Math.min(horizon, cy + bh);
    if (pattern && skyBottom > cy) {
      this.rect(cx, cy, bw, skyBottom - cy, pattern);
      // keep the tower's column clear
      if (towerTop < skyBottom) this.rect(towerL, Math.max(cy, towerTop), towerR - towerL, skyBottom - Math.max(cy, towerTop), 'white');
      // a soft edge at the horizon and along the tower column
      this.rect(cx, horizon - 2, bw, 2, 'sparse');
    }
    // stars, fixed in the sky
    if (d > 0.6) {
      this.g.fillStyle = PAPER;
      for (let i = 0; i < 260; i++) {
        const x = (i * 7919) % (s.width * TILE);
        const y = (i * 104729) % horizon;
        if (x < cx || x > cx + bw || y < cy || y > cy + bh || !inSky(x, y)) continue;
        this.g.fillRect(x, y, 1, 1);
        if (i % 11 === 0) {
          this.g.fillRect(x - 1, y, 3, 1);
          this.g.fillRect(x, y - 1, 1, 3);
        }
      }
    }
    // the sun by day, the moon by night, arcing across whatever part of the sky is in view
    const h = hourOf(s.tick);
    const up = d < 0.5 ? (h - 6) / 12 : ((h + 6) % 24) / 12; // 0..1 across its arc
    if (up >= 0 && up <= 1) {
      const bx = Math.round(cx + 30 + up * (bw - 60));
      const by = Math.round(cy + 26 + Math.abs(up - 0.5) * 2 * Math.min(60, bh / 4));
      if (inSky(bx, by + 8)) {
        const spr = worldSprite(d < 0.5 ? 'sky.sun' : 'sky.moon');
        this.g.drawImage(spr, bx - Math.floor(spr.width / 2), by - Math.floor(spr.height / 2));
      }
    }
    this.drawClouds(s, cy, bh);
  }

  /** Clouds drift in above the first few floors, so height reads at a glance. */
  private drawClouds(s: SimState, cy: number, bh: number): void {
    const groundPx = s.height * TILE;
    for (let i = 0; i < 18; i++) {
      const y = groundPx - 260 - ((i * 131) % (groundPx - 300));
      if (y < cy - 20 || y > cy + bh + 20) continue;
      const x = (i * 197 + Math.floor(s.tick / (40 + (i % 5) * 15))) % (s.width * TILE + 80) - 40;
      const w = 24 + ((i * 7) % 4) * 8;
      this.rect(x + 6, y, w - 12, 4, 'sparse');
      this.rect(x, y + 4, w, 5, 'light');
      this.rect(x, y + 9, w, 1);
    }
  }

  /**
   * The patron's supply wagon. In a new game it rolls in along the road home
   * over the first few seconds (a walk cycle: the horse's legs and the
   * wheels), then stands where the supplies are.
   */
  private drawWagon(s: SimState, left: number, base: number): void {
    let x = left;
    let frame = 0;
    if (s.start === 'opening' && s.tick < WAGON_ARRIVE_TICKS) {
      const spr = worldSprite('nature.wagon');
      const from = -spr.width;
      x = Math.round(from + ((left - from) * s.tick) / WAGON_ARRIVE_TICKS);
      frame = Math.floor(s.tick / 4) % 2;
    }
    const spr = worldSprite(frame ? 'nature.wagon-step' : 'nature.wagon');
    const top = base - spr.height;
    // what's left of the supplies, piled in the bed behind the driver: a column per good
    const supplies = s.sites.find((x) => x.supplies);
    if (supplies) {
      const goods = (['stone', 'wood', 'grain', 'bread'] as const).filter((t) => supplies.store[t] > 0);
      const col = Math.floor(WAGON_BED.w / 4);
      goods.forEach((type, ci) => {
        const item = itemSprite(type);
        const n = Math.min(WAGON_BED.most, Math.ceil(supplies.store[type] / 3));
        for (let i = 0; i < n; i++) {
          const y = top + WAGON_BED.rail - item.height - Math.floor(i / 2) * 3;
          this.g.drawImage(item, x + WAGON_BED.x + ci * col + (i % 2) * 3, y);
        }
      });
    }
    this.g.drawImage(spr, x, top);
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
    const ws = workerSprite(w.look, frame, w.facing, lying);
    const spr = ws.canvas;
    const sx = x - ws.anchorX;
    // standing frames have two clear rows above the head; things drawn "above the head" use sy
    const sy = y - spr.height + (lying ? 0 : 2);
    g.drawImage(spr, sx, y - spr.height);
    if (w.carrying && !lying) {
      const it = itemSprite(w.carrying);
      // an armload stacks up over their head
      for (let i = 0; i < Math.min(w.carryCount, 4); i++) g.drawImage(it, x - Math.floor(it.width / 2), sy - it.height * (i + 1));
    }
    if (!lying) {
      // a scroll in hand at the front, a courier's bag at the back
      if (w.held.length > 0) g.drawImage(propSprite('scroll'), x + (w.facing > 0 ? 3 : -6), y - 9);
      if (w.bag.length > 0) g.drawImage(propSprite('bag'), x + (w.facing > 0 ? -7 : 4), y - 8);
    }
    const glyph = this.statusGlyph(s, w, lying);
    if (glyph) {
      // the cloud's trail ends just above and right of the head
      const gs = thoughtSprite(glyph);
      g.drawImage(gs, x + 2, sy - gs.height + 1);
    }
    if (selected) {
      // a little pointer above the head
      const ty = sy - (w.carrying ? 4 + 3 * Math.min(w.carryCount, 4) : 0) - 6;
      this.rect(x - 2, ty - 3, 5, 1);
      this.rect(x - 1, ty - 2, 3, 1);
      this.rect(x, ty - 1, 1, 1);
    }
  }

  private statusGlyph(s: SimState, w: Worker, lying: boolean): string | null {
    if (lying) return 'z';
    if (w.leaving || w.noticeUntil !== null) return 'b';
    if (w.confusion > CONFUSION.moodAbove) return '?';
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
    const cx = this.viewX;
    const cy = this.viewY;
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
    const status = (works: { needs: { stone: number; wood: number }; placed: { stone: number; wood: number } } | null, down: unknown) =>
      down ? ' (coming down)' : works ? ` (planned, ${Math.floor(worksFraction(works as never) * 100)}%)` : '';
    for (const site of s.sites) {
      // fixtures inside a building are listed on the building's label
      if (site.buildingId !== null) continue;
      const mid = ((site.x0 + site.x1 + 1) / 2) * TILE;
      const ground = (site.y + 1) * TILE;
      // upper-floor stockpiles get a short label, tucked under their deck
      const text = site.level > 0 ? site.label : site.label + status(site.build, site.demolish);
      tag(text, (mid - cx) * z, (ground - cy) * z + 6 * this.dpr);
    }
    for (const b of s.buildings) {
      const mid = ((b.x0 + b.x1 + 1) / 2) * TILE;
      const ground = (groundRow() + 1) * TILE;
      tag(buildingLabel(s, b) + status(b.build, b.demolish), (mid - cx) * z, (ground - cy) * z + 6 * this.dpr);
    }
    if (s.tower) {
      // floor numbers down the right side of the tower, and the floor under way
      const right = ((s.tower.x1 + 1) * TILE + 3 - cx) * z;
      // a tag whose left edge sits at x
      const tagLeft = (text: string, x: number, y: number) => tag(text, x + (ctx.measureText(text).width + 6 * this.dpr) / 2, y);
      for (let k = 1; k <= s.floors; k++) {
        tagLeft(`${k}`, right, (deckRow(k) * TILE - cy) * z - 4 * this.dpr);
      }
      const p = activeProject(s);
      if (p) {
        tagLeft(`Floor ${p.level}: ${Math.floor(projectFraction(p) * 100)}%`, right, (deckRow(p.level) * TILE - cy) * z - 4 * this.dpr);
      }
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

  /** The fixture, site or building under a world point. Fixtures win over the building they're in. */
  thingAt(s: SimState, wx: number, wy: number): Thing | null {
    for (let i = s.sites.length - 1; i >= 0; i--) {
      const site = s.sites[i];
      const left = site.x0 * TILE;
      const right = (site.x1 + 1) * TILE;
      const floor = (site.y + 1) * TILE;
      const top = site.buildingId !== null ? floor - 18 : floor - 32;
      if (wx >= left && wx < right && wy >= top && wy <= floor + (site.buildingId !== null ? 0 : 14)) return { kind: 'site', site };
    }
    for (const b of s.buildings) {
      const ground = (groundRow() + 1) * TILE;
      if (wx >= b.x0 * TILE && wx < (b.x1 + 1) * TILE && wy >= ground - buildingHeight(b.stories) && wy <= ground + 14) return { kind: 'building', building: b };
    }
    return null;
  }

  /** The site under a world point, if any (the board, the scriptorium...). */
  siteAt(s: SimState, wx: number, wy: number): Site | null {
    const t = this.thingAt(s, wx, wy);
    return t?.kind === 'site' ? t.site : null;
  }

}

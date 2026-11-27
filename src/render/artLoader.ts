import { setArt, setCloudSheet, setNightSky, setPortraitArt, setWorldArt } from './sprites';
import { makePart, type CloudPartInfo } from './clouds';
import { emptyPortraitArt, PORTRAIT_KINDS, type PortraitKind } from './portrait';
import {
  CELL,
  GLYPH_NAMES,
  ITEM_NAMES,
  PROP_NAMES,
  SMALL_CELL,
  defaultArt,
  trim,
  type ArtSet,
  type Grid,
} from './spriteData';

// Loads PNG sprite sheets from public/art/ (served as art/ next to the
// page) and swaps them in for the built-in placeholder art. Any sheet that
// is missing or broken keeps its built-in art. See docs/SPRITES.md.
//
// Pixel rules: transparent = clear, pure red = anchor marker, dark = ink,
// light = paper. Anything in between is rounded to the nearest of those
// (and counted, so stray anti-aliasing shows up in the console).

interface SheetInfo {
  file: string;
  cell: [number, number];
  names?: string[];
}

interface Manifest {
  version: number;
  sheets: Record<'body' | 'head' | 'beard' | 'hat' | 'items' | 'props' | 'glyphs', SheetInfo>;
  atlases?: { world?: { file: string; sprites: Record<string, [number, number, number, number]> } };
  /** The night sky picture, as wide as the map. */
  nightSky?: string;
  /** Portrait parts (a row per kind, in kinds order) and the background patterns (8x8 grids). */
  portraits?: { file: string; cell: [number, number]; kinds: string[]; patterns: string[][] };
  /** Cloud parts: each a rectangle of the atlas, with what it is and its marked edges. */
  clouds?: { file: string; sets: number; parts: (CloudPartInfo & { rect: [number, number, number, number] })[] };
}

async function loadPixels(url: string): Promise<ImageData> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

/** Cut a sheet into cells: [row][column] grids. */
function cells(px: ImageData, cw: number, ch: number, stray: { n: number }): Grid[][] {
  const rows: Grid[][] = [];
  for (let cy = 0; cy + ch <= px.height; cy += ch) {
    const row: Grid[] = [];
    for (let cx = 0; cx + cw <= px.width; cx += cw) {
      const grid: string[] = [];
      for (let y = 0; y < ch; y++) {
        let line = '';
        for (let x = 0; x < cw; x++) {
          const i = ((cy + y) * px.width + (cx + x)) * 4;
          const [r, g, b, a] = [px.data[i], px.data[i + 1], px.data[i + 2], px.data[i + 3]];
          if (a < 128) {
            line += '.';
            if (a > 0) stray.n++;
            continue;
          }
          if (r > 200 && g < 80 && b < 80) {
            line += 'r';
            continue;
          }
          const lum = 0.3 * r + 0.59 * g + 0.11 * b;
          if (lum > 16 && lum < 240) stray.n++;
          line += lum < 128 ? '1' : '0';
        }
        grid.push(line);
      }
      row.push(grid);
    }
    rows.push(row);
  }
  return rows;
}

const isEmpty = (g: Grid) => g.every((r) => /^[.]*$/.test(r));

/** Fetch the manifest and every sheet; swap in whatever loaded. */
export async function loadArt(): Promise<void> {
  const bust = `?t=${Date.now()}`;
  let manifest: Manifest;
  try {
    const res = await fetch(`art/manifest.json${bust}`);
    if (!res.ok) return; // no sheets: keep the built-in art
    manifest = await res.json();
  } catch {
    return;
  }
  const art: ArtSet = defaultArt();
  const stray = { n: 0 };
  const loaded: string[] = [];
  const sheet = async (key: keyof Manifest['sheets']) => {
    const info = manifest.sheets[key];
    if (!info) return null;
    try {
      const px = await loadPixels(`art/${info.file}${bust}`);
      loaded.push(info.file);
      return { info, grid: cells(px, info.cell[0], info.cell[1], stray) };
    } catch (e) {
      console.warn(`Babel art: couldn't load ${info.file}; keeping the built-in art.`, e);
      return null;
    }
  };

  const body = await sheet('body');
  if (body) {
    // rows are variants, columns are walk frames; blank rows and cells are skipped
    const variants = body.grid.map((row) => row.filter((c) => !isEmpty(c))).filter((row) => row.length > 0);
    if (variants.length) art.body = variants;
  }
  for (const key of ['head', 'beard', 'hat'] as const) {
    const s = await sheet(key);
    if (!s) continue;
    // rows are variants; only the first column is used
    art[key] = s.grid.map((row) => row[0]).filter((c) => c && !isEmpty(c));
    if (key === 'head' && art.head.length === 0) art.head = defaultArt().head;
  }
  const small = async (key: 'items' | 'props' | 'glyphs', names: readonly string[]) => {
    const s = await sheet(key);
    if (!s) return;
    const flat = s.grid.flat();
    names.forEach((name, i) => {
      if (flat[i] && !isEmpty(flat[i])) art[key][name] = trim(flat[i]);
    });
  };
  await small('items', ITEM_NAMES);
  await small('props', PROP_NAMES);
  await small('glyphs', GLYPH_NAMES);

  setArt(art);

  // world art: one atlas, each sprite a rectangle in it
  const atlas = manifest.atlases?.world;
  if (atlas) {
    try {
      const px = await loadPixels(`art/${atlas.file}${bust}`);
      loaded.push(atlas.file);
      const world: Record<string, Grid> = {};
      for (const [name, [x, y, w, h]] of Object.entries(atlas.sprites)) {
        const sub = new ImageData(w, h);
        for (let r = 0; r < h; r++) sub.data.set(px.data.subarray(((y + r) * px.width + x) * 4, ((y + r) * px.width + x + w) * 4), r * w * 4);
        world[name] = cells(sub, w, h, stray)[0][0];
      }
      setWorldArt(world);
    } catch (e) {
      console.warn(`Babel art: couldn't load ${atlas.file}; keeping the built-in world art.`, e);
    }
  }
  if (manifest.nightSky) {
    try {
      const img = new Image();
      img.src = `art/${manifest.nightSky}${bust}`;
      await img.decode();
      setNightSky(img);
      loaded.push(manifest.nightSky);
    } catch (e) {
      console.warn(`Babel art: couldn't load ${manifest.nightSky}; keeping the built-in stars.`, e);
    }
  }
  if (manifest.portraits) {
    const info = manifest.portraits;
    try {
      const px = await loadPixels(`art/${info.file}${bust}`);
      loaded.push(info.file);
      const rows = cells(px, info.cell[0], info.cell[1], stray);
      const p = emptyPortraitArt();
      info.kinds.forEach((k, i) => {
        if ((PORTRAIT_KINDS as readonly string[]).includes(k)) p.parts[k as PortraitKind] = (rows[i] ?? []).filter((g) => !isEmpty(g));
      });
      p.patterns = info.patterns;
      setPortraitArt(p);
    } catch (e) {
      console.warn(`Babel art: couldn't load ${info.file}; no portraits.`, e);
    }
  }
  if (manifest.clouds) {
    const info = manifest.clouds;
    try {
      const px = await loadPixels(`art/${info.file}${bust}`);
      loaded.push(info.file);
      const parts = info.parts.map(({ rect: [x, y, w, h], ...part }) => {
        const pix = new Uint8Array(w * h);
        for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
          const i = ((y + r) * px.width + x + c) * 4;
          if (px.data[i + 3] < 128) continue;
          pix[r * w + c] = 0.3 * px.data[i] + 0.59 * px.data[i + 1] + 0.11 * px.data[i + 2] < 128 ? 1 : 2;
        }
        return makePart(part, w, h, pix);
      });
      setCloudSheet({ parts, sets: info.sets });
    } catch (e) {
      console.warn(`Babel art: couldn't load ${info.file}; keeping the built-in clouds.`, e);
    }
  }
  console.info(`Babel art: loaded ${loaded.join(', ')}.`);
  if (stray.n > 0) console.warn(`Babel art: ${stray.n} pixels weren't pure black, white or transparent and were rounded. Turn off anti-aliasing to keep them crisp.`);
}

/** Cell sizes, so the exporter and docs agree with the loader. */
export const SHEET_CELLS = { worker: CELL, small: SMALL_CELL };

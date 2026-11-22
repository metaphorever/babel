import { setArt } from './sprites';
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
  console.info(`Babel art: loaded ${loaded.join(', ')}.`);
  if (stray.n > 0) console.warn(`Babel art: ${stray.n} pixels weren't pure black, white or transparent and were rounded. Turn off anti-aliasing to keep them crisp.`);
}

/** Cell sizes, so the exporter and docs agree with the loader. */
export const SHEET_CELLS = { worker: CELL, small: SMALL_CELL };

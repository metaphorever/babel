import { describe, expect, it } from 'vitest';
import { parsePng, pngPixels } from '../tools/pngDecode';
import { assembleCloud, checkCloud, makePart, partInfo, readCloudSheet, type Cloud, type CloudSheet } from '../src/render/clouds';
import sheetUrl from '../art-src/shots/cloud-parts.png?inline';

// the parts sheet as the importer reads it (inflated here with DecompressionStream, not node:zlib)
const file = Uint8Array.from(atob(sheetUrl.slice(sheetUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));
const parts = parsePng(file);
const inflated = new Uint8Array(await new Response(new Blob([new Uint8Array(parts.data)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
const png = pngPixels(parts, inflated);
const { sheet, warnings } = readCloudSheet(png.rgba, png.w, png.h);
const count = (kind: string) => sheet.parts.filter((p) => p.kind === kind).length;
const clouds: Cloud[] = Array.from({ length: 120 }, (_, i) => assembleCloud(sheet, 1000 + i));

describe('clouds from parts', () => {
  it('reads every part off the sheet', () => {
    expect(warnings).toEqual([]);
    expect([count('top'), count('midCap'), count('midCenter'), count('botCap'), count('botMid'), count('combo')]).toEqual([4, 4, 4, 8, 10, 1]);
    expect(sheet.sets).toBe(2);
    const caps = sheet.parts.filter((p) => p.kind === 'midCap');
    expect(caps.filter((p) => p.side === 'L').map((p) => p.name)).toEqual(['ML1', 'ML2']);
    expect(caps.every((p) => p.conceal.length > 0 && p.yellow.length > 0)).toBe(true);
    const combo = sheet.parts.find((p) => p.kind === 'combo')!;
    expect([combo.set, combo.side, combo.band]).toEqual([2, 'R', 11]);
  });

  it('builds clouds that keep every rule, in all three shapes', () => {
    expect(clouds.every((c) => c.ok && checkCloud(c, 'mid').length === 0 && checkCloud(c, 'rand').length === 0)).toBe(true);
    expect(new Set(clouds.map((c) => c.shape))).toEqual(new Set(['full', 'mb', 'tb']));
    expect(clouds.some((c) => c.placements.some((pl) => pl.p.kind === 'combo'))).toBe(true);
  });

  it('uses a part at most twice, and never the same centre side by side', () => {
    for (const c of clouds) {
      const uses = new Map<string, number>();
      for (const pl of c.placements) uses.set(pl.p.base, (uses.get(pl.p.base) ?? 0) + 1);
      expect(Math.max(...uses.values())).toBeLessThanOrEqual(2);
      const centres = c.placements.filter((pl) => pl.layer === 2).sort((a, b) => a.x - b.x);
      centres.slice(1).forEach((pl, k) => expect(pl.p.base).not.toBe(centres[k].p.base));
    }
  });

  it('notices a broken cloud', () => {
    const c = clouds.find((x) => x.shape === 'full')!;
    const moved = { ...c, placements: c.placements.map((pl) => (pl.layer === 2 ? { ...pl, x: pl.x + 12 } : pl)) };
    expect(checkCloud(moved, 'mid').length).toBeGreaterThan(0);
  });

  it('survives the trip through the manifest', () => {
    const back: CloudSheet = { sets: sheet.sets, parts: sheet.parts.map((p) => makePart(partInfo(p), p.w, p.h, p.px)) };
    back.parts.forEach((p, i) => {
      expect(p.yellow).toEqual(sheet.parts[i].yellow);
      expect(p.conceal).toEqual(sheet.parts[i].conceal);
    });
    expect(assembleCloud(back, 77).placements.map((pl) => [pl.p.name, pl.x, pl.y])).toEqual(assembleCloud(sheet, 77).placements.map((pl) => [pl.p.name, pl.x, pl.y]));
  });
});

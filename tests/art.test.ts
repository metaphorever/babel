import { describe, expect, it } from 'vitest';
import { PAINT_W, buildPages, layoutPage, readPage, renderPage, slotsToArt } from '../tools/sheets';
import { composeWorker, defaultArt, trim } from '../src/render/spriteData';
import { allWorldArt } from '../src/render/worldArt';

describe('art sheets', () => {
  it('every page fits on a MacPaint page', () => {
    for (const p of buildPages()) expect(() => layoutPage(p)).not.toThrow();
  });

  it('art survives the round trip through a sheet', () => {
    const art = defaultArt();
    const slots = new Map<string, string[] | null>();
    for (const page of buildPages(art)) {
      for (const [k, v] of readPage(page, renderPage(page))) slots.set(k, v);
    }
    const back = slotsToArt(slots);
    // workers assemble identically (the neck is found without the red marker)
    for (let look = 0; look < 64; look++) {
      const l = Math.imul(look + 1, 2654435761) >>> 0;
      expect(composeWorker(back.art, l, 0)).toEqual(composeWorker(art, l, 0));
      expect(composeWorker(back.art, l, 1)).toEqual(composeWorker(art, l, 1));
    }
    expect(back.art.body.length).toBe(art.body.length); // spare rows are skipped
    expect(back.art.hat.length).toBe(art.hat.length);
    for (const n of Object.keys(art.items)) expect(trim(back.art.items[n])).toEqual(trim(art.items[n]));
    for (const n of Object.keys(art.glyphs)) expect(trim(back.art.glyphs[n])).toEqual(trim(art.glyphs[n]));
    for (const s of allWorldArt()) expect(back.world[s.name]).toEqual(s.grid);
  });

  it('drawing in a spare slot adds a variant', () => {
    const art = defaultArt();
    const pages = buildPages(art);
    const page = pages[0];
    // draw a solid hat in the first spare hat slot
    const spare = layoutPage(page).placed.find((p) => p.slot.key === `hat.${art.hat.length}`)!;
    const px = renderPage(page);
    for (let y = 0; y < 3; y++) for (let x = 5; x < 10; x++) px[(spare.my + y) * PAINT_W + spare.mx + x] = 1;
    const back = slotsToArt(readPage(page, px));
    expect(back.art.hat.length).toBe(art.hat.length + 1);
  });
});

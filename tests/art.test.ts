import { describe, expect, it } from 'vitest';
import { PAINT_H, PAINT_W, decodeMacPaint, encodeMacPaint, packBits, unpackBits, unwrapMacBinary, wrapMacBinary } from '../tools/macpaint';
import { buildPages, layoutPage, readPage, renderPage, slotsToArt } from '../tools/sheets';
import { composeWorker, defaultArt, trim } from '../src/render/spriteData';
import { allWorldArt } from '../src/render/worldArt';

describe('MacPaint files', () => {
  it('PackBits round-trips runs, literals and mixtures', () => {
    const cases = [
      new Uint8Array(72),
      new Uint8Array(72).fill(0xff),
      Uint8Array.from({ length: 72 }, (_, i) => (i * 37) & 0xff),
      Uint8Array.from({ length: 72 }, (_, i) => (i < 30 ? 0 : i < 31 ? 5 : (i * 7) & 0xff)),
    ];
    for (const c of cases) {
      const packed = packBits(c);
      expect(Array.from(unpackBits(packed, 0, c.length).bytes)).toEqual(Array.from(c));
    }
  });

  it('a page survives encoding and decoding exactly', () => {
    const px = new Uint8Array(PAINT_W * PAINT_H);
    for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761) % 7 === 0 ? 1 : 0;
    expect(Array.from(decodeMacPaint(encodeMacPaint(px)))).toEqual(Array.from(px));
  });

  it('MacBinary carries the MacPaint type and the data unchanged', () => {
    const data = encodeMacPaint(new Uint8Array(PAINT_W * PAINT_H));
    const bin = wrapMacBinary('Babel Workers', data);
    expect(String.fromCharCode(...bin.subarray(65, 73))).toBe('PNTGMPNT');
    expect(bin.length % 128).toBe(0);
    expect(Array.from(unwrapMacBinary(bin)!)).toEqual(Array.from(data));
    // and decoding accepts either form
    expect(decodeMacPaint(bin).length).toBe(PAINT_W * PAINT_H);
  });
});

describe('art sheets', () => {
  it('every page fits on a MacPaint page', () => {
    for (const p of buildPages()) expect(() => layoutPage(p)).not.toThrow();
  });

  it('art survives the full round trip through MacPaint files', () => {
    const art = defaultArt();
    const slots = new Map<string, string[] | null>();
    for (const page of buildPages(art)) {
      const bytes = encodeMacPaint(renderPage(page));
      for (const [k, v] of readPage(page, decodeMacPaint(bytes))) slots.set(k, v);
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

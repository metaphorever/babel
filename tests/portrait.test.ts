import { describe, expect, it } from 'vitest';
import { composePortrait, emptyPortraitArt, OUTLINE, portraitRecipe, PORTRAIT_KINDS, type PortraitArt } from '../src/render/portrait';
import { createState } from '../src/sim/sim';

/** A blank 64x64 part with a filled box in it. */
function box(x0: number, y0: number, w: number, h: number, ch = '1'): string[] {
  return Array.from({ length: 64 }, (_, y) => Array.from({ length: 64 }, (_, x) => (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h ? ch : '.')).join(''));
}

function testArt(): PortraitArt {
  const art = emptyPortraitArt();
  for (const k of PORTRAIT_KINDS) {
    if (k === 'hat') continue;
    art.parts[k] = [0, 1, 2, 3, 4, 5].map((i) => box(20 + i, 20, 4, 4));
  }
  art.parts.beard = [box(0, 0, 1, 1), box(1, 0, 1, 1)];
  art.patterns = [Array(8).fill('11111111'), Array(8).fill('10101010')];
  return art;
}

describe('portraits', () => {
  it('picks the same parts for the same look, and different ones across looks', () => {
    const art = testArt();
    const a = portraitRecipe(art, 12345);
    expect(portraitRecipe(art, 12345)).toEqual(a);
    const seen = new Set<string>();
    for (let look = 0; look < 200; look++) seen.add(JSON.stringify(portraitRecipe(art, look * 7919)));
    expect(seen.size).toBeGreaterThan(150);
  });

  it('every kind with parts gets one; beards are optional; no hat while none are drawn', () => {
    const art = testArt();
    let beards = 0;
    for (let look = 1; look <= 400; look++) {
      const r = portraitRecipe(art, look * 2654435761);
      for (const k of ['body', 'head', 'nose', 'eyes', 'eyebrows', 'mouth', 'hair'] as const) expect(r.parts[k]).toBeGreaterThanOrEqual(0);
      expect(r.parts.hat).toBe(-1);
      if (r.parts.beard >= 0) beards++;
    }
    // about a third
    expect(beards).toBeGreaterThan(90);
    expect(beards).toBeLessThan(190);
  });

  it('a child by birth mostly takes after their parents', () => {
    const art = testArt();
    let shared = 0;
    let total = 0;
    for (let i = 1; i <= 100; i++) {
      const ma = i * 1000003, pa = i * 7777777, child = i * 31337;
      const m = portraitRecipe(art, ma), p = portraitRecipe(art, pa), c = portraitRecipe(art, child, [ma, pa]);
      for (const k of ['body', 'head', 'nose', 'eyes', 'eyebrows', 'mouth', 'hair'] as const) {
        total++;
        if (c.parts[k] === m.parts[k] || c.parts[k] === p.parts[k]) shared++;
      }
    }
    expect(shared / total).toBeGreaterThan(0.7);
  });

  it('outlines the figure in white, then fades into the pattern', () => {
    const art = emptyPortraitArt();
    art.parts.body = [box(30, 30, 4, 4)];
    art.parts.head = [box(30, 30, 1, 1)];
    art.patterns = [Array(8).fill('11111111')];
    const g = composePortrait(art, { parts: { ...Object.fromEntries(PORTRAIT_KINDS.map((k) => [k, -1])), body: 0, head: 0 } as never, pattern: 0 });
    expect(g).toHaveLength(64);
    expect(g[31][31]).toBe('1'); // the figure
    expect(g[31][29]).toBe('0'); // the solid ring, right next to it
    expect(OUTLINE.solid).toBe(1);
    // the next ring is a checker: half paper, half pattern
    const ring2 = [g[31][28], g[32][28], g[33][28], g[30][28]];
    expect(ring2.filter((c) => c === '0').length).toBe(2);
    // well away from it, the solid black pattern
    expect(g[5][5]).toBe('1');
  });

  it('children by birth remember their parents’ looks', () => {
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const s = createState(seed);
      for (const t of s.social.ties) {
        if (t.kind !== 'parent' || !t.bio) continue;
        const child = s.workers.find((w) => w.id === t.b)!;
        const parent = s.workers.find((w) => w.id === t.a)!;
        expect(child.parentLooks).toContain(parent.look);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

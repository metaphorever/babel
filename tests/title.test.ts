import { describe, expect, it } from 'vitest';
import { step } from '../src/sim/sim';
import { activeProject, projectFraction } from '../src/sim/tower';
import { sitesOf } from '../src/sim/world';
import { FOREVER } from '../src/sim/lang';
import { TIME } from '../src/sim/tuning';
import { WELCOMES, keepBuilding, scrambled, showcaseState } from '../src/ui/showcase';

describe('§16.9 step 9: the title screen', () => {
  it('the showcase colony: a large camp, nine levels up, the tenth under way, and builders on it', () => {
    const s = showcaseState();
    expect(s.settings.start).toBe('large');
    expect(s.floors).toBe(9);
    const p = activeProject(s)!;
    expect(p.level).toBe(10);
    expect(projectFraction(p)).toBeGreaterThan(0);
    expect(s.notices.some((n) => n.order[0].t === 'BUILD' && n.order[1]?.t === 'TOWER' && n.remaining === FOREVER)).toBe(true);
    const before = projectFraction(p);
    for (let i = 0; i < TIME.dayTicks / 4; i++) step(s);
    // work on the tower shows within a few real minutes of watching
    expect(s.floors > 9 || projectFraction(activeProject(s)!) > before).toBe(true);
  });

  it('keeps going: nobody quits, nobody leaves, and the tower climbs a level at a time', () => {
    const s = showcaseState();
    const n = s.workers.length;
    for (let i = 0; i < TIME.dayTicks * 2; i++) {
      step(s);
      if (s.tick % 100 === 0) keepBuilding(s);
    }
    expect(s.workers.length).toBe(n);
    expect(s.workers.every((w) => w.noticeUntil === null && !w.leaving)).toBe(true);
    expect(s.floors).toBeGreaterThanOrEqual(10);
    // each finished level gets a ladder up onto it and the next one planned
    expect(sitesOf(s, 'ladder').length).toBe(s.floors);
    expect(activeProject(s)?.level).toBe(s.floors + 1);
  });

  it('is the same colony every time', () => {
    expect(JSON.stringify(showcaseState())).toBe(JSON.stringify(showcaseState()));
  });

  it('"Welcome" starts in the game’s own languages', () => {
    expect(WELCOMES.slice(0, 3)).toEqual(['Welcome', 'Bienvenue', 'Καλώς ήρθατε']);
  });

  it('the scramble starts from one word, ends on the next, and settles left to right', () => {
    let k = 0;
    const rand = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
    expect(scrambled('Welcome', 'Bienvenue', 0, rand)).toBe('Welcome');
    expect(scrambled('Welcome', 'Bienvenue', 1, rand)).toBe('Bienvenue');
    expect(scrambled('Bienvenue', 'Salvete', 1, rand)).toBe('Salvete');
    // midway: the start of the new word is in, the end still scrambling
    const mid = [...scrambled('Welcome', 'Καλώς ήρθατε', 0.6, rand)];
    expect(mid.slice(0, 4).join('')).toBe('Καλώ');
    expect(mid.length).toBe([...'Καλώς ήρθατε'].length);
  });
});

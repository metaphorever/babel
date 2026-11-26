import { Bitmap, CLEAR, INK, PAPER } from './bitmap';
import type { Grid } from './spriteData';

// Built-in art for everything that isn't a worker or a small sprite: terrain
// tiles, the natural features, the tower's parts, buildings and their pieces,
// fixtures and the sky. Where the game draws these in code today, these are
// close copies; the rest (generic building parts, fixtures for P1) are simple
// placeholders to draw over.
//
// These go onto the MacPaint working sheets. The game doesn't read them from
// sheets yet: wiring each one into the renderer comes with the P1 building
// work (see docs/HANDOFF.md).

export interface WorldSprite {
  name: string;
  label: string;
  grid: Grid;
}

function art(name: string, label: string, w: number, h: number, draw: (b: Bitmap) => void): WorldSprite {
  const b = new Bitmap(w, h);
  draw(b);
  return { name, label, grid: b.toGrid() };
}

/** Terrain and tower tiles, 8x8. */
export function terrainArt(): WorldSprite[] {
  return [
    art('terrain.dirt-top', 'DIRT TOP', 8, 8, (b) => b.rect(0, 0, 8, 8, 'sparse').rect(0, 0, 8, 1)),
    art('terrain.dirt', 'DIRT', 8, 8, (b) => b.rect(0, 0, 8, 8, 'light')),
    art('terrain.dirt-deep', 'DEEP DIRT', 8, 8, (b) => b.rect(0, 0, 8, 8, 'checker')),
    art('tower.deck', 'DECK', 8, 8, (b) => b.rect(0, 0, 8, 8, 'hstripe').rect(0, 0, 8, 2).rect(5, 2, 1, 6).rect(0, 7, 8, 1)),
    art('tower.wall', 'WALL', 8, 8, (b) => b.rect(0, 0, 8, 8, 'brick').rect(0, 0, 1, 8).rect(7, 0, 1, 8)),
    art('tower.ladder', 'LADDER', 8, 8, (b) => b.rect(1, 0, 1, 8).rect(6, 0, 1, 8).rect(1, 2, 6, 1).rect(1, 6, 6, 1)),
  ];
}

/** Natural features and things that are on the map from the start. */
export function natureArt(): WorldSprite[] {
  return [
    art('nature.tree', 'TREE', 16, 32, (b) => {
      b.rect(7, 12, 2, 20);
      const widths = [3, 5, 7, 9, 9, 9, 7, 5, 3];
      widths.forEach((w, i) => {
        const x = 8 - Math.ceil(w / 2);
        b.rect(x, 2 + i * 2, w, 2, INK);
        if (i > 0 && i < widths.length - 1) b.rect(x + 1, 2 + i * 2, w - 2, 2, 'checker');
      });
    }),
    art('nature.crop', 'CROP', 8, 8, (b) => {
      b.rect(1, 2, 1, 6).rect(5, 3, 1, 5).rect(0, 0, 3, 2, 'checker').rect(4, 1, 3, 2, 'checker');
    }),
    art('nature.rock', 'QUARRY ROCK', 16, 16, (b) => b.rect(0, 0, 16, 16, 'dark').rect(0, 0, 16, 1).rect(0, 0, 1, 16)),
    art('nature.well', 'WELL', 16, 24, (b) => {
      b.box(1, 17, 14, 7, 'brick').rect(2, 4, 1, 13).rect(13, 4, 1, 13).rect(0, 2, 16, 2).rect(7, 5, 1, 6).box(5, 11, 5, 4, 'checker');
    }),
    art('nature.shack', 'OLD SHACK', 32, 24, (b) => {
      b.box(1, 8, 30, 16, PAPER).rect(4, 14, 6, 10, 'dark');
      // a sagging roof with a hole in it
      for (let i = 0; i < 4; i++) b.rect(i * 2, 7 - i, 32 - i * 4, 1);
      b.rect(18, 4, 4, 2, CLEAR).rect(18, 8, 3, 1, CLEAR);
      b.rect(22, 12, 6, 5, 'diag').box(21, 11, 8, 7, CLEAR).box(21, 11, 8, 7, 'diag');
    }),
    art('nature.sign-home', 'ROAD HOME', 24, 24, (b) => {
      b.rect(11, 6, 2, 18).box(1, 6, 20, 7, PAPER).rect(4, 9, 13, 1).rect(5, 8, 1, 3).rect(6, 7, 1, 5);
    }),
    art('nature.wagon', 'SUPPLY WAGON', 32, 16, (b) => {
      b.box(2, 2, 26, 8, 'light').rect(28, 7, 4, 1);
      b.box(4, 0, 8, 4, 'checker').box(14, 0, 8, 4, 'brick');
      b.box(4, 10, 6, 6, PAPER).rect(6, 12, 2, 2).box(20, 10, 6, 6, PAPER).rect(22, 12, 2, 2);
    }),
  ];
}

/**
 * Generic buildings are built from tileable parts, one 8-pixel tile wide
 * and one story (24 px) tall, so they can be any width: left wall, middle
 * pieces (plain, door, window), right wall, and a roof row on top.
 */
export function buildingArt(): WorldSprite[] {
  const story = 24;
  return [
    art('building.wall-left', 'WALL LEFT', 8, story, (b) => b.rect(0, 0, 8, story, PAPER).rect(0, 0, 1, story).rect(0, 0, 8, 1)),
    art('building.wall', 'WALL', 8, story, (b) => b.rect(0, 0, 8, story, PAPER).rect(0, 0, 8, 1)),
    art('building.wall-right', 'WALL RIGHT', 8, story, (b) => b.rect(0, 0, 8, story, PAPER).rect(7, 0, 1, story).rect(0, 0, 8, 1)),
    art('building.door', 'DOOR', 8, story, (b) => b.rect(0, 0, 8, story, PAPER).rect(0, 0, 8, 1).box(1, 11, 6, 13, 'dark')),
    art('building.window', 'WINDOW', 8, story, (b) => b.rect(0, 0, 8, story, PAPER).rect(0, 0, 8, 1).box(1, 6, 6, 6, 'light').rect(4, 6, 1, 6)),
    art('building.roof-left', 'ROOF LEFT', 8, 6, (b) => {
      for (let i = 0; i < 4; i++) b.rect(i * 2, 4 - i, 8 - i * 2, 1);
      b.rect(0, 5, 8, 1);
    }),
    art('building.roof', 'ROOF', 8, 6, (b) => b.rect(0, 1, 8, 1).rect(0, 2, 8, 2, 'dark').rect(0, 5, 8, 1)),
    art('building.roof-right', 'ROOF RIGHT', 8, 6, (b) => {
      for (let i = 0; i < 4; i++) b.rect(0, 4 - i, 8 - i * 2, 1);
      b.rect(0, 5, 8, 1);
    }),
    art('building.scriptorium', 'SCRIPTORIUM', 48, 32, (b) => {
      b.box(0, 8, 48, 24, PAPER);
      for (let i = 0; i < 4; i++) b.rect(i * 2, 7 - i, 48 - i * 4, 1);
      b.rect(0, 8, 48, 1);
      // a writing desk with a slanted top, a stool, and a shelf of work
      b.rect(6, 23, 1, 9).rect(16, 23, 1, 9).rect(5, 22, 13, 1).rect(6, 21, 11, 1);
      b.rect(21, 27, 6, 1).rect(22, 28, 1, 4).rect(25, 28, 1, 4);
      b.rect(30, 18, 16, 1).stamp(31, 15, ['111', '101', '111']).stamp(35, 15, ['111', '101', '111']);
    }),
    art('building.board', 'JOB BOARD', 16, 24, (b) => {
      b.rect(2, 10, 1, 14).rect(13, 10, 1, 14).box(0, 4, 16, 11, 'light');
      b.box(2, 6, 4, 4, PAPER).box(6, 6, 4, 4, PAPER).box(10, 6, 4, 4, PAPER);
    }),
  ];
}

/** Fixtures that go inside buildings. Most are P1 placeholders. */
export function fixtureArt(): WorldSprite[] {
  return [
    art('fixture.bed', 'BED', 16, 6, (b) => b.box(0, 2, 14, 4, 'checker').rect(0, 0, 3, 3)),
    art('fixture.oven', 'OVEN', 16, 16, (b) => b.box(1, 2, 14, 14, 'brick').rect(4, 8, 8, 6).rect(10, 0, 3, 3)),
    art('fixture.oven-broken', 'BROKEN OVEN', 16, 16, (b) => {
      b.box(1, 5, 14, 11, 'brick').rect(4, 10, 8, 4);
      b.rect(6, 5, 1, 4, CLEAR).rect(7, 7, 1, 3, CLEAR).rect(1, 3, 4, 2, 'diag');
    }),
    art('fixture.pantry', 'PANTRY', 16, 16, (b) => {
      b.box(0, 0, 16, 16, PAPER).rect(1, 7, 14, 1).rect(1, 12, 14, 1);
      b.stamp(2, 4, ['.111.', '10001', '11111']).stamp(8, 4, ['.111.', '10001', '11111']).stamp(4, 9, ['.111.', '10001', '11111']);
    }),
    art('fixture.brew', 'BREWING STATION', 16, 16, (b) => {
      b.box(2, 3, 12, 13, 'vstripe').rect(1, 6, 14, 1).rect(1, 12, 14, 1).rect(6, 0, 4, 3, 'checker');
    }),
    art('fixture.bar', 'BAR', 16, 16, (b) => {
      b.box(0, 6, 16, 10, 'hstripe').rect(0, 6, 16, 2);
      b.box(3, 1, 4, 5, PAPER).rect(7, 2, 1, 2).box(10, 2, 4, 4, 'checker');
    }),
    art('fixture.table', 'TABLE', 16, 8, (b) => b.rect(0, 0, 16, 2).rect(2, 2, 1, 6).rect(13, 2, 1, 6)),
    art('fixture.stockpile', 'STOCKPILE', 16, 4, (b) => {
      for (let x = 0; x < 16; x += 2) b.rect(x, 3, 1, 1);
      b.rect(0, 0, 1, 4).rect(15, 0, 1, 4);
    }),
  ];
}

/**
 * Hauling equipment, Claude's stand-ins until the user draws them (their
 * boxes are on the Babel To Do page). Drawn facing right; the game piles the
 * load above the bed (rows WHEELBARROW_BED / CART_BED from the top).
 */
export function vehicleArt(): WorldSprite[] {
  const wheel = ['.111.', '1.1.1', '11111', '1.1.1', '.111.'];
  return [
    art('fixture.wheelbarrow', 'WHEELBARROW', 16, 16, (b) => {
      b.box(4, 7, 11, 4, PAPER).rect(0, 6, 5, 1).rect(5, 11, 1, 5);
      b.stamp(10, 11, wheel);
    }),
    art('fixture.cart', 'CART', 32, 16, (b) => {
      b.box(2, 5, 28, 5, 'light').rect(0, 7, 3, 1);
      b.stamp(5, 10, ['..111..', '.1.1.1.', '1..1..1', '1111111', '1..1..1', '.1.1.1.']).stamp(21, 10, ['..111..', '.1.1.1.', '1..1..1', '1111111', '1..1..1', '.1.1.1.']);
    }),
  ];
}

/**
 * Pieces added after the first art delivery. They go on their own page
 * (Babel Extras), so the boxes on the pages already drawn never move.
 */
export function extrasArt(): WorldSprite[] {
  return [
    art('fixture.shelves', 'STORAGE SHELVES', 16, 16, (b) => {
      // an open frame with three shelves; goods are drawn on them by the game
      b.rect(0, 0, 1, 16).rect(15, 0, 1, 16).rect(0, 0, 16, 1);
      b.rect(1, 5, 14, 1).rect(1, 10, 14, 1).rect(1, 15, 14, 1);
    }),
    // not in the game yet: a faster way up than the ladder (see DESIGN.md, the roadmap)
    art('fixture.stairs', 'STAIRS (ONE FLOOR)', 24, 32, (b) => {
      for (let i = 0; i < 8; i++) {
        const x = i * 3;
        const y = 32 - (i + 1) * 4;
        b.rect(x, y, 3, 1).rect(x, y, 1, 4);
      }
      for (let i = 0; i < 24; i++) b.set(i, Math.min(31, 31 - Math.floor((i * 4) / 3) + 3), INK);
    }),
  ];
}

export function skyArt(): WorldSprite[] {
  const disc = (b: Bitmap, cx: number, cy: number, r: number, inner: 'white' | 'cut') => {
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      b.rect(cx - half, cy + dy, half * 2 + 1, 1, inner === 'cut' ? CLEAR : INK);
      if (inner === 'white' && half > 0 && dy > -r && dy < r) b.rect(cx - half + 1, cy + dy, half * 2 - 1, 1, PAPER);
    }
  };
  return [
    art('sky.cloud', 'CLOUD', 32, 12, (b) => b.rect(6, 0, 20, 4, 'sparse').rect(0, 4, 32, 5, 'light').rect(0, 9, 32, 1)),
    art('sky.sun', 'SUN', 19, 19, (b) => {
      disc(b, 9, 9, 6, 'white');
      for (const [x, y] of [[9, 0], [9, 18], [0, 9], [18, 9], [2, 2], [16, 2], [2, 16], [16, 16]]) b.set(x, y, INK);
    }),
    art('sky.moon', 'MOON', 13, 13, (b) => {
      disc(b, 6, 6, 6, 'white');
      disc(b, 9, 5, 5, 'cut');
    }),
  ];
}

/**
 * Built-in stand-ins for art that arrives outside the MacPaint sheets (set
 * pieces and loose drawings, see tools/shots.ts). They're not on the sheets,
 * so adding one here doesn't move any box.
 */
export function extraWorldArt(): WorldSprite[] {
  const wagon = natureArt().find((s) => s.name === 'nature.wagon')!;
  return [
    art('nature.forest', 'FOREST', 96, 34, (b) => {
      for (let x = 2; x < 88; x += 13) {
        const h = 22 + ((x * 7) % 9);
        b.rect(x + 4, 34 - h + 8, 2, h - 8);
        [3, 5, 7, 9, 9, 9, 7, 5, 3].forEach((w, i) => b.rect(x + 5 - Math.ceil(w / 2), 34 - h + i * 2, w, 2, i === 0 || i === 8 ? INK : 'checker'));
      }
    }),
    art('nature.field', 'FIELD', 96, 8, (b) => {
      for (let x = 1; x < 95; x += 2) {
        const h = 5 + ((x * 3) % 3);
        b.rect(x, 8 - h, 1, h);
      }
    }),
    { name: 'nature.wagon-step', label: 'SUPPLY WAGON STEP', grid: wagon.grid },
  ];
}

export function allWorldArt(): WorldSprite[] {
  return [...terrainArt(), ...natureArt(), ...buildingArt(), ...fixtureArt(), ...skyArt(), ...extrasArt(), ...vehicleArt()];
}

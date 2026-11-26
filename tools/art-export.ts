// Writes the working sheets to art-src/ as PNGs, one per page, filled with
// the game's built-in art: the boxes to draw in. Draw over them in MacPaint
// (via a PNG converter), then screenshot the result into art-src/shots/.
//
//   npm run art:export                       (every page)
//   npm run art:export -- --page "Babel To Do"   (just that page)
//
// The layout is in tools/sheets.ts. See docs/SPRITES.md.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bitsToPng } from './png';
import { PAINT_H, PAINT_W, buildPages, renderPage } from './sheets';

const OUT = join(process.cwd(), 'art-src');
const only = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--page' ? [a] : []));
mkdirSync(OUT, { recursive: true });

for (const page of buildPages()) {
  if (only.length && !only.includes(page.name)) continue;
  writeFileSync(join(OUT, `${page.name}.png`), bitsToPng(renderPage(page), PAINT_W, PAINT_H));
  console.log(`  wrote    art-src/${page.name}.png`);
}

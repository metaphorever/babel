// Writes the MacPaint working sheets to art-src/ from the game's built-in
// art: for each page, a raw MacPaint document (.pntg), the same wrapped in
// MacBinary (.bin, which keeps the Mac file type so MacPaint recognizes it),
// and a PNG preview.
//
//   npm run art:export            (won't overwrite pages you've edited)
//   npm run art:export -- --force (start a page over from the built-in art)
//
// See docs/SPRITES.md.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAINT_H, PAINT_W, encodeMacPaint, wrapMacBinary } from './macpaint';
import { bitsToPng } from './png';
import { buildPages, renderPage } from './sheets';

const OUT = join(process.cwd(), 'art-src');
const force = process.argv.includes('--force');
// --page "Babel To Do": write just that page (over the old one), leaving every other page alone
const only = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--page' ? [a] : []));
mkdirSync(OUT, { recursive: true });
console.log(`MacPaint sheets in ${OUT}`);

for (const page of buildPages()) {
  if (only.length && !only.includes(page.name)) continue;
  const pntg = join(OUT, `${page.name}.pntg`);
  if (existsSync(pntg) && !force && !only.length) {
    console.log(`  kept     ${page.name} (already exists; --force to start it over)`);
    continue;
  }
  const bits = renderPage(page);
  const doc = encodeMacPaint(bits);
  writeFileSync(pntg, doc);
  writeFileSync(join(OUT, `${page.name}.bin`), wrapMacBinary(page.name, doc));
  writeFileSync(join(OUT, `${page.name}.preview.png`), bitsToPng(bits, PAINT_W, PAINT_H));
  console.log(`  wrote    ${page.name}.pntg, .bin, .preview.png`);
}

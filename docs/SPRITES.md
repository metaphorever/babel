# Drawing art for Babel

## How art actually arrives (decided 2026-11-22)

Moving MacPaint files in and out of the emulator turned out to be a pain, so **art comes in as PNG screenshots** of MacPaint, dropped into [`art-src/shots/`](../art-src/shots) and committed as the record of what was drawn. Claude cuts them up into the game's PNGs by hand for each delivery; there is deliberately no automatic screenshot importer.

- **Pixels must survive.** A screenshot at 1:1, or at a clean whole-number scale (2×, 3×), is fine: Claude scales it back down. A fractional scale (Windows display scaling at 125% or 150%, or a stretched emulator window) smears pixels and can't be undone cleanly.
- **Say what it is.** Keep the dotted frame labels in the shot when drawing on a sheet, or name the file after what it shows (`forest.png`, `cloud-parts.png`).
- **Masks are optional now.** Without a mask, white that touches the outside edge of the drawing is see-through and enclosed white is solid paper. Draw a mask box only when that guess would be wrong (a see-through gap inside a shape, or solid white that touches the edge).
- **Set pieces can be one big picture.** The forest, for example, may be a single large drawing rather than one tree repeated. (The forest never runs out of wood, so it doesn't need to show trees being cut down.)
- **Clouds are built from parts** (2026-11-26), the way workers are, so the sky varies. The parts are on their own sheet, `art-src/shots/cloud-parts.png`, which the user lays out themselves; `npm run art:import` reads it straight from the screenshot. `art-src/shots/cloud-reference.png` shows the look the parts aim for. How that sheet works:
  - **Pink is see-through.** Each part sits in a 1px box, and the box colour says what it is: green a **top** (back layer), red a **bottom middle** (front layer), plain blue a **bottom cap**, blue with a yellow bottom a **middle centre**, blue with yellow and an orange side a **middle cap**, blue with an orange side and no yellow a **combined bottom + middle end** (an end of a bottom set that is also that side's middle cap; it lines up with the set by its box bottom).
  - **Yellow** on a box side marks the part's pixels that must touch the bottom layer; **orange** marks pixels that must end up hidden behind a part in front. Bottom parts come in sets, one row of boxes each (option 1 above option 2), all the same height within a set.
  - **The rules** (the user's, with two added in the harness and kept: middle caps show at least 4px past the centres, tops sit at least 8px apart) are at the top of [`src/render/clouds.ts`](../src/render/clouds.ts). The game builds 18 clouds per game from its seed with `CLOUD_DEFAULTS`: every choice random, each part at most twice a cloud, never the same middle centre twice side by side.
  - **Tuning page:** `art-src/picker/clouds.html` (not committed; open it through the dev server) builds clouds with the game's own code, with every setting as a control, rule breaks in colour, times of day from day to night, and a file picker to try a redrawn sheet before importing it.
  - The sheet delivered on 2026-11-26 has about 700 grey pixels inside its parts (smoothing somewhere); they're rounded to black or white. A 1:1 copy would keep the dither exact.

### How a delivery is cut up (since 2026-11-23)

[`tools/shots.ts`](../tools/shots.ts) lists what's in each screenshot, and `npm run art:import` does the rest:
- **Sheet screenshots** (`workers-clover.png`, `world-clover-horse-ladder.png`, `clover-buildings-final.png`) are lined up against their sheet by the title text, then read box by box. A box the screenshot doesn't reach reads as "not drawn" and keeps the built-in art.
- **Loose pieces** (drawn outside any box, or set pieces in their own file) get a rectangle in the screenshot by hand, with their mask either a second drawing to the right or worked out (white touching the edge is see-through). Each delivery, Claude updates this list.
- The result is `public/art/world.png` (one atlas) and the manifest, which the game loads.

**What the first delivery taught (2026-11-23):**
- **Inside the boxes is best,** but anything else is fine if the commit says what it is. The new dirt top was drawn just right of its box; it was found by comparing every box with the old art.
- **The forest PNG had 19 grey pixels** (a smoothing step somewhere, or a scaled copy). They're rounded to black or white, which is harmless, but a straight 1:1 screenshot avoids it.
- **New boxes go on a new page, Babel Extras,** so the boxes on the pages already drawn never move. `art-src/Babel Extras.png` has storage shelves (blank, as asked; the game draws stone, wood and grain on planks at rows 5, 10 and 15), stairs (24×32, a placeholder for the roadmap) and a deck for two-story houses (a copy of the tower deck, to redraw if houses should look different). Screenshot it like the others, and add it to `SHEET_SHOTS` in `tools/shots.ts`. *(2026-11-26: Babel Extras was never drawn, so it's gone; its shelves and stairs are on Babel To Do.)*
- **Babel To Do (2026-11-26)** is the one sheet for everything still to draw: cloud parts (since drawn on their own sheet instead, see above, so those boxes can stay empty), shelves (16x32, two blocks tall; the box is the real `fixture.shelves`, so a drawing replaces the stand-in, and the rows the game puts stone, wood and grain on get set when it arrives), stairs, the tower-site marker, the Scriptorium's button icons, hauling equipment (the wheelbarrow and cart boxes also feed straight in), and flags and bells for DESIGN.md §16.7: poles and flag cloths in three sizes (the game fills a cloth's inside with its colour's hatching) and bells in three sizes, still and ringing. Only the shelves, wheelbarrow and cart reach the game from the sheet today; the rest gets wired in as each feature is built.
- **Answers from the user (2026-11-24):** the dirt top drawn beside its box is the new one (it just wasn't moved into place). The field's stubble-to-full-heads is variety, not growth stages: it stays static unless fields can run out one day. The quarry rock is a texture. The tower deck and wall were meant to be redrawn but didn't save; they'll come with the portrait sprint. The ladder is unchanged because there was nothing to change, and the house walls on purpose.

- **Second delivery (2026-11-24):** updated screenshots of the World and Buildings sheets replaced the old ones in `art-src/shots/`. Changed: the tower's wall, deck and ladder; the tops of the building wall, door and window; the roofs; the stockpile. The house deck is still a copy of the tower deck.
- **Third delivery (2026-11-25):** new screenshots `world-clover-horse-ladder.png` and `clover-buildings-final.png` (the older ones are kept as the record). From the user's notes:
  - **Every fixture is at least one block wide** (a block is 16 pixels, two tiles), and fixtures are measured in whole blocks from now on; ladders and shelves are two blocks tall. So **the ladder is 16x16 now**, drawn over its old 8x8 box (cut as a loose piece; the box wasn't moved, so nothing below it shifts). Ladders in the game are two tiles wide, tower and house alike, and each tile shows its quarter of the picture.
  - **The supply wagon has no driver** in the art. The game draws an ordinary worker there (the trader gets their own sprite later), standing 1 pixel below the bed's top rail with only what's above the rail drawn, so the cart hides their legs (`WAGON_DRIVER` in `renderer.ts`). The wagon's horse got a small fix.
  - **A free horse,** two walking frames (`nature.horse`, `nature.horse-step`), is in the atlas for later; nothing draws it yet. It's drawn where the old tree and crop boxes are, so those two keep their built-in art (the forest and field set pieces replaced them anyway).
  - A small fix to the stockpile, and a few pixels on the tower deck and the road sign.
- **The night sky** is `art-src/shots/milkyway-horizontaltile.png`: as wide as the map (1536 px), tiling sideways, with the user's own fade to white at the bottom. `npm run art:import` rounds it to black and white (`public/art/night-sky.png`). The game sets its bottom edge on the horizon, fills plain black above it, and dithers it in through four steps (a 4x4 Bayer pattern) as night deepens, showing it as drawn at full dark. The built-in stars are only drawn if the picture is missing.
- **Portraits come as a Photoshop file** (`art-src/shots/portraits-draft-test.psd`, a test, not final). Each **group** is one source face; each **layer** in it is named for its part (Body, Head, Beard, Nose, Eyes, Eyebrows, Mouth, Hair; hats will go on top), and the stack order in the file is the drawing order. Parts sit on a shared 64x64 frame, so they're interchangeable. The user draws from full-colour references and keeps layers and effects, so the file stays 8-bit RGB: anything not pure black or white, and any partly transparent pixel, is rounded at 50%. A stray pixel here and there is expected; more than that means something didn't merge down.
- **Portraits are in the game (2026-11-25),** from `art-src/shots/portraits-working-file-.psd`:
  - **The groups are only for the user's convenience.** `npm run art:import` (with [`tools/psd.ts`](../tools/psd.ts)) takes every layer named for a part, inside any group, as one variant of that part, and writes them to `public/art/portraits.png` (a row per kind, 64x64 cells). Layers outside groups (tracing references, the backdrop) and layers with other names are left out, with a note. Hats go in as a `Hat` layer inside a group, like the rest.
  - **Each worker's portrait** is picked from their look seed: one part of each kind, stacked body, head, beard, nose, eyes, eyebrows, mouth, hair, hat. About a third have a beard (and, once hats exist, about half a hat). **A child by birth** takes each part from one of their parents three times in four; the parents' looks are stored on the child, so the likeness survives a parent leaving. The code is [`src/render/portrait.ts`](../src/render/portrait.ts).
  - **Backgrounds** are MacPaint's patterns, from a screenshot of its palette (`art-src/shots/macpaint-patterns.png`: a 5x7 grid of boxes, each with a 1-pixel black border, the 8x8 pattern repeating inside). The user kept 30 of the 35; the dropped ones (2, 5, 10, 11, 12, which fight the outline's dither) are listed in `PORTRAIT_PATTERNS` in `tools/shots.ts`.
  - **The outline** (the user's pick from the preview): the figure's silhouette grown by a ring of solid white, then rings dithered to ½, ¼ and ⅛ (a 4x4 Bayer pattern), growing up, down, left and right only, so corners come out rounded. `OUTLINE` in `portrait.ts`.
  - **Adding parts changes who looks like what:** parts are picked by number, so a new part (or one taken away) reshuffles everyone's face. Fine while the art is in progress.

- **The Workers sheet (2026-11-26):** `art-src/shots/workers-clover.png`, a full-page screenshot, every box redrawn: 12 bodies (the 4 spare rows used), 4 heads, 4 beards, 6 hats, the items, props and thought symbols. Workers are about 13 pixels tall now: the head's top is row 3, and hats reach rows 0 to 2. The game used to assume 2 clear rows above every head; it now sits loads, thought clouds and the selection pointer on each worker's real top row (head or hat), so taller hats are fine. The thought symbols fill their 8x8 boxes, so the clouds are bigger than before (14x12).
  - **Five revisions followed the same day** (`workers-clover-2.png` to `-6.png`, the last is the one read), checked in a preview page (`art-src/picker/workers.html`, scratch, run with the dev server: every part labeled, a mixed crowd, workers walking, sleeping). Heads got necks and are 4 pixels wide; hats were re-centred on the neck column. The user called `-4` final for workers; `-5` and `-6` fixed edge pixels on B6 and B11.
  - **White that touches the edge is on purpose** for items and props: their masks are filled rectangles and the white corners are part of the pattern (the user, 2026-11-26). Don't flag them or clear them. B6 has a white top-left corner in both frames, also on purpose.
  - **Sleeping** (the user's call): face up. In a bed, the head goes on the pillow (the bed's left end) and the sleeper lies 1 pixel off the floor (`IN_BED` in `renderer.ts`). On the ground they lie where they dropped, head the way they faced.
- **No more `.bin` / `.pntg` files (2026-11-26):** the MacPaint round trip never worked through Infinite Mac, and the user was converting the preview PNGs anyway. The sheets are plain PNGs now (`npm run art:export` writes them), and the MacPaint file code is gone.

### Reference pictures to draw over

`npm run art:reference` writes these into `art-src/` (each also at 4x, as `…@4x.png`, for looking at on a modern screen):

| File | What it is |
|---|---|
| `forest-current.png` | The forest exactly as the game draws it now: 96x34, twelve tiles wide. Redraw it as one picture, the same width (height is up to you). |
| `portrait-template.png` | The worker portrait template: a 64x64 frame, head and shoulders, with the guide rows (top of head 14, eyes 28, mouth 37, chin 42, shoulders 50; rows 0 to 13 are room for hats and hair) and the middle between columns 31 and 32. Below it, a few example parts for each layer and some put together. |

**Portraits** are built from layers, drawn back to front: **body, hair (behind the head), head (with neck, ears and face), beard, hat.** Each part is drawn in its own 64x64 frame, lined up on the same guides. White touching the edge of a part is see-through; anything with a see-through hole in the middle, like a hood around the face, needs a mask. Draw as many variants of each layer as you like: each worker's look is picked from them.

The rest of this document describes the sheets: the reference for box sizes and layouts.

## The MacPaint sheets

The game's small art is laid out on **sheets**, one MacPaint-sized page (576x720) each, as PNGs in [`art-src/`](../art-src) (`Babel Workers.png` and so on). Draw on them in MacPaint (bring the PNG in with a converter), then screenshot the finished page into `art-src/shots/` (see "How art actually arrives" above).

| Page | What's on it |
|---|---|
| `Babel Workers` | Worker bodies (with a walking frame), heads, beards, hats; items; props; thought symbols |
| `Babel World` | Terrain and tower tiles, the tree, crops, quarry rock, well, old shack, road sign, supply wagon, sky (cloud, sun, moon) |
| `Babel Buildings` | Generic building parts (walls, door, window, roof), the scriptorium, the job board, fixtures (bed, oven, broken oven, pantry, brewing station, bar, table, stockpile) |

Each sheet comes from `npm run art:export`, filled with the game's built-in art (or empty boxes for things not drawn yet). `-- --page "Babel To Do"` writes just one.

## How a page works

MacPaint is black and white only, so sprites use the classic Mac trick of a **mask**. Every sprite has two boxes side by side, each with a dotted frame:

- **Left box: the sprite.** Black is ink, white is paper.
- **Right box: the mask.** Black means "this pixel is solid"; white means "see-through".

So a white pixel in the sprite is opaque white only if the mask is black there. Where the mask is white, the world shows through. A quick way to start a mask: copy the sprite into the right box and fill it solid black.

**Rules:**
- **Draw inside the boxes.** The dotted frames and labels are guides; they're ignored when the page is read back.
- **An empty mask means "not drawn":** a slot whose mask is all white counts as empty. Spare slots stay empty until you use them, and a variant you wipe disappears from the game.
- **New variants:** to add a body, head, beard or hat, draw in one of the spare slots. Each worker's look is picked from their personal seed, so new parts mix into the crowd automatically.

## Workers

Every worker part is drawn in the same **16×16 box**:
- The worker faces **right**. The game mirrors them to face left, and turns them onto their back when they lie down.
- **Bodies** have their **feet on the bottom row** and are **centered on column 7** (counting from 0 at the left). The second box in each body row is the walking step.
- **Heads** are drawn with the neck at **(7, 7)**: the face's bottom edge on row 7.
- **Beards and hats** are drawn over the head, in that same frame. Hats can use white (with a black mask) to cover parts of the head, for hoods and brims.
- **Where the head attaches:** the game finds each body's neck by itself. It's the pixel just above the body's topmost pixel in column 7, so a taller body automatically carries its head higher.

## Small sprites

Items, props and thought symbols are drawn in **8×8 boxes**, starting at the top-left. The empty space around them is trimmed. Thought symbols get a white cloud drawn around them automatically, so draw just the symbol.

## After drawing

1. Screenshot the whole page at 1:1 into `art-src/shots/`, and say which sheet it is.
2. Claude adds it to `SHEET_SHOTS` in `tools/shots.ts` and runs `npm run art:import`, which writes the game's PNGs and manifest into `public/art/`.
3. With the dev server running (`npm run dev`), reload the game to see it. Every push to `main` updates the live site.

## What the game uses so far

| Art | In the game? |
|---|---|
| Workers, items, props, thought symbols | Yes, the user's art (2026-11-26, the Workers sheet screenshot) |
| Buildings and fixtures | Yes, the user's art (first delivery, 2026-11-23): generic buildings assembled from the wall, door, window and roof parts (one 8-pixel tile each, so any width works), the scriptorium, the job board, the old shack and every fixture. Storage shelves are still a placeholder. |
| Terrain, nature, the tower's tiles, sun and moon | Yes, the user's art: dirt (top, middle, deep), the forest and field set pieces, the quarry's rock (a 16×16 texture tiled over the stepped rock face), the well, the road home sign, the supply wagon (two frames, rolling in at the start of a new game), the sun and the moon. The tower's deck, wall and ladder use their sheet boxes, which haven't been redrawn yet. Two-story houses have no deck art: their rooms stack straight on top of each other. |
| Things the game draws over the art | The job board shows only as many of its four drawn notices as are posted; the pantry hides its loaves as it empties (each is a third of a full pantry); the bar gets a mug on the counter while there's beer. The supply wagon carries what's left of the patron's supplies piled in its bed (stone, wood, grain, bread from the back; one item drawn per 3 units, up to 10 each; the bed is `WAGON_BED` in `renderer.ts`). Trade items will get their own art later, from the user. The scriptorium stacks its writing queue between each pair of columns, bottom up: orders on the left, blueprints on the right, two rows a sheet, 11 a side (the gaps are `SCRIPTORIUM_GAPS` in `renderer.ts`; if the columns move, change those). |
| Clouds | Yes, the user's cloud parts (2026-11-26), built into whole clouds at load (`cloudSprite` in `sprites.ts`). The flat code-drawn clouds only show if `clouds.png` fails to load. |

## Changing the layout

Box sizes and positions are set in [`tools/sheets.ts`](../tools/sheets.ts): sizes per slot, slots per row, and which page each sprite is on. To make something bigger, or to add a new kind of sprite, ask me to change the layout. Then export a fresh sheet and copy your drawings across. Moving boxes on a sheet the user has already drawn breaks reading their screenshot, so new boxes go on a new page.

# Drawing art for Babel

## How art actually arrives (decided 2026-11-22)

Moving MacPaint files in and out of the emulator turned out to be a pain, so **art comes in as PNG screenshots** of MacPaint, dropped into [`art-src/shots/`](../art-src/shots) and committed as the record of what was drawn. Claude cuts them up into the game's PNGs by hand for each delivery; there is deliberately no automatic screenshot importer.

- **Pixels must survive.** A screenshot at 1:1, or at a clean whole-number scale (2×, 3×), is fine: Claude scales it back down. A fractional scale (Windows display scaling at 125% or 150%, or a stretched emulator window) smears pixels and can't be undone cleanly.
- **Say what it is.** Keep the dotted frame labels in the shot when drawing on a sheet, or name the file after what it shows (`forest.png`, `cloud-parts.png`).
- **Masks are optional now.** Without a mask, white that touches the outside edge of the drawing is see-through and enclosed white is solid paper. Draw a mask box only when that guess would be wrong (a see-through gap inside a shape, or solid white that touches the edge).
- **Set pieces can be one big picture.** The forest, for example, may be a single large drawing rather than one tree repeated. (The forest never runs out of wood, so it doesn't need to show trees being cut down.)
- **Clouds will be built from parts,** the way workers are, so the sky varies. Not built yet.

### Reference pictures to draw over

`npm run art:reference` writes these into `art-src/` (each also at 4x, as `…@4x.png`, for looking at on a modern screen):

| File | What it is |
|---|---|
| `forest-current.png` | The forest exactly as the game draws it now: 96x34, twelve tiles wide. Redraw it as one picture, the same width (height is up to you). |
| `portrait-template.png` | The worker portrait template: a 64x64 frame, head and shoulders, with the guide rows (top of head 14, eyes 28, mouth 37, chin 42, shoulders 50; rows 0 to 13 are room for hats and hair) and the middle between columns 31 and 32. Below it, a few example parts for each layer and some put together. |

**Portraits** are built from layers, drawn back to front: **body, hair (behind the head), head (with neck, ears and face), beard, hat.** Each part is drawn in its own 64x64 frame, lined up on the same guides. White touching the edge of a part is see-through; anything with a see-through hole in the middle, like a hood around the face, needs a mask. Draw as many variants of each layer as you like: each worker's look is picked from them.

The rest of this document describes the MacPaint sheets and the `.bin`/`.pntg` round trip. They still work and remain the reference for box sizes and layouts, but they're no longer the main route.

## The MacPaint sheets

All of the game's art lives on three **MacPaint documents** in [`art-src/`](../art-src). Draw on them in MacPaint on a System 7 Mac (in the [Infinite Mac](https://infinitemac.org) emulator, or a real one), and a converter turns them into the PNGs the game uses. No Photoshop step is needed.

| Page | What's on it |
|---|---|
| `Babel Workers` | Worker bodies (with a walking frame), heads, beards, hats; items; props; thought symbols |
| `Babel World` | Terrain and tower tiles, the tree, crops, quarry rock, well, old shack, road sign, supply wagon, sky (cloud, sun, moon) |
| `Babel Buildings` | Generic building parts (walls, door, window, roof), the scriptorium, the job board, fixtures (bed, oven, broken oven, pantry, brewing station, bar, table, stockpile) |

Items now include **beer** (a mug), next to stone, wood, grain and bread. Pages exported before 2026-11-23 don't have a box for it; `npm run art:export -- --force` adds one (and starts the page over).

Each page comes in three files:

| File | What it's for |
|---|---|
| `.bin` | The page wrapped in MacBinary, which carries the Mac file type ("MacPaint document") along with it. Use this one to get pages into the emulator. |
| `.pntg` | The same page as a raw MacPaint file. |
| `.preview.png` | A picture of the page, so you can look at it on a modern computer. |

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
- The worker faces **right**. The game mirrors them to face left, and rotates them when they lie down.
- **Bodies** have their **feet on the bottom row** and are **centered on column 7** (counting from 0 at the left). The second box in each body row is the walking step.
- **Heads** are drawn with the neck at **(7, 7)**: the face's bottom edge on row 7.
- **Beards and hats** are drawn over the head, in that same frame. Hats can use white (with a black mask) to cover parts of the head, for hoods and brims.
- **Where the head attaches:** the game finds each body's neck by itself. It's the pixel just above the body's topmost pixel in column 7, so a taller body automatically carries its head higher.

## Small sprites

Items, props and thought symbols are drawn in **8×8 boxes**, starting at the top-left. The empty space around them is trimmed. Thought symbols get a white cloud drawn around them automatically, so draw just the symbol.

## The round trip

1. **Get a page into the emulator:** drag the `.bin` file onto the Infinite Mac window to upload it.
2. **Open it in MacPaint and draw.** Save it under the same name.
3. **Get it back out:** use the emulator's file transfer to download it, then put it in `art-src/` under the same name, ending in either `.bin` or `.pntg`. The importer uses whichever of the two is newer.
4. **Convert it:** run

   ```bash
   npm run art:import
   ```

   This writes the game's PNGs and manifest into `public/art/` and refreshes the preview pictures.
5. **Look:** with the dev server running (`npm run dev`), switch back to the game's window and the art reloads. Commit when you're happy; the live site updates on the next push.

**Still to test: the round trip through Infinite Mac.** Two things aren't verified yet:
- **Getting in:** that Infinite Mac turns the uploaded `.bin` into a proper MacPaint document. If MacPaint's Open dialog doesn't list the page, try the `.pntg` file, or set its type to `PNTG` with ResEdit.
- **Getting out:** exactly how Infinite Mac hands files back. The importer accepts either a MacBinary file or a raw MacPaint file, so whichever comes out should work.

Do the first round trip with a small change before drawing a lot.

To regenerate pages from the game's built-in art:

```bash
npm run art:export
```

It won't overwrite a page that already exists. Add `-- --force` to start a page over (that throws away what's on it).

## What the game uses so far

| Art | In the game? |
|---|---|
| Workers, items, props, thought symbols | Yes, now |
| Buildings and fixtures | Yes, from the built-in world art: generic buildings are assembled from the wall, door, window and roof parts (one 8-pixel tile each, so any width works), plus the scriptorium, the old shack, the supply wagon and every fixture. Two-story buildings stack two stories of wall with the deck between. New art for these replaces the built-in grids. |
| Terrain, nature, the tower and the sky | Not yet: still drawn in code. |

## Changing the layout

Box sizes and positions are set in [`tools/sheets.ts`](../tools/sheets.ts): sizes per slot, slots per row, and which page each sprite is on. To make something bigger, or to add a new kind of sprite, ask me to change the layout. Then export a fresh page and copy your drawings across in MacPaint.

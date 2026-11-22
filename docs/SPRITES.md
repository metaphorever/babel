# Drawing sprites for Babel

The game's sprites live in plain PNG sheets in [`public/art/`](../public/art). Edit them in Photoshop (or any pixel editor) at 1× and the game picks them up. If a sheet is missing, the game uses its built-in placeholder art for that part.

## The workflow

1. Start the dev server (`npm run dev`) and open the game.
2. Open a sheet from `public/art/` in Photoshop, draw, and save it over itself as a PNG.
3. Switch back to the browser window. While the dev server is running, the game reloads the sheets whenever the window comes back into focus, so you see your change right away. A normal refresh works too.
4. When you're happy, commit the PNGs (or tell me and I will). The live site picks them up on the next deploy.

To get fresh templates of the current art, run:

```bash
npm run art:export
```

This won't overwrite sheets you've already changed. Add `-- --force` if you really want to start over.

## Colors

Only four colors mean anything:

| Color | Meaning |
|---|---|
| Black `#000000` | Ink |
| White `#FFFFFF` | Paper (an opaque white that covers whatever is behind it) |
| Transparent | Clear (the world shows through) |
| Pure red `#FF0000` | An anchor marker (see the bodies section). It's drawn as clear. |

Anything else gets rounded to the nearest of those, and the browser console counts the rounded pixels, so stray anti-aliasing shows up. In Photoshop: use the Pencil tool rather than the Brush, set resampling to Nearest Neighbor when scaling, and save as PNG with transparency. Working in Image > Mode > Indexed Color with a 4-color palette keeps you honest, but RGB is fine too.

Draw at 1×. The game scales everything up by whole numbers, so one pixel in the sheet is one big square on screen. Zoom Photoshop in to 800% or more to work.

## Workers: layered parts

Every worker is assembled from parts, so each one looks a little different. Every part is drawn in the same **16×16 frame**:

- The worker faces **right**. The game mirrors them to face left.
- Their **feet sit on the bottom row** (row 15).
- The body is **centered on column 7**, counting from 0.
- Lying down (sleeping) is the standing sprite rotated, so you don't draw it.

| Sheet | Layout | Notes |
|---|---|---|
| `workers-body.png` | Rows are body variants; columns are walk frames (2: standing/step A, step B) | The robe, arms and feet. Put **one red pixel at the neck**, where the head attaches. |
| `workers-head.png` | Rows are head variants (only the first column is read) | The face, drawn with the neck at (7, 7). |
| `workers-beard.png` | Rows are beard variants | Drawn on top of the head. About half of workers get one. |
| `workers-hat.png` | Rows are hat variants | Drawn on top of the head and beard. White pixels cover the head, for hoods and brims. About three in four workers wear one. |

How the layers fit together:
- **The neck marker** lets bodies of different heights or shapes work. Whatever you draw in the head, beard and hat sheets is drawn for a neck at (7, 7), then moved so it sits on that body's red pixel. A tall body puts its marker one row higher, and every head moves up with it.
- **Variety:** add a row to any sheet and you've added a variant. The game counts rows from the image height, and blank rows are skipped. Each worker's look is fixed for life, chosen from their personal seed.
- **Reference sheet:** `workers-preview.png` shows 32 assembled workers. It's for reference only: the game doesn't read it, and `npm run art:export` regenerates it.

## Small sprites

These are drawn in **8×8 cells**, one row, in a fixed order. Draw from the top-left of each cell. Empty space around the drawing is trimmed when the game loads it.

| Sheet | Cells, left to right |
|---|---|
| `items.png` | stone, wood, grain, bread |
| `props.png` | scroll (held at the side), bag (a courier's satchel), sheet (paper on the scriptorium desk) |
| `glyphs.png` | z (asleep), ! (went unpaid), ? (confused or gave up), $ (just paid), b (a bundle on a stick: giving notice) |

Glyphs are drawn inside a white thought cloud automatically, so draw just the symbol.

## Not on sheets yet

Buildings, terrain, the tower's walls, decks and ladders, trees and the sky are still drawn in code. They're next in line for sheets once the worker parts are settled. Tell me which you want first.

## The manifest

`public/art/manifest.json` tells the game which file holds which part and how big the cells are. You shouldn't need to touch it.

# Babel (working title)

A side-view colony sim about building the Tower of Babel. You can only act by writing work orders, and the higher your workers climb, the more their languages drift.

Runs in the browser. Hobby project.

- Design: [docs/DESIGN.md](docs/DESIGN.md)
- Where things stand and what's next: [docs/HANDOFF.md](docs/HANDOFF.md)
- Status: P0 is playable. Most of P1 is in: the random map, the opening, placing buildings and fixtures, demolishing, the grace period, and draft tutorials.
- Live: https://metaphorever.github.io/babel/

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Add `?seed=123` to the URL to replay a particular starting world. The seed for each run is printed in the browser console.

```bash
npm test
```

runs the simulation tests, including the check that the same seed and the same commands always produce the same game.


## Putting it online

```bash
npm run build
```

The live build is at https://metaphorever.github.io/babel/. Every push to `main` runs the tests and redeploys it (see `.github/workflows/pages.yml`).

To build it yourself, the command above writes a static site to `dist/`: an `index.html` plus an `assets/` folder. Every path in it is relative, so you can upload the contents of `dist/` to any folder on any web host and open `index.html` there. Options in the URL:

- `?seed=123` replays a particular starting world.
- `?difficulty=easy|normal|hard` sets how fast the patron loses patience.
- `?start=prebuilt` skips the opening with a colony already laid out (a kitchen, a bunkhouse, the scriptorium, the tower site, a tavern), for playtesting later stages.


## Drawing art

Art is drawn in MacPaint (in the Infinite Mac emulator) and arrives as PNG screenshots in `art-src/shots/`, which get cut up into the game's PNGs in `public/art/`. The MacPaint working sheets in `art-src/` (with `npm run art:import`) still work and hold the box sizes. `npm run art:reference` writes reference pictures to draw over: the forest as it is now, and the worker portrait template. The full guide is [docs/SPRITES.md](docs/SPRITES.md).
## Layout

- `src/sim/`: the simulation. Pure TypeScript, deterministic, no browser APIs. All balance numbers are in `tuning.ts`.
- `src/render/`: the 1-bit canvas renderer and the procedural placeholder sprites.
- `src/ui/`: the System 7 style windows.
- `tests/`: Vitest tests for the simulation and the art pipeline.
- `tools/`: the MacPaint codec and the art export/import commands.
- `art-src/`: the MacPaint working sheets (the source of the art).
- `public/art/`: generated PNG sprite sheets the game loads.
- `docs/`: the design doc, the art guide, and the handoff notes.

In the browser console, `babel.sim.state` holds the live game state, for poking at while tuning.

## P0 progress

- [x] Deterministic core: fixed tick, seeded randomness, command log and replay
- [x] Workers with needs, moods, traits and the utility AI (with a debug view)
- [x] Ground strip, resources, job board notices with counts and wages
- [x] Skills, knacks and multi-unit trips (bonus yields, strong haulers)
- [x] Cards, scrolls, scribes, the patron's charter (WRITE, DELIVER, REPEAT, CHECK BOARD)
- [x] Scrolls on the board for Anyone, line counts, hand delivery replaces, standing charter
- [x] Tower floors from blueprints, builders, floor stockpiles, HAUL FROM/TO, couriers ([DELIVER] [REPEAT])
- [ ] Mailboxes and upper job boards
- [x] Language drift (French, Greek), confusion, misreads, TEACH/LEARN, lexicon, writing in other languages
- [x] Patron stipend, patience and floor bonuses; difficulty; quitting; newcomers

## P1 progress

- [x] Random map: forest, quarry, field, well, the old shack with a broken oven, the patron's supplies; the road home on the left
- [x] The opening text (flavor words in random languages); the scriptorium and first board placed together and built by the patron's workers; the charter decreed
- [x] Placement mode: preview, blocked-tile markers, the confirmation dialog; the tower site, chosen once
- [x] Generic buildings (named, 3 to 16 tiles wide, one or two stories) and their labels
- [x] Fixtures: bed, oven, pantry, brewing station, bar (beer from grain), stockpiles and storage shelves
- [x] Demolishing fixtures, then empty buildings; half the materials back. Cancelling unfinished things gives everything back. Renaming buildings
- [x] The user's first art delivery: terrain, nature, the wagon, sun and moon, buildings and fixtures
- [x] The patron's grace period; other construction wins back some patience
- [x] Tutorial scaffolding (draft text)
- [ ] Tutorial text rewritten after playtesting
- [ ] Addressing particular stockpiles and fixtures in orders
- [ ] The user's art in place of the built-in drawings

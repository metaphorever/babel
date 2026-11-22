# Babel (working title)

A side-view colony sim about building the Tower of Babel. You can only act by writing work orders, and the higher your workers climb, the more their languages drift.

Runs in the browser. Hobby project.

- Design: [docs/DESIGN.md](docs/DESIGN.md)
- Status: P0 grey-box simulation, in progress.

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


## Drawing sprites

Sprites are PNG sheets in `public/art/`: black for ink, white for paper, transparent for clear. Workers are layered parts (bodies, heads, beards, hats), so every row you add is a new variant. Edit them in any pixel editor; with the dev server running, switching back to the browser reloads them. The full guide is [docs/SPRITES.md](docs/SPRITES.md).

```bash
npm run art:export
```

regenerates template sheets from the built-in art (it won't overwrite sheets you've changed).
## Layout

- `src/sim/`: the simulation. Pure TypeScript, deterministic, no browser APIs. All balance numbers are in `tuning.ts`.
- `src/render/`: the 1-bit canvas renderer and the procedural placeholder sprites.
- `src/ui/`: the System 7 style windows.
- `tests/`: Vitest tests for the simulation.

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

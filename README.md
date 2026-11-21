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
- [ ] Cards, scrolls, scribes, the patron's charter
- [ ] Tower floors, couriers, mailboxes
- [ ] Language drift, confusion, translation
- [ ] Patron stipend and quitting

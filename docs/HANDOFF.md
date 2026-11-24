# Handoff: where Babel stands, and what's next

*Updated 2026-11-23 at the end of session 3. A new session should start here, then read [DESIGN.md](DESIGN.md) (§15 is P1, §15.10 how it was built) and [README.md](../README.md).*

## The project in one paragraph

Babel (working title) is a 1-bit, System 7 styled colony sim in the browser about building the Tower of Babel. The player can't touch anything: they compose orders that a scribe writes out and workers carry, and the higher workers climb, the more their words drift into other languages. It's a hobby project, shared with friends, open source, and not for sale. Live at **https://metaphorever.github.io/babel/**. Repository: **https://github.com/metaphorever/babel** (public).

## Working agreements

- **Roles:**
  - **The user** decides requirements, does art direction and draws art (MacPaint in Infinite Mac), playtests and does QA.
  - **Claude** writes the code, the tooling, production and placeholder art, and audio, and is an equal collaborator: opinionated where it matters, pushing back on bad ideas. Making something fun and good-looking matters more than anyone's ego.
- **Git:**
  - **Claude runs git and GitHub.** Commit **straight to `main`**; use a branch only for something risky.
  - **Commit messages** explain why, not just what, and end with the attribution line.
  - **Every push to `main` deploys:** `.github/workflows/pages.yml` runs the tests, builds, and publishes to GitHub Pages.
  - **Commit author:** "Clover <metaphorever@gmail.com>". The user chose to publish that as is.
- **GitHub CLI:** on this machine it's at `C:\Program Files\GitHub CLI\gh.exe` and is logged in as `metaphorever`. Shells started before it was installed may need the full path.
- **Tests:** keep them passing (`npm test`, 86 now). Add tests for new simulation behavior. The simulation must stay deterministic (rules below). `tests/p1.test.ts` covers the map, the opening, building and demolishing; most other tests use the prebuilt start (`createState(seed)` defaults to it).
- **Playtest feedback:** the user playtests on the live site and sends batches of notes. Fix bugs, record design decisions in DESIGN.md, and keep "provisional" notes up to date.

## Code rules that matter

- **`src/sim/` is pure and deterministic.**
  - No browser APIs, no `Math.random` / `Date.now`, no `Math.sin`/`exp`/`pow` in the simulation (results can differ between browsers).
  - The same seed plus the same command log must give the same game; tests check this.
  - State is plain JSON.
  - Every player action is a `Command`, carrying a `playerId` so multiplayer stays possible (it isn't built).
- **Every balance number is in [`src/sim/tuning.ts`](../src/sim/tuning.ts).**
- **The world is drawn 1-bit** (black ink, white paper, dither patterns) at native resolution and scaled by whole numbers. The camera moves in 4-pixel steps so patterns don't shimmer. Color is allowed only in the interface or overlays, with a reason.
- **The interface** is DOM windows styled like System 7 (`src/ui/`).
- **Debugging:** in the browser console, `babel.sim.state`, `babel.ui` and `babel.renderer` are available. `babel.sim.step()` advances one tick.

## Practical gotchas (learned the hard way)

- **The browser pane in the Claude desktop app** throttles animation to a few frames a second, so the game crawls there. To test, step the simulation from the console, or play in a real browser.
- **Big multi-line edits:** write the script to a file with the Write tool and run it, rather than using shell heredocs. Heredocs have truncated scripts and swallowed lines. **Backticks in `node -e "…"` get eaten by bash** (template literals vanish): use the Edit tool or a script file for anything with backticks.
- **JavaScript's `String.replace`** treats `$'`, `$&` and similar in the replacement text as special. Pass the replacement as a function: `t.replace(a, () => b)`.
- **"File changed on disk" notices after git operations** are just Windows line-ending normalization. Check `git status` before assuming the user edited something.
- **`npm install`** may warn about install scripts needing approval (npm 11). It's been harmless so far.

## Where P0 stands (done)

All of this is playable now:
- **The core:** the deterministic core, utility-AI workers with needs, moods, traits, skills and knacks, and the 1-bit renderer.
- **Orders:** physical orders (notices, cards, scrolls); scribes and couriers; the patron's standing charter, which recovers from drifted scribes; counts that can be a number, all or forever.
- **The tower:** built from blueprints, with floor stockpiles and hauling from and to places.
- **Language drift:** French (from 3 floors) and Greek (from 5), drift from floor 3 up; misreads, confusion, TEACH/LEARN, your lexicon, and writing in other languages.
- **The patron and workers:** patience, a stipend paid at dawn, difficulty; quitting and newcomers.
- **Time and art:** a day/night cycle with a night sky; MacPaint art sheets with a converter.

The README's checklist has the same list. DESIGN.md §13 records how P0 works, including its provisional shortcuts.

## Where P1 stands (session 2)

Built and tested: the random map, the opening text and founding, placement mode and dialogs, the tower site, generic buildings (any width 3 to 16, one or two stories), every fixture, beer and the bar, stockpile capacities, demolishing, the grace period, and draft tutorials. DESIGN.md §15.10 has the details and the decisions made while building it. **Not yet playtested by the user.**

**Art:** all world art goes through `worldSprite()` in `sprites.ts`: the built-in grids in `src/render/worldArt.ts` (and `extraWorldArt()` for set pieces that aren't on the sheets) are the fallback, replaced at load time by `public/art/world.png` from the user's art (session 3). Only clouds and the stars are still drawn in code.

## Where session 3 left things

- **The first art delivery is in:** everything on the World and Buildings sheets except the tower tiles (deck, wall, ladder) and the stockpile, which weren't redrawn. How it was cut up, and what to do differently next time, is in [SPRITES.md](SPRITES.md). Portraits stay Claude's placeholders for now.
- **From the user's notes:** fixtures place with no dialog (and you keep placing); unfinished things say "Cancel…" (instant at 0%, a dialog and a full refund when part-built); buildings can be renamed; stockpiles hold 24 everywhere and **storage shelves** (indoors, 3 wood) hold 48; workers use loose materials when nothing is stored, at a small mood cost; the tutorial has gathering and stockpile/hauling steps near the start and a "plans for the second floor" step before the warning; the simulation pauses while a dialog is open.
- **Waiting on the user:** how fixtures are addressed in orders (see below).

## Next steps, in order

1. **Addressing fixtures in orders** (haul stone *to the stockpile by the tower*, grain *to the bar*). The user proposed numbering left to right with a renumbering warning; Claude proposed permanent numbers instead (see the session 3 reply). Decide, then build it: the order's TO/FROM becomes a place *or* a fixture, with "nearest" as the default.
2. **Playtest P1** (the user) and fix what comes up. Things to watch:
   - **The tutorial text** is a draft; it needs the user's voice.
   - **Bar takings returning to the treasury** (a change from P0): does gold get too easy?
   - **The supplies** (20 stone, 30 wood, 24 bread): enough to found the camp and get to floor 1 inside the grace period?
   - **Build-camp workflow:** placing, then writing "build camp" work. Does it feel like the game, or like a chore?
3. **More art:** clouds built from parts (reference: `art-src/shots/cloud-reference.png`), storage shelves, and the tower's deck, wall and ladder. Each delivery: add its pieces to `tools/shots.ts`, run `npm run art:import`, and compare every box with the old art to catch anything missed.
4. **The portrait card:** the worker inspector showing a 64x64 portrait built from layers (body, hair, head, beard, hat) picked from each worker's look seed, once the user has drawn parts.
5. **P0 leftovers:** mailboxes and upper job boards (then the first board can be demolished), the COPY order, and night changing behavior (workers preferring to sleep at night).
6. **Later:** tables (mood when eating and drinking), typography (start with GNU Unifont, check its license), procedural sound effects and public-domain music, and acts of god at height.

## Open questions

These are DESIGN.md §14, plus:
- **The right edge of the map:** reserved, still undecided.
- **Hauling bread and beer:** cooks and brewers carry what they make straight to a pantry or bar. There's no "haul bread" yet, so food can't be carried up the tower. That will matter once floors have their own fixtures.

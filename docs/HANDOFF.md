# Handoff: where Babel stands, and what's next

*Written 2026-11-22 at the end of the first working session. A new session should start here, then read [DESIGN.md](DESIGN.md) (especially §15, the next big piece of work) and [README.md](../README.md).*

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
- **Tests:** keep them passing (`npm test`, 57 now). Add tests for new simulation behavior. The simulation must stay deterministic (rules below).
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
- **Big multi-line edits:** write the script to a file with the Write tool and run it, rather than using shell heredocs. Heredocs have truncated scripts and swallowed lines.
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

## Next steps, in order

1. **The first art round trip through Infinite Mac.**
   - **The test:** the user uploads a page's `.bin`, edits it in MacPaint and brings it back; `npm run art:import` converts it. This is unverified so far: does Infinite Mac recognize MacBinary, and how do files come back out? Fix whatever breaks. See [SPRITES.md](SPRITES.md).
   - **The scriptorium:** the user is drawing its special art.
2. **Draw the world from the sheets.** Switch the renderer from drawing terrain, the tower, nature, buildings and the sky in code to the `world.png` atlas, whose rectangles are in `public/art/manifest.json`. Dynamic overlays (bread on shelves, notices on the board, stockpile contents) stay in code. That way the user's art shows up everywhere.
3. **P1: the map and buildings** (DESIGN.md §15). Roughly in this order:
   1. **Map:** random placement of the forest, quarry, field, well and old shack; the road home on the left edge; starting supplies.
   2. **Placement mode:** outline, shading, the blocked-tile marker and the confirmation dialog.
   3. **The opening text** with flavor words in random languages, and placing the scriptorium and first board together, built automatically from the starting supplies.
   4. **The tower site:** placed once, never moved.
   5. **Generic buildings:** 1–2 stories, named by the player, labels listing their fixtures, and possibly a chosen width.
   6. **Fixtures:** bed, oven, pantry (replacing the larder), brewing station and bar (beer from grain; replacing the tavern), stockpiles with capacities (bigger indoors), and tables later.
   7. **Demolishing:** fixtures, then empty buildings; half the materials back.
   8. **The grace period:** 2 days to finish floor 1, with other construction winning back patience at about half rate.
   9. **Tutorial scaffolding** (outline in §15.8; the text isn't written yet).
4. **P0 leftovers:** mailboxes and upper job boards, the COPY order, and night changing behavior (workers preferring to sleep at night).
5. **Later:** typography (start with GNU Unifont, check its license), procedural sound effects and public-domain music, and acts of god at height.

## Open questions

These are DESIGN.md §14, plus:
- **Generic buildings:** customizable width, or fixed sizes to start?
- **The right edge of the map:** reserved, still undecided.
- **Scrambled flavor words:** they need a small vocabulary of adjectives in each language. They're flavor only and never translated.

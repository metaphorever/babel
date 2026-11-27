# Handoff: where Babel stands, and what's next

*Updated 2026-11-27 in session 12 (the Stores window and saves). A new session should start here, then read [DESIGN.md](DESIGN.md) (§16.9 is the plan being built now; §15 is P1 and what's been built since) and [README.md](../README.md).*

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
- **Tests:** keep them passing (`npm test`, 199 now; `npx tsc --noEmit -p .` for types; `npm run build` is what the deploy runs). For tuning the social web and the economy over time, `npm run sim:month` runs 30-day colonies and prints how labels settle, what moved feelings (by cause), what changed labels, churn, drinking, work and remittances. Compare settings side by side on the same seeds: `npm run sim:month -- gossip.chance=0.6 vs job.help=0.0015` (options: `--seeds=`, `--days=`, `--size=`, `--rich`). See DESIGN.md §15.13 for the findings and the current drama tuning (help minimal, once-a-day events strong). Add tests for new simulation behavior. The simulation must stay deterministic (rules below). `tests/p1.test.ts` covers the map, the opening, building and demolishing; most other tests use the prebuilt start (`createState(seed)` defaults to it).
- **Playtest feedback:** the user playtests on the live site and sends batches of notes. Fix bugs, record design decisions in DESIGN.md, and keep "provisional" notes up to date.

## Code rules that matter

- **`src/sim/` is pure and deterministic.**
  - No browser APIs, no `Math.random` / `Date.now`, no `Math.sin`/`exp`/`pow` in the simulation (results can differ between browsers).
  - The same seed plus the same command log must give the same game; tests check this.
  - State is plain JSON, and a save is a snapshot of it. **When SimState changes shape, bump `STATE_VERSION` (`sim.ts`) and add a step to `MIGRATIONS` in `save.ts`**, so saves made on the live site keep loading. New top-level fields are filled in automatically; new fields inside workers, sites and the like need the migration step.
  - Every player action is a `Command`, carrying a `playerId` so multiplayer stays possible (it isn't built).
- **Every balance number is in [`src/sim/tuning.ts`](../src/sim/tuning.ts).**
- **The world is drawn 1-bit** (black ink, white paper, dither patterns) at native resolution and scaled by whole numbers. The camera moves in 4-pixel steps so patterns don't shimmer. Color is allowed only in the interface or overlays, with a reason.
- **The interface** is DOM windows styled like System 7 (`src/ui/`).
- **Debugging:** in the browser console, `babel.sim.state`, `babel.ui` and `babel.renderer` are available. `babel.sim.step()` advances one tick. To test something that takes game time, change state and step in a loop from the console, e.g. push a `{kind, label, value: -30, until}` moodlet onto a worker and step to the next shift to trigger a notice. `?start=prebuilt`, `?seed=` and `?difficulty=` in the URL skip the opening or pick a game.

## Practical gotchas (learned the hard way)

- **The browser pane in the Claude desktop app** throttles animation to a few frames a second, so the game crawls there. To test, step the simulation from the console, or play in a real browser. **Claude has standing permission** to open the pane, start `babel-dev` (port 5173), and take over or reset its tabs for testing; the user playtests in their own browser. Ask before installing new tooling. If the pane is hidden, the page doesn't run: ask the user to show it.
- **Editing a source file reloads the dev page,** which starts a new game: finish a browser check before editing, or redo the setup after.
- **The UI picks up new alerts on its next refresh,** a moment later, not the instant a dialog closes: wait a beat before screenshotting.
- **Python isn't installed** on this machine; use node scripts or the Edit tool.
- **Big multi-line edits:** write the script to a file with the Write tool and run it, rather than using shell heredocs. Heredocs have truncated scripts and swallowed lines. **Backticks in `node -e "…"` get eaten by bash** (template literals vanish): use the Edit tool or a script file for anything with backticks.
- **JavaScript's `String.replace`** treats `$'`, `$&` and similar in the replacement text as special. Pass the replacement as a function: `t.replace(a, () => b)`.
- **"File changed on disk" notices after git operations** are just Windows line-ending normalization. Check `git status` before assuming the user edited something.
- **`npm install`** may warn about install scripts needing approval (npm 11). It's been harmless so far.

## Where P0 stands (done)

All of this is playable now:
- **The core:** the deterministic core, utility-AI workers with needs, moods, traits, skills and knacks, and the 1-bit renderer.
- **Orders:** physical orders (notices, cards, scrolls); scribes and couriers; the patron's standing charter, which recovers from drifted scribes; counts that can be a number, all or forever.
- **The tower:** built from blueprints, with hauling from and to places. *(Since session 4, floors are empty rooms: see DESIGN.md §15.12.)*
- **Language drift:** French (from 3 floors) and Greek (from 5), drift from floor 3 up; misreads, confusion, TEACH/LEARN, your lexicon, and writing in other languages.
- **The patron and workers:** patience, a stipend paid at dawn, difficulty; quitting and newcomers.
- **Time and art:** a day/night cycle with a night sky; art sheets read from screenshots.

The README's checklist has the same list. DESIGN.md §13 records how P0 works, including its provisional shortcuts.

## Where P1 stands (session 2)

Built and tested: the random map, the opening text and founding, placement mode and dialogs, the tower site, generic buildings (any width 3 to 16, one or two stories), every fixture, beer and the bar, stockpile capacities, demolishing, the grace period, and draft tutorials. DESIGN.md §15.10 has the details and the decisions made while building it. **Not yet playtested by the user.**

**Art:** all world art goes through `worldSprite()` in `sprites.ts`: the built-in grids in `src/render/worldArt.ts` (and `extraWorldArt()` for set pieces that aren't on the sheets) are the fallback, replaced at load time by `public/art/world.png` from the user's art (session 3). Clouds are built from the user's parts (`src/render/clouds.ts`, `public/art/clouds.png`; session 11); the flat code clouds and the built-in stars are only fallbacks now.

## Where session 3 left things

- **The first art delivery is in:** everything on the World and Buildings sheets except the tower tiles (deck, wall, ladder) and the stockpile, which weren't redrawn. How it was cut up, and what to do differently next time, is in [SPRITES.md](SPRITES.md). Portraits stay Claude's placeholders for now.
- **From the user's notes:** fixtures place with no dialog (and you keep placing); unfinished things say "Cancel…" (instant at 0%, a dialog and a full refund when part-built); buildings can be renamed; stockpiles hold 24 everywhere and **storage shelves** (indoors, 3 wood) hold 48; workers use loose materials when nothing is stored, at a small mood cost; the tutorial has gathering and stockpile/hauling steps near the start and a "plans for the second floor" step before the warning; the simulation pauses while a dialog is open.

## Where session 4 left things

- **Tower rooms** (DESIGN.md §15.12): finished floors are empty; any fixture goes in them, and the ladder is now a fixture the player places. **Numbering is settled:** the first floor you build is "Tower Ground Level", the next "Tower Level 2" and up. Rooms are named through `levelName()`, floors being built through `floorName()` (DESIGN.md §15.12). Levels stay 0-based in the code.
- **Hauling bread and beer is built:** bread goes to pantries, beer to bars, by number or name like stockpiles.
- **Addressing is built** (DESIGN.md §15.11): permanent fixture numbers, fixture renaming, and hauls TO/FROM the nearest store, the base, the tower, a floor, or one store by number or name. A haul with no TO now goes to the nearest store, not the base.
- **The scriptorium** stacks its queue between its columns again. **Babel Extras**, a new MacPaint page, has blank storage shelves, placeholder stairs and a house deck. Two-story houses now draw their own deck.
- **Roadmap recorded** (DESIGN.md §16): stairs, the trader, pilgrimages, an About/credits window ([CREDITS.md](CREDITS.md) has the text).
- **Relationships are built** (DESIGN.md §15.13): feelings, pair labels, couples (lovers, spouses, secret affairs, divorce), families (parents by birth and by marriage, siblings, estrangement), checked each dawn, listed in the worker window. Social life is built too (DESIGN.md §16.6): habits, scuffles, beaten to a job or helped with it, jealousy over purses, lessons, company moodlets, spouses following a quitter home, and **gossip** with side-taking. The worker window shows habits and a **Lately** list. Each worker has a **temperament** (warmth, touchiness, forgiveness; the extremes show as words in the worker window), so the same moment lands differently on different people. A **daily cap on shared time** and a **drift back toward each pair's original feeling** keep the web from saturating (checked with `npm run sim:month`, a 30-day colony simulation).
- **Purses** (DESIGN.md §15.14): workers send a full purse home at dawn (a moodlet, the gold leaves the colony), the bar appeals less right after a drink (rich workers used to drink all day and never work), and each bar has a beer price the player sets. The user's raw notes are in [IDEAS_BRAINDUMP.md](../IDEAS_BRAINDUMP.md).
- **The night sky** (the user's Milky Way picture) dithers in as night deepens. **The tower's wall, deck and ladder, the building tops and roofs, and the stockpile** are redrawn (the updated sheet screenshots).
- **Portraits:** the user's Photoshop layer format is validated (see SPRITES.md), but the art isn't final, so it isn't in the game. The worker window has a blank 64x64 frame for it. Plan: roll relationships first, then build portraits from them, so bio children inherit parts from their parents.

## Where sessions 5 and 6 left things

- **Session 5** (DESIGN.md §15.15): "haul anything", "build <one planned thing>", fixtures planned in unfinished buildings, "Ground Level" naming, flush two-story houses, right-click drops the tool. The full conditions-and-signals toolkit was scoped (§16.7).
- **Session 6** (§15.16): the logic words are in: IF / OTHERWISE / NOT, store checks (has / fewer than / no), hungry / tired / carrying / night / dawn, UNTIL on work lines, WAIT. Checking a store costs a walk (`LOGIC.lookRange`, for the user to confirm). Scrolls hold 8 lines. The user's hauling-equipment notes are §16.8.
- **Later in session 6** (§15.17): build orders by place (camp / buildings / fixtures in… / tower), fixtures and ladders planned on a level still being built, dawn/noon/dusk/midnight, Brewery and Shelves, the Orders window, a wider Scriptorium with the composer on top, explanations moved into hover tips and Help.
- **Wheelbarrows and carts** (§15.18): movable stores, "haul cart 1 to …", "… using cart 1". Next for hauling (§16.8): the rope pulley and winches up the tower, then the wagon, beasts of burden and the stable.
- **Portraits** (SPRITES.md): the worker window shows each worker's face, built from the PSD's parts by look seed, on a MacPaint pattern with a dithered white outline; bio children take after their parents.

## Where session 7 left things (2026-11-26)

- **The plan for keeping workers, alerts and a real start** (DESIGN.md §16.9) was agreed with the user, step by step. **Steps 1 and 2 are built, tested in the browser, and live:**
  - **Quitting on shifts:** fed up at once below mood 30, notice at the end of the shift, a deadline on a shift boundary set by difficulty (easy 4 shifts, normal 2, hard 1), staying if mood is back at 30. `morale.ts`, `QUIT`.
  - **Why:** a fading per-worker tally of real mood penalties (`tallyGrievances`) names the top two complaints. New real causes: overwork (`OVERWORK`, `workStreak`) and low wages (`PAY`, `judgeWage`). "Paid" now scales with the gold (`gotPaid`).
  - **Alerts:** a dialog per alert (pauses the game), Acknowledge, mute this kind or all (localStorage), Show worker. Kinds so far: `notice`, `quit`.
  - **The day number turns over at midnight** now, not 07:00.
- **The user's decisions this session** (all in §16.9): the bonus is a letter, not a word; the win alert's text and score formula; the everyone-gone alert and its buttons; the only true end is no workers and no money (the patron at 0 just stops paying); "infinite" is 1,000 levels; overwork and low wages only as real causes, never narrative. Everything else Claude recommended in the plan was accepted.
- **Watch in playtests:** the notice can repeat for a worker hovering at mood 30 (§16.9 step 1 has the options). Overwork and low wages are deliberately mild; the 30-day sim still averages mood 75.

## Session 8 (2026-11-26)

- **The Workers sheet is in, final:** all new art for bodies, heads, beards, hats, items, props and thought symbols, after five revisions (`art-src/shots/workers-clover-6.png`). Loads and thought clouds now sit on each worker's real top row, since hats reach the top of the box. Sleepers lie face up, and in a bed with their head on the pillow, 1 pixel off the floor.
- **Preview pages** for art in progress live in `art-src/picker/` (not committed): `workers.html` shows every worker part labeled, a crowd, walking and sleeping, using the game's own code; open it through the dev server.
- **The MacPaint `.bin`/`.pntg` tooling is gone** at the user's request: sheets are PNGs (`npm run art:export`), art comes back as screenshots. Don't make MacPaint-format files again.
- **The Babel To Do sheet is refreshed** and the user is drawing it now. Babel Extras is merged into it (that page is gone), and it has new boxes for flagpoles, flag outlines and bells (still and ringing) in three sizes. The box sizes were Claude's guesses; the user may resize them.
- **When the To Do screenshot arrives:**
  - Add `'Babel To Do': '<file>.png'` to `SHEET_SHOTS` in `tools/shots.ts`, run `npm run art:import`, and check every box.
  - The shelves, wheelbarrow and cart show up in the game right away.
  - The shelves are 16x32 now (two blocks), but the renderer's `case 'shelves'` in `src/render/renderer.ts` still puts the goods rows at `base - 1 - i * 5`, which fit the old 16x16 stand-in. Line the stone, wood and grain rows up with the planks the user draws.
  - Everything else on the sheet (stairs, the site marker, scriptorium icons, pulley, winches, stable, flags, bells) gets wired in when its feature is built.
- **While the user draws, the next session works on code:** next step 1 below.

## Session 9 (2026-11-26)

- **§16.9 step 3, the bonus letter, is built, tested and checked in the browser** (DESIGN.md §16.9 step 3 has the details and Claude's decisions). "Send a bonus…" in the worker window opens a dialog with the amount and a preview of the lift; a scribe writes a letter (a new carrier kind, `letter`, holding `gold`), the gold leaves the treasury when it's written, and a courier hands it over: into their purse, and an immediate mood lift for a day (`BONUS` in tuning; `bonusLift` and `receiveBonus` in `morale.ts`). 100 gold lifts anyone at least 30. A letter for someone who has quit comes back to the treasury.
- `boardReserve` is now `upfrontReserve` (`carriers.ts`): letters set their gold aside the same way notices do.

## Session 10 (2026-11-26)

- **§16.9 step 4, recruiting, is built, tested and checked in the browser** (DESIGN.md §16.9 step 4 has Claude's decisions). "Recruit a worker (N gold)" sits under the table in the Workers window; it opens a confirmation, and the `recruit` command takes the fee at once and puts the recruit on the road (`recruit.ts`: `recruitFee`, `recruitError`, `recruitWorker`, `arriveOnRoad`, which the patron's newcomers now share). The fee is 15 × the headcount with the recruit (so 15 with nobody left), never past the cap of 30. The patron's arrival rate is now set by difficulty (`ARRIVALS.every`).
- **§16.9 step 5, the other alerts, is built, tested and checked in the browser** (DESIGN.md §16.9 step 5 has the decisions): the patron at 50/25/0, a supply running out (an alert line per good in the state, `alertBelow`, for step 6's Stores window to set), the treasury unable to pay wages, a scroll given up, a newcomer and a level finished (muted by default), the goal reached with the score, and everyone gone (recruit / wait / the end). The **Alerts** menu lists recent alerts and turns kinds on and off. Sim side in `src/sim/alerts.ts`, UI and mutes in `src/ui/alerts.ts`. **Quit Game** starts a new game until the title screen exists.

## Session 11 (2026-11-26)

- **Clouds are built from the user's parts** and are in the game. The user drew a parts sheet with its own rules (top, middle and bottom layers; yellow edges that must touch the bottom, orange edges that must be hidden; two bottom sets; a combined bottom + middle end for option 2), and tuned them in a harness page (`art-src/picker/clouds.html`) before calling it done. Their picks: every choice random, and no middle centre twice side by side. SPRITES.md has how the sheet is read; the rules and the builder are in `src/render/clouds.ts`, shared by the importer, the game, the tests and the harness.
- `tools/pngDecode.ts` is the PNG reader without Node (the tests read the cloud sheet through Vite's `?inline` and `DecompressionStream`, since the project has no Node types).

## Session 12 (2026-11-27)

- **§16.9 step 6, the Stores window, is built, tested and checked in the browser** (DESIGN.md §16.9 step 6 has Claude's decisions). A row per good (stored, lying around, alert line) opens out to every store holding it, each with a Show button. The alert line is the `setAlertBelow` command; setting it never alerts on the spot. `src/ui/stores.ts` replaces the old totals table in `ui.ts`. The word **report** is still to come, with flags and bells.
- **§16.9 step 7, saves, is built, tested and checked in the browser** (DESIGN.md §16.9 step 7). File menu → Saved Games: slots in localStorage, an Autosave at midnight, download and upload. Loading reloads the page with the save in sessionStorage. Maps are run-length encoded in saves.

## Next steps, in order

1. **§16.9, step 8: the New Game screen** and taller maps, then 9 the title screen and Settings (its Load Game button opens the Saved Games window). Build in that order.
2. **Flags and bells** (§16.7): fixtures, RAISE / LOWER / RING, range circles, heraldic hatching, and the word **report** (§16.9 step 6, the rest of the Stores plan). Then standing orders on boards.
3. **Hauling, the rest of §16.8:** the rope pulley and winches up the tower, then the wagon, beasts of burden and the stable.
4. **Art from the user:** the "Babel To Do" sheet (`art-src/Babel To Do.png`, refreshed 2026-11-26 with flags and bells; shelves, wheelbarrow and cart feed straight in, see SPRITES.md), more beards and hats for portraits, any redrawn cloud parts (save over `art-src/shots/cloud-parts.png` and import; check them in `art-src/picker/clouds.html` first). Each delivery: add its pieces to `tools/shots.ts`, run `npm run art:import`, and compare every box with the old art. Sheets go to the user as PNGs only.
5. **Playtest notes** as they come: the tutorial text needs the user's voice; gold from bar takings; whether the starting supplies last the grace period; social tuning (§16.6) only from playtests.
6. **P0 leftovers:** mailboxes and upper job boards, the COPY order, night changing behavior.
7. **The rest of §16:** the About window (quick), stairs, the trader, pilgrimages.
8. **Later:** tables, typography (GNU Unifont, check its license), procedural sound and public-domain music, acts of god at height.

## Don't commit

`IDEAS_BRAINDUMP.md` changes are the user's own edits (commit only when they say), `tools/_psd.ts` isn't ours, and `art-src/picker/` holds scratch preview pages. Stage files by name, never `git add -A`.

## Open questions

These are DESIGN.md §14, plus:
- **The right edge of the map:** decided in session 4: the road to far-away lands (DESIGN.md §16), now 12 tiles wide.
- **Level tuning vs. copy:** with the ground counted as level 1, drift starts at Tower Level 4 and the cap is Level 31 against a "Level 30" goal. Ask the user whether to retune to rounder levels. *(Revisit with §16.9 step 8: the tower goals become 20 / 50 / 100 / 250 / 1,000, so drift's start and cap need to scale with the goal anyway.)*

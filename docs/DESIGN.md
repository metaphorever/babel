# Babel — Design Doc

*Working title. v0.1 draft, 2026-11-21.*

This is the source of truth for design decisions. Anything marked **Proposal** is my recommendation that hasn't been confirmed yet. Unresolved items are collected in [Open questions](#14-open-questions).

---

## 1. Pitch

You are the architect of the Tower of Babel. You can see everything and write any order, but you can't touch anything. Every change to the world is made by workers who read the orders you write, and the higher they climb, the less they understand you.

## 2. Pillars

1. **Orders are physical.** Every order is written on an object (a card, a scroll) that has to be carried to a worker or a board before it can be carried out. Information moves through the tower the same way stone does.
2. **Workers work to live.** Work earns money, and workers want money, but they weigh it against their own needs and wants. When they have no orders, they do what they please. They have survival instincts and they go home eventually.
3. **Language is the friction.** As the tower rises, workers' vocabularies drift into other languages. Orders they can't read get ignored or misread.
4. **See everything, do nothing directly.** The player is omniscient but can only act by writing orders.
5. **Small cast, big hearts.** At most 30 workers. Each one is recognizable and has a personality the player can get attached to.
6. **Love letter to the 1-bit Mac.** The world is drawn in 1-bit dithered bitmaps. A deviation needs a gameplay, accessibility or performance reason.

**Feature test:** does this make communication more interesting, or make a worker more lovable? If it does neither, it's a candidate for cutting.

**Accessibility of the "programming":** chaining orders invites programmer thinking, as in *Baba Is You*. If someone can build a Turing machine out of it, that's fine. But every mechanic has to be usable and understandable without technical knowledge. Nerds are welcome; they aren't the target.

## 3. Core loop

- **Seconds to minutes:** write orders → deliver them (board, courier, mailbox) → each worker decides what to do → resources move → floors rise.
- **Minutes to tens of minutes:** height raises travel time and confusion → workers get stranded and orders get misread → the player builds systems (upper boards, mailboxes, a crane) and invests in translation.
- **Session:** hit the patron's milestones before the patron loses patience (see [§8](#8-economy-and-pressure)).

## 4. World

- **Side view on a tile grid.**
- **Ground strip:** quarry, forest, fields, stockpiles, kitchen, tavern/market, scriptorium (where translation happens), the ground job board, and the road home at the edge of the map.
- **Tower:** built floor by floor from blueprints. A floor is a deck, walls, a ceiling, and a stair or ladder down to the floor below. Footprints start small.
- **Height costs time.** Every trip up and down is slow, so logistics get worse with each floor.
- **Sky bands:** the world above changes with altitude (clouds, wind, the heavens). This sets the visual and thematic backdrop for the patron's milestones and for acts of god.

## 5. Orders

### 5.1 Tokens

An order is a short sentence of **tokens**, usually a verb plus arguments: `[MINE][STONE]`, `[GO][FLOOR 4]`, `[BUILD][NEAREST]`.

Every token belongs to a language. Grammar is not modeled: the sentence is the token sequence, and each token is translated on its own. That keeps translation modular.

**Proposal: starting instruction set (v1)**

| Kind | Tokens |
|---|---|
| Work verbs | `MINE` `CHOP` `HARVEST` `COOK` `HAUL` `BUILD` |
| Movement | `GO` `RETURN` (to ground) |
| Order flow | `CHECK` (board or mailbox) `DELIVER` (a carrier, to a worker or place) `REPEAT` |
| Nouns | `STONE` `WOOD` `GRAIN` `BREAD` `BLUEPRINT` |
| Places | `FLOOR n` `NEAREST` `STOCKPILE` `BOARD` `MAILBOX` `HOME` |

Later unlocks could include conditionals (`IF HUNGRY`), named workers, and contraption verbs. All of these should come from tech or translation progress, never be required up front.

### 5.2 Carriers

Orders are written onto carriers:

- **Card:** holds one order.
- **Scroll:** holds several orders, in one of two modes:
  - **Ordered:** carried out top to bottom.
  - **Bundle:** the worker picks the next order by their own priorities (see [§6.3](#63-decision-making)).
- **Later:** sealed letters, signal flags, and orders sent by crane bucket.

How many orders a worker can carry grows with experience.

**Couriers** carry a bag with a limited number of carriers. Restocking or changing an upper board means sending a courier with a bag, so how far orders reach up the tower depends on courier trips.

### 5.2.1 Scribes write the orders

A design isn't an order until a **scribe** writes it out. The player composes orders in the editor, and a scribe at the scriptorium writes them onto carriers, which takes time.

- **The tutorial chokepoint:** you can't write other orders until a scribe is set up on a loop, because a scribe out of orders has nothing to write.
- **An early specialist:** scribes level up, and a fast scribe is precious. Overwork your best scribe and they may quit, so you either pamper them or spread the writing across several scribes.
- **Proposal: bootstrapping.** The game starts with one scribe already hired by the patron, carrying the **patron's charter**: a single scroll that sets them up on the scribe loop. It's the only order the player doesn't have to have written. Writing it could be the tutorial's first step.
- **Proposal: board notices aren't used up.** A notice posted on a board can be read by any number of workers. Each worker takes away only the job they read. Cards and scrolls that workers carry are used up. Scribes are then needed for carried orders and for changing board notices, not for every single job, so the scribe limits throughput without choking the ground economy.

### 5.3 Execution

A worker works through what they're carrying. When they run out of orders and no board is within reach, they fall back on free will ([§6.4](#64-free-will)).

The player avoids this by ending a chain with a return order: `CHECK BOARD`, `CHECK MAILBOX`, `RETURN`, or a `REPEAT` loop. A loop pays the order's wage every time it completes.

### 5.4 Job boards

- **The ground board is free.** It can deal cards in a set **ratio** (for example 50% mine stone / 20% chop wood / 30% haul) and can also hold specific posted orders. Idle workers nearby draw from it. The ground mostly runs itself.
- **Upper boards are expensive** and sit higher up the tech tree. Building one near the top automates the upper floors, until the tower grows past it and that top becomes the middle.
- **Upper boards are stocked and changed by courier.** An upper board's cards are physical stock that a courier delivers in their bag ([§5.2](#52-carriers)). Changing its ratio also takes a delivered notice, because the player can't adjust a distant board directly. This keeps pillar 1 intact.

### 5.5 Mailboxes

A mailbox is a delivery point with an address. A courier drops carriers there, and a worker who runs `CHECK MAILBOX` picks up whatever is addressed to them or to that mailbox. A rule-based postal system (routing by address, floor, or language) comes later.

### 5.6 Wages are priority

Every order carries a wage, set when it's written. Gold is reserved when the order is issued and paid when it's completed. A higher wage makes workers more motivated but costs more. There's no separate priority setting.

## 6. Workers

### 6.1 Always-visible stats

Hunger, thirst, tiredness, mood, **confusion** (how badly they understand the orders they're carrying, [§7.4.1](#741-confusion)), homesickness, purse (gold carried), and health. These are always available for inspection and also shown through body language. Specific wants and thoughts are written in the worker's language ([§7.6](#76-what-the-player-sees)).

### 6.2 Personality

- **Traits** are rolled at random and are mostly fixed. Examples: "gem-lover, mines faster" or "needs a hammock to sleep well."
- **Likes and dislikes** decide what lures them and what puts them in a bad mood.
- **Skills** grow with use: after 100 cooking jobs, a worker cooks faster.
- **Roles** are assigned by the player and give bonuses. For example, a translator assigned because they know the most languages translates faster.
- **Relationships** (friends and family) come later. They matter because a friend or relative can guide a lost worker home with no shared language.

### 6.3 Decision-making

The workers use **utility AI**. Each tick, a worker scores the things they could do:

- satisfy a need: eat, drink, sleep, toilet
- carry out a carried order that they understand
- take a job from a board within reach
- free-will actions ([§6.4](#64-free-will))

Each score combines a few weighted considerations: need urgency, wage times greed, distance and effort, trait modifiers, and mood. A small inertia bonus for the current action stops them flip-flopping.

Everything is rule-based and tunable, and an in-game debug view shows each worker's scores.

**Calibration target:** in a healthy colony, a worker who understands a well-paid order finishes it without intervention about 80–90% of the time. The remaining 10–20% is personality.

### 6.4 Free will

Without orders, a worker does whatever scores highest for them right now:

- meets their needs
- wanders and explores (sometimes upward)
- socializes
- looks for things they like
- spends their purse at the tavern or market
- heads home when homesick or when their purse is full

### 6.5 Survival instincts

- If no bed they like is nearby, they move down a floor to sleep.
- If trapped, they break through a wall.
- They come back down when there's no food where they are.
- They go home eventually.

### 6.6 Stranded workers and recovery

Ways to get a stranded worker back, roughly cheapest first:

1. **Wait** for them to come down on their own.
2. **Courier:** send someone carrying an order in a language the stranded worker understands.
3. **Lure:** use something you know they like (bread, gemstones). This needs you to read their thoughts.
4. **Guide:** a friend or relative walks them home. This depends on relationships, so it comes later.
5. **Force:** several workers carry them down. Physically demanding and bad for mood.

### 6.7 Quitting

If mood stays below a threshold for long enough, the worker **gives notice**, which shows clearly. If nothing changes, they leave. Losing someone your whole system depends on should hurt as much as a death.

New workers are recruited through the patron's reputation, up to the cap of 30.

### 6.8 Death

Possible but rare. Causes include falling, starvation, thirst, and being crushed. Fights come later. A death drops the mood of the dead worker's friends.

## 7. Language

### 7.1 Languages

Real languages, of which there are plenty to choose from. The player's chosen language (English to start) is the common tongue that every worker begins with.

**Proposal for v1:** 2–3 languages in total. At least one should be a Latin-script language a casual player might partly know (for example French), to test the "I know a little French" moment. One should be in a contrasting script (for example Greek or Hebrew), so it reads as foreign at a glance.

Procedurally chosen language sets per run might come much later.

### 7.2 Vocabulary model

- Each worker knows a set of tokens per language.
- The player's **lexicon** is the set of tokens they can write in each language. It grows through translation work ([§7.5](#75-translation)).
- **Proposal:** v1 treats each token as simply known or unknown. Partial fluency per token can come later if it's needed.

### 7.3 Understanding a partly readable order

| Unknown token | Result |
|---|---|
| Verb | The order can't be read. The worker falls back on free will. |
| Noun | The worker substitutes something based on personality: the nearest thing, a favorite, or a random choice. `[MINE][???]` makes them mine whatever is nearest. |
| Place | The worker makes a best guess, usually the nearest or most familiar place. |

The worker's thought bubble shows they're puzzled. Misread orders are a feature: they should be funny and usually recoverable.

### 7.4 Drift

Drift and confusion are separate. Drift is what happens to a worker's vocabulary. Confusion is how they feel about it ([§7.4.1](#741-confusion)).

- **Exposure:** drift exposure builds while a worker is above the **drift line**. It builds faster the higher they are and the more of heaven's attention the tower has drawn. It slowly falls on the ground.
- **What happens when it fills:** the worker loses one token from a language they know and learns the same token in their **drift tongue**. Then exposure resets.
- **The drift tongue:** each worker is given one the first time they drift, using the seeded random generator, so it's random but fixed. The player can see what it is after the first swap.
- **The tower's height sets the language pool.** A worker's drift tongue is chosen from the languages the tower has unlocked so far. A short tower might only have French and Spanish, so five workers can't drift into five different languages. Taller towers add languages to the pool. This keeps the early game understandable and recoverable. Above a much higher altitude, a worker may be given a second drift tongue.
- **Early warning:** a worker's thoughts are shown one token at a time, each in whichever language the worker knows that token in. So mixed-language thoughts are the first sign of drift. For example, a thought might be the English token for "want" followed by the French *pain* ("bread").
- **Proposal:** drift exposure is not shown as a meter. The first swapped word is the warning. If the first swap catches playtesters by surprise, we can show it.
- **Lost words don't come back on their own.** Grounding a worker stops the drift but doesn't restore their vocabulary. Only translation does.

#### 7.4.1 Confusion

Confusion is a visible stat, like hunger, and it measures **how badly a worker understands the orders they're carrying**. Drifting by itself doesn't cause it.

- A worker hungry for *pain* still knows they want bread, so they aren't confused.
- A worker carrying an order to deliver bread who only knows *pain* is confused, and delivers *something*.
- Unreadable or partly readable orders raise confusion. Clear orders and time without orders lower it. High confusion hurts mood, which feeds into quitting ([§6.7](#67-quitting)).

### 7.5 Translation

Translation happens at the scriptorium. A translator and a student both spend time on it, and it works in two directions:

- **Reteach:** restore a drifted worker's tokens in a language the player can already write.
- **Learn:** the translator learns tokens from a drifted worker, which adds them to the player's lexicon. After that, the player can write orders that every worker who speaks that language can read.

That's the strategic choice: fix this one worker, or invest in being able to command everyone who has drifted into that language. A translator with more languages, or the translator role, works faster.

### 7.6 What the player sees

- Tokens in a language the player has learned are shown in the player's language by default. A toggle shows the original.
- Tokens the player hasn't learned are shown in their original script.

### 7.7 Typography

Readable and accurate text matters more than period-accurate fonts. Text needs broad Unicode coverage with a retro feel.

- **Starting font:** GNU Unifont, a bitmap font with very broad coverage. Its license and how it looks in our art still need checking.
- **Fallback:** a separate pixel font for each script.
- **Interface chrome** can use a Chicago-style font.

## 8. Economy and pressure

### 8.1 Gold

Gold comes from mining, from trading surplus at the market, and from the patron's stipend. It's spent on wages, upper boards, blueprints and research.

### 8.2 The patron

Generous at the start. If steady progress stops, the patron cuts support. **Difficulty is the patron's patience.**

| Milestone | Floor |
|---|---|
| Catch a cloud in a jar | 30 |
| Bring down an angel's feather | 60 |
| Pluck a star from the sky | 100 |
| Endless | — |

### 8.3 What workers do with wages

Workers spend wages on luxuries at the tavern, which raises mood, or send money home, which eases homesickness. A full purse pulls a worker back down to the ground, so wages create a natural rhythm of trips home.

### 8.4 Height pressure

- confusion
- travel time
- weight and supply logistics
- **heaven's attention:** past certain heights, acts of god begin, such as wind and lightning strikes. Later there may be more.

## 9. Pacing (needs tuning)

All the numbers in this section are placeholders until playtests say otherwise.

- **Target:** a 30–60 minute session reaches the first milestone, the cloud at floor 30. That means about 1–2 minutes per floor on average: fast early, slower later.
- **The twist has to arrive early.** Drift should start within the first ~10 minutes. **Proposal:** drift line at floor 5 for the prototype.
- **Risk:** 30 floors in under an hour, while dealing with drift, may need very small, quick floors. If playtests feel rushed, the fix might be fewer, taller floors rather than moving the milestones.

## 10. Player interface

- **View:** WASD or edge panning, scroll-wheel zoom at whole-number steps (1×–4×), and a **map mode** with simplified icons when zoomed out.
- **Time:** pause and three speeds.
- **Order editor:** styled like a HyperCard card. Drag tokens from the lexicon palette, set the wage, choose a carrier, and choose a destination (a board, a mailbox, or a worker by courier).
- **Worker card:** large portrait, name, traits, stats, current thought (in their language), and the orders they're carrying. In-world sprites are pawns; worker cards are people.
- **Overlays:** language (tinted; a color exception), confusion, orders and needs.
- **Alerts:** a worker is idle, stranded, drifting, or giving notice.

## 11. Art and audio direction

- **World:** 1-bit dithered. Color only in overlays and interface elements where it clearly helps; judged case by case once it can be seen.
- **Workers:** built procedurally from parts (head, hair, beard, headwear, body, robe dither pattern). Each has a tiny pawn sprite (about 12–16 px tall) and a large portrait.
- **References:** Mac Plus / System 7, *Glider*, *Radical Castle*, *Scarab of Ra*, HyperCard, plus ancient Near East and biblical imagery.
- **Audio:** procedural sound effects in the style of the sfxr tool, plus public-domain music.
- **Process:** rough art for the first playtests. Then dedicated sessions to refine the tools and the style before committing to it.

## 12. Technical architecture

- **Language and tooling:** TypeScript and Vite, running in the browser.
- **`src/sim`:** the simulation, in pure TypeScript.
  - It's deterministic: it runs on a fixed tick, uses a seeded random generator, has no access to the web page, and never calls `Math.random` or `Date.now`.
  - Rendering animates smoothly between ticks.
- **`src/render`:** Canvas 2D. It draws at native low resolution and scales up by whole numbers.
- **`src/ui`:** normal web page elements styled like System 7. A lightweight framework (Preact, or none) will be decided during the prototype.
- **Commands:** every player action is a command `{ playerId, tick, type, payload }` that the simulation applies. Every entity is owned by a player ID. This keeps lockstep multiplayer possible later; **multiplayer is not being built.**
- **Saves:** the simulation state is saved as JSON to `localStorage` or `IndexedDB`.
- **Tests:** Vitest for the simulation, including a determinism test: the same seed and the same commands must produce the same state hash.
- **Debug tools:** an AI score viewer, stepping one tick at a time, and a seed readout.

## 13. Prototype plan

### P0: grey-box simulation (placeholder rectangles)

**Scope:**
- the ground strip with quarry, forest, field, stockpile, kitchen, scriptorium and ground board
- one or two scribes; the patron's charter
- about 8 workers with the needs from [§6.1](#61-always-visible-stats) and utility AI
- stone, wood, grain and bread
- cards and scrolls; the ground board's ratio deck
- building floors from a blueprint
- one mailbox and courier delivery
- two languages, the drift line, the confusion meter, and token drift
- translation in both directions
- the patron stipend and quitting

**Questions it has to answer:**
1. Is chaining orders while workers think for themselves fun, or frustrating?
2. Does drift create interesting problems, or just annoying ones?

### P0.5: art test (can run in parallel)

The procedural worker generator and the portrait card. Question: can a tiny 1-bit worker be lovable?

### P1

Merge the two and run the first playtest.

### Out of scope until the core loop works

Fights, metalwork, cordage, the full tech tree, contraptions (crane, bucket brigade), the postal rule engine, relationships, structural physics, acts of god, and multiplayer.

## 14. Open questions

- **Numbers:** are numerals universal, or does each language have its own (for example, Hebrew letter numerals)?
- **Scribes and language:** does a scribe have to know a language to write it, or can they copy a foreign script they can't read? Copying keeps scribes and translators separate. Requiring knowledge makes teaching scribes part of translation.
- **Bootstrapping:** is the patron's charter the right start ([§5.2.1](#521-scribes-write-the-orders))?
- **Courier bags:** how many carriers fit in a bag, and does that grow with experience or with better bags?
- **Drift pool:** at which heights does each new language enter the pool?
- **Scroll default:** ordered or bundle?
- **Talk between workers:** does language affect how workers talk to each other, and does it affect mood?
- **Session length:** does the floor count fit the session length ([§9](#9-pacing-needs-tuning))?
- **Gold:** how does mining gold actually work: an ore, a resource node, something else?
- **Force retrieval:** how many workers does carrying someone down take, how is it done, and what does it cost?
- **The name.**

## Glossary

| Term | Meaning |
|---|---|
| **Token** | One word in an order, belonging to one language. |
| **Order** | A sentence of tokens. |
| **Carrier** | The physical object an order is written on: a card or a scroll. |
| **Board** | A place that deals orders to nearby idle workers. |
| **Mailbox** | An addressed drop point for carriers. |
| **Lexicon** | The tokens the player can write. |
| **Drift line** | The floor above which confusion builds. |
| **Drift tongue** | The language a worker's vocabulary drifts into, chosen from the pool the tower's height has unlocked. |
| **Confusion** | A worker's distress at not understanding the orders they're carrying. |
| **Scribe** | The worker who writes the player's designs onto carriers. |
| **Courier** | A worker carrying a bag of carriers to deliver. |
| **Patron** | The funder. Their patience is the difficulty. |

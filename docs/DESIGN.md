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
| Order flow | `CHECK` (board or mailbox) `DELIVER` (a carrier, to a worker or place) `COPY` (a carrier) `REPEAT` |
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

**Couriers** carry a bag with a limited number of carriers: at least 10 to start, growing with experience. Restocking or changing an upper board means sending a courier with a bag, so how far orders reach up the tower depends on courier trips.

### 5.2.0 Addressing and names

- **Every worker has a unique name.** Orders can always be addressed to a worker by name.
- **Names are beyond language.** A worker never forgets their own name, even as their language drifts. They recognize it on any order, even when they can't read anything else on it, and they know the order is meant for them.
- **Any worker can find any named worker.** Any worker can pathfind to a named worker to deliver something, whatever languages either of them speaks.
- **Orders without a name are addressed to Anyone.**

### 5.2.1 Scribes write the orders

A design isn't an order until a **scribe** writes it out. The player composes orders in the editor, and a scribe at the scriptorium writes them onto carriers, which takes time.

- **The tutorial chokepoint:** you can't write other orders until a scribe is set up on a loop, because a scribe out of orders has nothing to write.
- **An early specialist:** scribes level up, and a fast scribe is precious. Overwork your best scribe and they may quit, so you either pamper them or spread the writing across several scribes.
- **Bootstrapping:** the game starts with one scribe already hired by the patron, carrying the scribe loop. After that, the **patron's standing charter** on the board ([§5.4.2](#542-the-patrons-standing-charter)) makes sure someone is always writing.
- **Board notices have a count.** A posted notice is addressed to Anyone or to a named worker, and carries a count. `[MINE][STONE] (50)` means 50 stone, mined by one worker or any mix of workers, each taking it as their next task. **Counts and wages are per unit** (per stone, per loaf), and one trip can finish several units (see [§6.2](#62-personality)). If a trip finishes more units than are left, the worker is paid for what was left. **The count goes down when a job is finished, not when it's taken.** The notice comes down when its count runs out. A worker who arrives to finish a job that's already used up doesn't get paid, and gets mad (a mood hit). The mood hit scales with the job's wage. Big public jobs are usually low wage, so missing one of those stings only a little. Scribes write notices once rather than once per job, so the scribe limits throughput without choking the ground economy. Cards and scrolls that workers carry are used up.
- **A scribe has to know a language to write in it.**
  - **New orders:** writing a new order in a language the scribe knows is fast. Without the language, it's possible but with a severe time penalty.
  - **Knowledge is per token.** A scribe who knows the mining words but not the food words writes mining orders fast and food orders slowly.
  - **Without the language, the player spells it out.** Writing a fresh order in a language the scribe doesn't know means the player dictates it letter by letter, which is where the time penalty comes from.
  - **Copying is its own order.** A copy job is a chain like `[GO][location] [COPY][carrier] [DELIVER][person or place]`. Copying works word for word with little time lost, even in a language the scribe doesn't know. The copy order itself can be written quickly in the scribe's own language. So a French scroll kept at base camp can be copied and sent to the top without taking up your French speaker's time.
  - **So languages shape the scribe staff.** You either train one scribe in several languages or keep different scribes and split the work.
- **The lexicon and the scribe do different jobs.** The player's lexicon ([§7.2](#72-vocabulary-model)) decides what the player can compose. Scribes decide how quickly it gets written.

### 5.3 Execution

A worker works through what they're carrying. When they run out of orders and no board is within reach, they fall back on free will ([§6.4](#64-free-will)).

**Memory vs. carrying:**
- **A worker remembers one job.** Reading a notice on a board puts that one order in the worker's memory as their current job. They don't take the card with them.
- **Memory survives distraction.** A worker who goes off to sleep in the middle of a mining job still remembers it afterward.
- **Chains need a carrier.** A worker only holds one order in mind at a time. To do a sequence of orders, they have to carry a scroll.

The player avoids this by ending a chain with a return order: `CHECK BOARD`, `CHECK MAILBOX`, `RETURN`, or a `REPEAT` loop. A loop pays the order's wage every time it completes.

### 5.4 Job boards

- **The ground board is free.** It can deal cards in a set **ratio** (for example 50% mine stone / 20% chop wood / 30% haul) and can also hold specific posted orders. Idle workers nearby draw from it. The ground mostly runs itself.
- **Upper boards are expensive** and sit higher up the tech tree. Building one near the top automates the upper floors, until the tower grows past it and that top becomes the middle.
- **Upper boards are stocked and changed by courier.** An upper board's cards are physical stock that a courier delivers in their bag ([§5.2](#52-carriers)). Changing its ratio also takes a delivered notice, because the player can't adjust a distant board directly. This keeps pillar 1 intact.

#### 5.4.1 Notices, cards and scrolls

- **A notice is a single job**, possibly a long one. `[MINE] [STONE] ×20` is a notice. So is `[HAUL] [STONE] [FROM] [base stockpile] [TO] [floor 3 stockpile] ×20`. The extra words are details about who, what or where, not extra steps. A notice stays on the board, and each worker who reads it takes one job from it into memory. `FROM`/`TO` places arrive with the tower.
- **Cards and scrolls can be posted too.** Anything on the board that isn't a single-job notice is a physical carrier. The first eligible worker to read the board takes it down and carries it. This is how you get "anyone free, run this mining loop" without choosing who.
- **One current job at a time.** A worker's current job is either the notice they took (held in memory) or the current line of the card or scroll in their hand. A scroll takes up a slot in their inventory, and it lets them chain lines without going back to the board.
- **Every line has a count:** the units to finish before moving to the next line. A card handed to a worker with `[MINE] [STONE] ×20` means "mine 20, then you're done". On a scroll, `[MINE] [STONE] ×2 → [HAUL] [STONE] ×2 → [REPEAT]` mines two, hauls two, and loops.
- **A name always wins.** At the board, anything addressed to a worker by name beats anything for Anyone.
- **Handing someone an order replaces what they're doing.** That covers both their remembered job and any scroll they hold. This is how you reassign people, and how you release a scribe: hand them `[CHECK] [BOARD]`. If a released worker still had undelivered carriers in their bag, those go to the scriptorium's outbox, and the next courier picks them up.

#### 5.4.2 The patron's standing charter

A plaque on the board reads:

> IF no one is writing, THEN post [write] [deliver] [repeat] for Anyone.

It's the only conditional order in P0. It shows that conditionals are coming later, and it means firing or losing your scribes can never leave you with no way to write a new one. The charter's scroll beats anything else for Anyone, but not something addressed to a worker by name.

#### 5.4.3 The composer

The composer builds each line from typed slots. The verb decides what the later slots can hold: `HAUL` takes a material, then (with the tower) a `FROM` stockpile and a `TO` stockpile. `DELIVER` will take a destination: a mailbox, a board or a worker. In P0, the slots are verb, then material or object, then count. The composer also explains in plain words what the order will do once it's delivered.
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
- **Skilled workers get more done per trip.** A practiced miner sometimes brings back a bonus stone from one mining action. A practiced cook gets an extra loaf from a batch. A strong or practiced hauler carries more than one item. Each extra unit counts against the notice and is paid like any other unit, so skilled workers earn more per trip at their specialty, and they lean toward those jobs on the board.
- **Every worker has a knack:** one skill they start a little ahead in and learn faster. This seeds specialization from the first minute.
- **Strong** is a trait: one extra item carried per trip.
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
- **The tower's height sets the language pool.** A worker's drift tongue is chosen from the languages the tower has unlocked so far. A short tower might only have French and Spanish, so five workers can't drift into five different languages. Taller towers add languages to the pool. This keeps the early game understandable and recoverable. New languages arrive slowly at first to ease players in, and more often higher up. The exact curve is for playtesting. Above a much higher altitude, a worker may be given a second drift tongue.
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

**How P0 handles scrolls (provisional, revisit in playtests):**
- **The scribe is also the first courier.** The patron's charter is `[WRITE] [DELIVER] [REPEAT]`. WRITE writes the next design in the queue into the scribe's bag. DELIVER pins notices on the board and hands scrolls to workers by name. Any worker given that loop becomes another scribe.
- **With nothing queued, a scribe waits at the desk.**
- **A line that can't be done is skipped,** and the holder takes a short breather. A loop that keeps failing doesn't pin a worker in place.
- **`CHECK BOARD` ends the scroll** and sends the worker to read the board.
- **With nothing to write but something to deliver,** a scribe moves on to DELIVER, so the outbox never gets stuck.

**How P0 builds the tower (provisional):**
- **A floor starts with a blueprint.** The scribe draws it, which is slow, and someone with DELIVER carries it to the top finished floor. Only then can anyone build. Blueprints stack: post three and floors 1 to 3 are planned in order.
- **`[BUILD] [TOWER]`** works on the lowest floor under way. The builder fetches stone (for the walls of the story below) or wood (for the deck) from the highest stockpile below that floor, climbs up, and sets it in place from the story below. Builders count what's already being carried up, so they don't all fetch the same thing. When the last unit is set, the floor is finished. *(P0 then added a ladder and a stockpile automatically; since session 4 the floor is an empty room, see §15.12.)*
- **`[HAUL] [STONE] [FROM] [base] [TO] [floor 3]`** moves goods between stockpiles. That's how you keep builders from climbing to the ground for every armload. Without FROM, haul picks up whatever is lying around. Without TO, it goes to the base.
- **Couriers:** a worker holding `[DELIVER] [REPEAT]` waits at the scriptorium and carries whatever is in the outbox. A scribe whose scroll has no DELIVER line leaves what they write in the outbox. So `[WRITE] [REPEAT]` plus a courier divides the labour.
- **Starting stock:** the patron's gift is 10 stone and 8 wood in the base stockpile, enough to start floor 1.
- **Not in yet:** mailboxes and upper job boards, falling, structural load, and acts of god.

**How P0 handles language (provisional; the numbers are in `tuning.ts`, DRIFT / CONFUSION / LESSON):**
- **Languages:** English (the common tongue), French (opens once the tower is 3 floors tall) and Greek (opens at 5). Greek is a different script, so a foreign word stands out at a glance.
- **Drift:** workers on floor 3 or higher build up hidden exposure, faster the higher they are. It fades on the ground. Each time it fills, one random word moves from the language they knew it in to their drift tongue. The drift tongue is picked from the open languages the first time they drift, then stays fixed for that worker.
- **Reading an order:**
  - An unknown verb means they can't read the order at all, and they skip it.
  - An unknown object gets a guess: a hauler hauls whatever comes to mind; a miner can only mine stone anyway.
  - An unknown place, or the "from"/"to" in front of it, is dropped, so they fall back on the usual place.
  - Misreads go in the log.
  - At the board, workers skip anything they can't read unless their name is on it.
- **Confusion** rises with unreadable orders and guesses, fades over time, and drags mood down above 40. A confused worker shows a `?` cloud.
- **Says:** the inspector shows what a worker wants, or their current job, word by word, each word in whatever language they still know it in. Words you've learned get a small English gloss. Mixed languages are the early warning.
- **Translation:** `[TEACH] [name] ×N` and `[LEARN] [name] ×N` run at the scriptorium. The translator calls the student by name, and the student only hears it if they're on the ground. TEACH gives the student the translator's words back, common tongue first. LEARN takes the student's foreign words, and each one goes into your lexicon. A translator who knows more languages works faster.
- **Lexicon and writing:** the composer has a "Written in" choice. You can only write words in your lexicon for that language, and there's a preview of exactly how the order will read. A scribe writes words they don't know 4× slower.

**How P0 handles the patron and quitting (provisional; see PATRON / QUIT / ARRIVALS in `tuning.ts`):**
- **Patience** runs from 0 to 100 and drains steadily. Difficulty sets how fast: about 30 / 17 / 10 minutes from full to empty on easy / normal / hard. Each finished floor wins back 35 patience, plus a gold bonus of 40 + 10 × the floor number.
- **The stipend** is 50 gold a minute at full patience, scaled down as patience drops. At zero it stops until the tower grows again.
- **Newcomers:** while patience is 50 or more, a newcomer arrives on the road home every 2 minutes, as long as the colony is below 8 + 1 per finished floor (capped at 30).
- **Quitting:** a worker whose mood stays below 30 for a minute gives notice, which shows as a bindle-on-a-stick cloud, a menubar alert and a countdown in the inspector. If their mood climbs above 40 within 2 minutes, they decide to stay. Otherwise they drop what they're carrying, leave their scrolls behind, send undelivered carriers to the outbox, and walk home with their purse.
- **Desperation:** a need above 90 (starving, parched, exhausted) adds a big mood penalty on top of the usual one. A colony with no food falls apart in about 10 minutes.

**Later: building floors tile by tile.** *(Partly done in session 4, §15.12: floors are empty rooms and the player places fixtures in them, ladders included.)* The automatic stockpile on each finished floor was a P0 stand-in. In the full game, every floor is built empty, and the player chooses what goes on each tile: individual stockpiles (stone only, wood only and so on), beds, kitchens, larders, wells, workshops, mailboxes and boards. Placing one is a blueprint like any other, carried up and built by workers. This is what makes each floor's layout a logistics decision.

**Also in P0, from the first playtests:**
- **Counts can be "all" or "forever"** ([§5.4.1](#541-notices-cards-and-scrolls)). "All" keeps going while there's something to do and finishes when the source runs dry: hauling, building, cooking, writing, teaching, learning. "Forever" never finishes. Neither promises gold up front; both pay from the treasury as the work is done.
- **The composer puts "who is it for" on top** as a three-way switch: Board · Anyone, Board · by name, Hand to. Each mode looks different: a thin border, a double border, or a thick border with a hatched banner.
- **Day and night.** A day is 5 real minutes at 1×. The patron pays at dawn. The sky goes through dusk to a starry night and back, but only the open sky: the ground and the tower's column stay paper-white for legibility. Night doesn't change behavior yet. A natural next step is workers preferring to sleep at night.
- **Drifted scribes.** The patron's charter only counts a scribe who can still read "write". A worker who keeps hitting unreadable lines (three strikes) gives up on the scroll, so a drifted scribe can't lock up the game.
- **Panning** moves in steps of the 4-pixel dither tile, so patterns never shimmer.
- **Sprites** are PNG sheets; see [SPRITES.md](SPRITES.md).
- **Scroll wages come out of the treasury as each line is done.** Nothing is reserved up front, because a loop has no end. If the treasury is empty, the line goes unpaid and the worker's mood drops.
- **Taking a notice down is immediate.** That's a P0 shortcut, since the ground board sits beside the scriptorium.

### P0.5: art test (can run in parallel)

The procedural worker generator and the portrait card. Question: can a tiny 1-bit worker be lovable?

### P1

Merge the two and run the first playtest.

### Out of scope until the core loop works

Fights, metalwork, cordage, the full tech tree, contraptions (crane, bucket brigade), the postal rule engine, relationships, structural physics, acts of god, and multiplayer.

## 14. Open questions

- **Numbers:** are numerals universal, or does each language have its own (for example, Hebrew letter numerals)?
- **Running out of a notice's count:** counts go down only when a job is finished, so on a busy board several workers can be heading for the last few jobs, and the ones who lose out get mad. A spread of mild frustration adds character; a crowd of angry workers on every board is tedious. Possible fixes if playtests show it's a problem:
  - Workers with a perceptive trait skip notices that look nearly done.
  - The mood hit is smaller when the job was small.
  - The board shows how many workers are already on a notice.
- **Courier bags:** exact sizes. Better bags might be craftable, as well as bags growing with experience.
- **Drift pool:** the exact heights where each language joins the pool. Playtesting will decide.
- **Scroll default:** ordered or bundle?
- **Talk between workers:** does language affect how workers talk to each other, and does it affect mood?
- **Session length:** does the floor count fit the session length ([§9](#9-pacing-needs-tuning))?
- **Gold:** how does mining gold actually work: an ore, a resource node, something else?
- **Force retrieval:** how many workers does carrying someone down take, how is it done, and what does it cost?
- **The name.**

## 15. P1 spec: the new game, the map and buildings

*Decided 2026-11-22, after the first playtests. Built on 2026-11-23 (session 2); see §15.10 for how it works and what was decided along the way. It replaces P0's fixed ground strip with a map the player lays out.*

### 15.1 The map

- **Random natural features:** the forest, quarry, field and well are placed randomly on each new map, along with an **abandoned shack holding a broken oven**. The shack is always there: the demolition tutorial uses it, and experienced players will probably clear it first.
- **The road home is always on the left edge.** The right edge is reserved: it will be the road to far-away lands, for the trader and pilgrims (§16).
- **The patron's starting supplies** sit at a random spot (possibly the far side of the scriptorium) until there's somewhere to store them.
- **Workers sleep rough** until beds are built. That costs mood, which is the reason for the bed tutorial.

### 15.2 Opening text

The game opens on this text. The words in [brackets] are flavor adjectives, each shown in a random language from all the languages in the game (nothing is unlocked yet at the start). They aren't translated and nothing depends on them: the sentence stays understandable without them.

> Your [benevolent] patron has entrusted you with a [legendary] commission: Build a tower that reaches all the way up to heaven! To complete this task you will be provided many [industrious] workers, [plentiful] land and natural resources, and a generous stipend — as long as your progress pleases your patron.
>
> Although the [heavy] burden of this project's success lies on your shoulders, your hands will not touch a single brick. To give jobs to your [trusted] workers you must dictate them to a scribe at the scriptorium, and then have a worker post the order on a job board or deliver it to a worker to be carried out.
>
> To begin, please select a location to build your scriptorium and first job board.

**[Build Scriptorium]**

### 15.3 Placing buildings

- **Placement mode:** after **[Build Scriptorium]**, the player is in placement mode. The building's outline follows the cursor, partly shaded, with its bounding box outlined. Over occupied land (a field, the well, another building) it shows an **XXXXX** marker.
- **Confirming:** clicking asks "Are you sure you want to place this building here?" with **Cancel Build / Change Placement / Build [Building Name] Here**.
- **The first two buildings:** the scriptorium and the first job board are **separate buildings, placed together** in that one step, with the board beside the scriptorium's door. That keeps the intro simple and makes for a short walk. Experienced players can build a new board and demolish the old one later.
- **Who builds them:** once placed, workers are automatically given the build jobs (pre-written orders, like the patron's charter) and build from the starting supplies.

When both are finished:

> The Scriptorium and job board are now complete. To ensure that you will always be able to issue orders, the "Patron's Charter" has been permanently decreed. The fate of this [monumental] undertaking depends on you. [Good luck!]

**[Continue Tutorial] [Skip Tutorials]**

### 15.4 Buildings

- **Placed only once, never moved or demolished:** the **scriptorium** and the **tower**. The player gets one shot at each. Everything else can be built any number of times and demolished.
- **Generic buildings** are empty wooden shells, **one or two stories tall at most**. Since language confusion starts at the third story, ordinary buildings never trigger it.
  - **Naming:** the player names each one, and its label lists what's inside, for example "Dormitory (Bed, Bed, Pantry)".
  - **Art:** they all share the same basic art.
  - **Width:** likely customizable, so a kitchen can be 2 tiles and a dorm 4. Simple fixed sizes are fine to start.
- **The scriptorium** has its own special art; the user is drawing it.
- **The tower site** is chosen in its own placement step, after the scriptorium. It can't be moved, so the tutorial warns the player to choose wisely.

### 15.5 Fixtures

Fixtures are permanently fixed in place inside a building. The word covers amenities and tools: beds, ovens, pantries, brewing stations, bars, stockpiles, and later tables.
- **Ovens** bake bread; **pantries** store it (the pantry replaces P0's "larder").
- **Drink:** grain is brewed into beer at a **brewing station** and stored at a **bar**, where workers drink. The bar is a fixture and takes over from P0's ready-made tavern. Workers still spend their wages there.
- **Tables** (later) give extra mood when eating, drinking and socializing.
- **Stockpiles** can go outside or inside buildings. Workers can only use resources that have been stored. Stockpiles inside buildings hold more. P0's stockpiles have no limit yet.

### 15.6 Demolishing

- **What you can demolish:** fixtures, and then the empty building.
- **Rules:** a pantry, bar or stockpile can only be demolished once it's emptied, and a building only once it has nothing in it.
- **Salvage:** demolishing gives back **half** the original materials.

### 15.7 The patron's grace period

- **The deadline:** the patron gives **2 in-game days to finish the first floor**. After that, normal patience drain applies.
- **Other building counts too:** construction on other buildings wins back patience at about **half** the rate of tower floors. That gives some cushion for building the base, without letting it replace the tower.

### 15.8 Tutorials (outline, not written yet)

1. **The stipend:** how it's paid, the grace period at the start, what pace of progress keeps patience at 100%, how patience drops, and how to win it back.
2. **The tower:** restate the goal (height, or another goal, depending on game mode). The tower site can't be moved once chosen, so choose wisely. The patron wants real progress by the end of the grace period, so don't forget it.
3. **Buildings:** fixtures must go inside a finished building. **[Build an empty building]**
   1. When the first building is done: workers need food to stay happy. **[Build oven]**, then a place to keep bread: **[Build pantry]**.
   2. Workers need rest. **Build some beds.**
   3. Many workers enjoy a drink now and then: consider a **brewing station** and a **bar**.
   4. **Stockpiles:** workers can only use stored resources. Stockpiles can go outside or inside buildings; inside ones hold more.
   5. **Demolishing:**
      1. Click **[Demolish]** and select the broken oven in the abandoned shack.
      2. The shack is empty now, so demolish it too. Demolishing gives back half the materials.
      3. A pantry, bar or stockpile can only be demolished once it's emptied; a building only once it's empty.
   6. **A warning about language.** The real tutorial comes when drift first happens.
   7. **Possibly more scroll and order hand-holding**, earlier on.

### 15.9 Also decided

- **Drift starts on the third story.** Floors 1 and 2 are safe, and French joins the drift pool once the tower is 3 floors tall. *(Changed in code on 2026-11-22.)*
- **Art pipeline:** working sheets are MacPaint documents, edited on a System 7 Mac in an emulator (Infinite Mac). Each sprite has a mask beside it, and converters go both ways. See [SPRITES.md](SPRITES.md). *Revised the same day: art now arrives as PNG screenshots of MacPaint, sliced by hand. Set pieces like the forest may be one large drawing; clouds will be assembled from parts, like workers.*

### 15.10 How P1 works (built 2026-11-23; provisional, revisit in playtests)

**The map:**
- **Layout:** the world is 192 tiles wide. The road home takes the left 4 tiles; the right 12 are kept clear for the road to far-away lands (*session 4:* it was 8). The forest (12), quarry (16), field (12), well (2), old shack (6) and the patron's supplies (9, the width of the wagon's art) land in a random order with random gaps of at least 3, from the seed.
- **The patron's supplies** are a pile (drawn as the supply wagon, which rolls in along the road over the first 8 seconds of a new game) of 20 stone, 30 wood, 10 grain and 24 bread. Workers take from it like a stockpile but nothing can be added to it. Until there are pantries, everyone eats from it.
- **`?start=prebuilt`** lays out a P0-style colony instead (fixed map, everything built). The tests use it.

**The opening:**
- **Before anything is built,** workers mill around by the supplies, eat from them and drink at the well. *Session 4:* they don't lie down to sleep until the scriptorium is placed (the first order), unless they're worn out (fatigue 80, `AI.openingSleepAbove`). There's no board and no charter yet.
- **Placing the scriptorium** marks out it and the board beside its door (6 + 1 gap + 2 tiles). The patron's clerk hands four workers a card, "build camp ×all", wage 1. When both stand, the charter is decreed: the worker with a knack for writing becomes the scribe, and three starter notices go up (mine stone, chop wood, harvest grain).
- **Placement order:** the scriptorium comes first; nothing else can be placed until it is. The tower site comes next in the tutorial, but any time is allowed.

**Building on the ground ("build camp"):**
- **CAMP is a new noun:** `[BUILD] [CAMP]` works on everything planned on the ground (buildings, fixtures, the scriptorium and board), oldest plan first, and takes things down that are marked for demolition. `[BUILD] [TOWER]` is unchanged. *Why a word and not automatic:* the player can't touch anything; placing lays out the plan, and the labour still has to be ordered. Placing is the one direct action, the way a patron's architect would draw plans.
- **Builders** take stone and wood from the nearest stockpile (or the supplies). *Changed in session 3:* if nothing is stored, they pick loose materials up off the ground instead, at a small mood cost (−3 for a minute, "had to pick wood up off the ground"). The camp can never stall for want of hauling, but they always prefer a store. Cooks and brewers do the same for grain. Each counts what others are already carrying, and when everything is on its way they take a short breather rather than give up.
- **"Build camp ×all"** comes down once nothing planned is left, so new plans need new work. Players may prefer "forever" for a standing crew.
- **Costs:** a generic building is 1 wood per tile per story. Scriptorium 6 wood + 4 stone; board 2 wood; bed 2 wood; oven 4 stone; pantry 2 wood; brewing station 2 wood + 1 stone; bar 3 wood. **A stockpile costs nothing and is ready at once:** it's marked-out ground. That also means stored goods can never be locked out by a lack of somewhere to store them.
- **Building widths** are 3 to 16 tiles, chosen while placing (the − / + buttons, or [ and ]). Every fixture is 2 tiles wide.
- **Two stories:** finishing a two-story building lays a deck across it and a ladder up its left end; fixtures can go upstairs (not over the ladder). Demolishing takes the deck out and brings anyone up there down.

**Fixtures:**
- **Ovens and pantries:** "cook bread" fetches a grain from a stockpile, bakes at the nearest oven and carries the bread to the nearest pantry with room. Pantries hold 20. Eating takes from the nearest pantry (or the supplies).
- **Beer:** "brew beer" is the same at a brewing station, into a bar (holds 12). A worker with money and the mood for it buys a beer (5 gold), which lifts their mood and takes the edge off thirst. *Decided here: what workers pay at the bar goes back to the treasury,* since the bar is the colony's own. That's a change from P0's tavern, whose gold left the economy. It makes brewing worth doing; watch whether it makes gold too easy.
- **Beds:** one worker per bed, nearest free bed first. Otherwise they sleep rough.
- **Stockpiles:** hold 24 anywhere (all goods together): a stockpile is just designated space. *Changed in session 3* (it was 24 outside, 48 inside). **Storage shelves** (3 wood, indoors only) hold 48; they are the way to store more. Haulers fill the nearest one with room (see §15.11 for naming a particular one). "From base" takes from the nearest base stockpile with that good. Tower floors no longer get an automatic stockpile (§15.12).
- **The old shack's oven** is broken and can't be used.

**Cancelling** (session 3): something not finished is cancelled, not demolished, and its button says "Cancel…". With nothing set in place it just disappears, with no dialog. Part-built, a dialog asks first; then everything already set in place is left lying there in full (no loss) and the plan is gone at once.

**Demolishing:** marking something finished is immediate; the work waits until it's empty (goods for a pantry, bar or stockpile, fixtures for a building) and is done by "build camp" workers, a unit at a time. Half of what went in (rounded down) is left lying there to haul. The scriptorium, the tower site, the board (until there can be more than one) and the land can't be demolished.

**The patron:**
- **Grace:** for the first 2 days, patience doesn't drain, unless floor 1 is finished sooner.
- **Other construction:** each unit of material set in place anywhere but the tower wins back 1.25 patience (half a floor's rate), but only up to 75%. Only the tower can take the patron all the way to happy.

**Tutorials:** the §15.8 outline, plus the user's session 3 additions, is in as twelve steps (the stipend, gathering, stockpiles and hauling, the tower site, buildings, food, rest, drink, demolishing twice, plans for the second floor, the warning) in a Tutorial window, each with buttons that do the thing and most moving on by themselves once it's done. *The text is a first draft by Claude and should be rewritten after a playtest.*

**Interface:** a Build menu and window (key B), placement with a shaded preview and an X on every blocked tile, System 7 confirmation dialogs for buildings, the scriptorium and the tower (*session 3:* fixtures place with no dialog, and you keep placing until Esc), a window for any building or fixture you click (Rename for buildings; Cancel or Demolish), the simulation paused while a dialog is open, and building labels like "Dormitory (Bed ×2, Pantry, Stockpile 3)" (*session 4:* fixtures are counted, stores show their number).

### 15.11 Addressing fixtures in orders (session 4, 2026-11-24)

*The user proposed numbering left to right, with a warning when a new fixture renumbers others. Claude pushed back: orders are physical paper, so renumbering would make notices already on the board quietly mean something else. Agreed: numbers by build order, never renumbered.*

- **Every fixture gets a permanent number per kind** when it's placed: "Stockpile 3", "Oven 2". The lowest free number is reused, so after stockpile 1 is demolished the next stockpile placed is stockpile 1 again. Nothing is ever renumbered. The patron's supplies and the broken oven have no number.
- **Full names** read fixture first, then where it is: "Stockpile 3 (Mess Hall)", "Stockpile 4 (Tower L2)", "Stockpile 1 (Base)" for one out in the open. The map shows the short name; building labels count everything but stores ("Dorm (Bed ×6, Stockpile 2)").
- **Renaming** (for players who want to micromanage): a fixture's window has Rename…. A name can't match another fixture's name (ignoring case) or look like a number ("Oven 2"), so an order never means two places. A blank name goes back to the number. The number stays either way, so orders written with it still work.
- **In orders,** a haul's TO and FROM can be:
  - nothing: TO the **nearest store with room** (*changed:* it used to mean the base), FROM whatever's **lying around**;
  - **the base** (any store on the ground), **the tower** (any floor; TOWER is the same word as the noun), or **floor N**;
  - **one store by number**, a new word with the number on it: STOCKPILE 3, SHELVES 2. Like FLOOR, these words drift (*réserve 3*, *σωρός 3*; *étagère*, *ράφια*), and the player has to learn them in a language to write them in it;
  - **one store by name**, written as is in every language, like a worker's name: nobody forgets a name.
- **The menus** in the scriptorium list those in that order: nearest, base, tower, each floor, then each store left to right, base first, by full name.
- **An order naming a store that isn't there** (demolished, or never built) fails with "There's no stockpile 3", like any job that can't be done. It works again as soon as something takes that number or name. With no TO, a haul FROM somewhere never goes back to where it came from.
- **Each good has its own stores** (session 4, later the same day): stone, wood and grain go to stockpiles and storage shelves, **bread to pantries, beer to bars**. HAUL now takes bread and beer too, and PANTRY and BAR are numbered place words like STOCKPILE (*garde-manger*, *comptoir*; *κελάρι*, *ταβέρνα*). A haul naming the wrong kind of store ("haul bread to stockpile 1") is refused when it's written. The scriptorium's menus offer only the stores that keep the good on that line, and changing the good resets a store that doesn't keep it. Floors appear in the menus only where something up there keeps that good. Ovens and other fixtures are numbered but can't be named in orders yet, since no order needs them (cook *at* oven 2 would).

### 15.12 Tower rooms (session 4, 2026-11-24)

*The user: every fixture can be built in the tower; tower rooms start empty and need everything built in them, the ladder (or stairs) included.*

- **A finished floor is an empty room.** No ladder and no stockpile come with it any more. The log says so: "Tower Level 2 is finished! ... Its room is empty: place a ladder on Tower Ground Level to reach it."
- **Rooms** are the tower's ground floor (as soon as the site is chosen) and every finished floor, inside the walls. Any fixture can go in one, placed the same way as in a building: point at the story. Storage shelves count a tower room as indoors.
- **Ladders** are a fixture now: 2 wood, one tile wide, tower rooms only (two-story buildings still come with their own). A ladder stands in a room and climbs to the floor above, so it needs that floor to be finished. Floor 1 can be built from the ground, but to build floor 2, or to carry its blueprint to the top, workers need a ladder from the ground floor up to floor 1.
- **"Build camp" builds them,** like every other fixture, wherever it stands. *Claude's call:* CAMP is everything the player places; TOWER is the floors themselves. If a separate tower crew should do tower fixtures, that's a small change.
- **Taking a ladder down** planks over the hole. Anyone left above it with no other way down climbs down first.
- **Fixtures that need height:** a fixture can have a lowest story it goes on (`minStory` in `BUILD.fixtures`, 0 = the ground floor), checked in buildings and in the tower alike. None uses it yet; the pulley lift will (the floor above the ground or higher).
- **The tutorial's "plans for the next floor" step** now also explains that floors are empty rooms, and, once floor 1 stands, asks for a ladder on the tower's ground floor if there isn't one (with a button that starts placing it). It moves on when the plans are drafted and the ladder is placed.
- **Numbering (settled by the user, session 4):** the ground counts as the first level. The game says **"Tower Ground Level"**, then **"Tower Level 2"**, "Tower Level 3" and so on ("Ground Level" / "Level 2" where the tower goes without saying, as in the Tower window). It says "level", never "floor", to stay out of what-is-a-floor semantics. Orders use the word too: "haul stone from base to level 4" (French *niveau*, Greek *επίπεδο*).
  - **In the code nothing moved:** levels stay 0-based (`site.level`, `s.floors`, `Project.level`, the FLOOR token's `n`). Index 0 is the ground, index n stands on the nth deck and reads as "Level n+1". `levelName()` in lang.ts is the one place that turns an index into words; use it for anything the player reads.
  - **Tuning kept its behavior,** so the copy shifted by one: drift starts at Tower Level 4 (`DRIFT.lineFloor` = 3), French drifts in once the tower reaches Level 4, Greek at Level 6. The patron's goal reads "Tower Level 30", though `TOWER.maxFloors` (30 decks) lets the tower reach Level 31. Retune if those numbers should land on rounder levels.
  - A pulley lift that "only goes on floor 2 or higher" is `minStory: 1`: Tower Level 2 or higher, or upstairs in a two-story building.

### 15.13 Relationships (session 4, 2026-11-24)

*The user's notes are in [IDEAS_BRAINDUMP.md](../IDEAS_BRAINDUMP.md) (2026-11-24, with clarifications). This is what's built from them; the code is `src/sim/social.ts`, the numbers are `SOCIAL` in tuning.ts.*

- **Feelings.** Every worker feels something about every other: a hidden number, 0 to 1. The words: **hates** under 10%, **dislikes** under 30%, nothing from 30% to 50% (the neutral gap), **likes** from 50%, **is fond of** from 70%, **adores** from 85%.
- **Pair labels** go by the weaker side: **friends** (both like), **good friends** (both fond), **best friends** (both adore), **enemies** (both hate). The one exception is **frenemies**, the mixed pair: one likes, the other dislikes.
- **Rolling feelings:** a bell curve (average 38%), partly shared between the two, so feelings tend to run both ways. Cheerful workers are a little easier to like, grumpy ones a little harder. With 8 workers that's about 4 friendships, 1 good one, 1 pair of frenemies, and enemies in about every other colony.
- **Couples:** lovers and spouses. At world generation, three rounds of romance, each changing the odds for the next: warmer pairs are likelier; every partner someone already has makes another less likely, and so does being monogamous. Becoming lovers warms both sides. Lovers may marry; a pair who only like each other rarely marries without being lovers (about a tenth of marriages).
- **Monogamy** is a hidden disposition, 0 to 1, leaning most people monogamous. Under 40%, a worker is open to more than one partner. A new romance is **above board** if every partner either of them already has is open; otherwise it's a **secret affair** (and a marriage can only happen above board). Each dawn, a monogamous partner may find out: it costs a lot with the one who cheated, and more with the other lover, and the log says so.
- **Families.** Bio parents are only rolled when a worker is created: at world generation (a couple may have a grown child among the workers, or a worker may be the child of one parent alone), or when a newcomer arrives (who may be the grown child of a couple already here: "Ninbin is Tibbi and Hembo's grown child, come to join them"). At most two bio parents, but that's internal: the bio lists parents the same way. **Marriage adds parents, never removes them:** a new spouse becomes a parent of their spouse's children, and a divorce doesn't undo it. **Siblings** are anyone sharing a parent.
- **No incest,** step-relations included: no couple may be family within two generations (parents and children, grandparents, siblings, cousins, aunts, uncles, nieces, nephews), by birth or by marriage. A parent tie that would make an existing couple family isn't added.
- **Each dawn:** couples whose feelings fall under 10% (either side) get a day's grace, then divorce or split up; secrets may come out; new romances and marriages may happen; labels are re-read and changes logged ("Ebbin and Flim have become best friends", "Tibbi and Hembo have married"); parents and children under 10% become **estranged** (and can make up). Relationships rolled at creation aren't logged.
- **What moves feelings:** see §16.6 (built the same session).
- **Their own dice.** The social web rolls from its own random stream (`s.social.rng`), so adding it didn't change a single roll anywhere else in the sim.
- **The worker window** lists them: family and couples first, then friends and foes (closest first), then one-sided feelings (warmest first). Each name is a link to that worker. A blank 64x64 frame holds the portrait's place.
- **To tune in playtests:** about a new couple a week among 20 workers; a few workers in more than one romance after a month. The user expects these numbers to move.

## 16. Roadmap: ideas the user has decided on, not built yet

*Recorded 2026-11-24 (session 4). Claude's suggestions are marked as such.*

### 16.1 Stairs

A fixture for the tower (and two-story houses) that's a faster way up than the ladder. Costs stone and takes longer to build. *Since session 4 the ladder is a fixture the player places (§15.12), so stairs slot in beside it: the same rule (stands in a room, climbs to the floor above), a different cost and speed.* Placeholder art is on the Babel Extras sheet (24×32, one floor tall). *To decide when it's built:* how much faster, whether it replaces the ladder or sits beside it, and its width.

### 16.2 The trader

The supply wagon comes back now and then with new things to trade.

- **Arriving:** it parks in the free space closest to the scriptorium (or a space kept for it at the right edge if the map is full) and announces itself: "A trader from a far-away land has arrived. Select their cart to see what they have to offer." *(Claude's edit of the wording.)*
- **Trading:** clicking the cart opens a trade window. Each offer has a cost in goods and a button that drafts the trade order: "Pulley Lift Plans. Cost: 10 beer [Trade]". The order opens in the scriptorium, the way the tutorial's buttons do.
- **How often** (decided 2026-11-24): the gaps between visits are 4 days, then 6, then 8, then 10, and every 10 after that. Frequent trade gives a boost early on; the late game gets more breathing room. In `tuning.ts`. *To decide:* whether the first gap counts from the start of the game or from the end of the grace period.
- **The trade order is a haul** (decided): "haul beer to cart ×10". CART becomes a place word, the way stores did, so trading uses machinery that already exists, and it can be misread when the words drift. It needs **hauling bread and beer**, which is now built (§15.11).
- **Leaving:** they stay one full day, then go. Pending trade orders hold them **half a day more at most** (decided). When there are alerts (§16.5), a warning goes up before they leave. *Claude's suggestion:* if what was paid falls short when they go, they leave what was delivered by the road.
- **Trade items** get their own art (the user will draw it), shown in the wagon bed the way the patron's supplies are.
- **The right edge** is the road to far-away lands: the trader comes in that way, and pilgrims leave by it. *Done:* it's now 12 tiles wide (it was 8; the wagon is 9), and the placement message says "The road to far-away lands is in the way."

**Hauling bread and beer** (built in session 4). Cooks and brewers still carry what they make straight to the nearest pantry or bar. Hauling is for everything else: moving bread or beer between pantries or bars, emptying one that's being demolished, picking up bread or beer lying on the ground, and, later, paying the trader. Pantries and bars can go in tower rooms too (§15.12), so food can be carried up.

### 16.3 Pilgrimages

Workers can leave by the right edge on a pilgrimage for a set time, and come back knowing something new.

- **What they bring back,** one language per trip: words in a randomly chosen foreign language, or the plans for a random new fixture. A plan is worth 5 words, so a trip under 5 days can't bring back a plan, and a 10-day trip could bring 2 plans, or 1 plan and 5 words of French.
- **The words are the pilgrim's** (decided): they come home knowing them, and TEACH and LEARN spread them, which gives those verbs a job. Pilgrims only add words; they never lose any they knew.
- **Plans go to the player:** the pilgrim delivers any plans to the scriptorium by themselves, without an order.
- **Coming home** gets a fanfare announcement: "Ninbin has returned from their pilgrimage with a Wheelbarrow Plan and has learned 5 new words in French."
- **Claude's suggestions:**
  - **The order** is a scroll line handed to one worker, with the count as the number of days ("go on a pilgrimage ×10").
  - **The cost** is the worker's absence (and maybe their wages while away), which makes long trips a real choice.

### 16.4 About and credits

An About window (System 7 style, under the Babel menu) saying who did what, with the user's acknowledgements. The text is in [CREDITS.md](CREDITS.md).

### 16.5 Alerts

A popup message when something needs the player's attention, with a little sound effect.

- **What raises one,** for example: the patron's favor dropping below 25%, a worker giving notice, the trader about to leave with orders still pending.
- **The buttons:** Acknowledge, Turn Off Warnings for Events of This Type, and Turn Off All Warnings. Closing the window is the same as Acknowledge.
- **Claude's suggestions:**
  - **One alert at a time,** queued, so several at once don't bury each other. An alert of a type that's already waiting isn't added twice.
  - **Somewhere to turn them back on:** a Warnings window (or a section in a Settings window) listing every type with a checkbox, since "turn off all" is easy to click and hard to undo otherwise.
  - **Pausing:** the game already pauses while a dialog is open, so an alert pauses it too. That's probably right for the serious ones; if it gets annoying, minor ones could become a line in the log instead.
  - **The sound** comes with the procedural sound effects on the "later" list: a short System 7 style beep would fit.

### 16.6 Social life: what moves feelings

*The user: drinking together could build bonds; habits (whistling at work, singing or telling stories over a drink) that others nearby have opinions on; bad blood over a taken job, or gratitude for help; jealousy of others' coin, or being impressed by it. "Let's look at all of the things we can already measure or add in cheaply and see how they can be turned into story/character interactions."*

**What the sim already measures**, and what each could become:

| Measured now | Interaction |
|---|---|
| Who's at the bar together (built: +0.5%) | Bonds over drinks. Enemies at the same bar: a chance of a **scuffle** (both lose mood, dislike each other more, it's logged; a friend nearby may break it up). |
| Who eats together (built: +0.25%) | Small bonds; later, tables make it the social hub. |
| **Traits:** cheerful, grumpy (already pull feelings), industrious, lazy, greedy, glutton, sleepyhead, spendthrift, frugal, strong | Industrious workers resent lazy ones seen idling; spendthrifts **buy a round** for friends (warmth, and gold moves); gluttons annoy whoever finds the pantry empty; frugal workers think spendthrifts are fools. |
| **Purse** (the gold each worker holds) | **Jealousy:** greedy workers dislike those much richer, when they're near each other. **Admiration:** frugal ones are impressed. |
| **Jobs:** who reads which notice, who's working the same notice, jobs done | **"Took my job":** a worker heading for a notice that someone else empties first sours on them. **"Thanks for the help":** two on the same notice at once warm to each other (unless one is lazy). |
| **Skills** and knacks | Impressed by the best builder; rivalry between two of a skill. |
| **Lessons** (TEACH and LEARN) | Teacher and student warm to each other: language lessons double as friendship. |
| **Languages:** vocab, drift tongue | **"Only you understand me":** two drifted into the same tongue bond fast. Workers who've lost the common words drift apart. |
| **Height:** working high in the tower | Shared danger bonds (more so with acts of god at height, later). |
| **Sleeping:** in a bed or on the ground, in which building | Bunkmates; sleeping rough together. |
| **Quitting:** notice, leaving | A spouse or best friend leaving hits mood hard, and a spouse may **follow them home**. An enemy leaving cheers a few people up. |
| **Arrivals** | A family reunion moodlet when a grown child arrives. |
| **Mood** | Friends nearby give a small moodlet, enemies a small minus. Newlyweds, divorce, betrayal: moodlets. |

**Cheap to add:**
- **Habits:** 0 to 2 per worker, rolled at creation: whistles while working, sings over a drink, tells stories over a drink, snores, hums, swears at the stones, laughs loudly. Each worker has a lasting **taste** for each habit (loves it, can't stand it, doesn't care), rolled once. Being near the habit at the right moment (work, the bar, sleep) nudges how they feel about whoever has it. The worker window would list a worker's habits.
- **Boastful** and **generous** traits, and a **gossip** trait that makes secrets more likely to come out.
- **A slow drift back toward neutral,** so years of shared meals don't make everyone friends: feelings would fade a little each dawn unless something keeps them up.

**Claude's suggestion for the first pass:** scuffles at the bar, "took my job" and "thanks for the help", jealousy and admiration over purses, habits (whistling, singing, stories, snoring), lessons bonding, friends and enemies nearby as moodlets, and a spouse who may follow a quitter home. Those use what's already measured, and each one makes a log line worth reading.

**Built (session 4), the first pass plus the user's gossip idea.** Numbers in `SOCIAL` (tuning.ts), code in `src/sim/social.ts`:
- **Habits:** none, one or two per worker: whistles at work, sings over a drink, tells stories over a drink, snores. Every worker has a taste for each (−1 to 1), rolled around a lean (stories are mostly liked, snoring mostly not). A dose moves feeling by taste: a job finished whistling (to everyone beside), a song or a story at the bar (to the drinkers beside), a night beside a snorer (when they wake). Shown as dotted chips beside the traits.
- **Over a drink or a meal** (when one finishes): warmth to everyone doing the same beside them (+0.5% drinking, +0.25% eating), their songs and stories, a look at their purses (greedy workers resent one 15+ gold richer, frugal ones admire it), and a moodlet for the company: "Good company: Haftra" (+3) or "Had to put up with Rejun" (−3).
- **Scuffles:** two with bad blood (both dislike, at least one hates) drinking side by side: 30% they come to blows. Both lose mood and like each other less; a friend of either at the bar breaks it up, and whoever they stood with is grateful. Logged.
- **Work:** finishing a notice's last unit records who took it; a worker who turns up to find it gone ("Somebody beat me to it!") sours on them. Two on the same notice warm to each other (an industrious worker resents a lazy one instead). Help is common, so only some of it is remembered.
- **Lessons:** each word taught warms teacher and student.
- **Leaving:** when a worker quits, a spouse may go with them (more likely the more they love them), those fond of them get a sad moodlet, and those who hated them a glad one.
- **Memories:** each worker keeps their latest four social moments, each with a tone: "Rejun snoring all night" (−), "Haftra breaking up the scuffle" (+). The same moment again just freshens it. The worker window lists them under **Lately**.
- **Gossip** (the user's idea): finishing a drink or a meal beside someone, a worker may (30%) tell them their latest moment (not one about the listener, nothing older than two days, nothing they only heard). **A complaint makes the listener take a side, by whom they like better:** siding with the subject sours them on the speaker ("Enbet badmouthing Rejun"); siding with the speaker sours them on the subject and warms them to the speaker. **Praise** warms the listener to its subject, unless they can't stand that person, in which case it's the speaker they think less of. What a listener hears is remembered as "(heard from Enbet)" and isn't passed on again, so a story travels one step. So a good moment between two workers can turn a third against someone, through the web of differing opinions.
- **Affairs** come out by chance (the user: dice are enough). Marriages are public; lovers less so.

**Not built yet:** "only you understand me" (a shared drifted tongue), spendthrifts buying rounds, gluttons and empty pantries, rivalry by skill, shared danger at height, bunkmates, a family reunion moodlet, boastful/generous/gossip traits.

**Keeping the web from saturating (session 4).** A 30-day simulation (`npm run sim:month`) showed that warm moments far outnumber sour ones: with realistic wages, friendships climbed steadily all month with no sign of leveling off; with full purses, workers drank 40 times a day and nearly every pair was best friends within a week. Two fixes, both the user's call:
- **A daily cap on shared time:** drinks, meals, habits and help can move one worker's feeling about another by at most 2% a day, either way. One-off events (scuffles, gossip, lessons, grudges) aren't capped. A pair comes to blows at most once a day.
- **Drift back toward the original feeling** (not toward neutral, the user's preference): each dawn every feeling moves 5% of the way back to how that worker first felt about the other, so events fade over about two weeks unless something keeps them up, and each pair keeps its natural chemistry. Becoming lovers moves the starting point itself; a betrayal moves it half as far as the blow.
- **After the fix:** the average feeling rises from 0.41 to about 0.48 over a month and is leveling off; friends of any kind go from about 17% of pairs to about 27%; frenemies hold at about 6%; enemies thin from 2% to 1%. Watch whether enemies get too rare in long games.

### 15.14 Purses: sending money home, and the bar's price (session 4, 2026-11-24)

*The user: a worker with a full purse sends money home, which cheers them, dents the purse and makes them likelier to take work again. The bar's price can be set: cheap beer is an easy boost to morale; dear beer brings more coin back to the treasury.*

- **Remittances:** at dawn, a worker whose purse holds 40 gold or more sends 60% of it home (frugal: from 25, sending 80%; spendthrift: from 80, sending 40%). The gold leaves the colony for good (`s.sentHome` counts it). They get a moodlet, "Sent 30 gold home", worth 4 plus a little per gold (up to 12) for a day. One log line at dawn lists everyone who sent money.
- **Had their fill:** right after a drink (while its moodlet lasts), the bar appeals much less. Before this, a worker with a full purse would go straight back to the bar and never work.
- **The bar's price:** each bar's window has a Beer price with − and + buttons, from free to 20 gold (usually 5). A cheaper beer cheers more (+1 mood per gold under the usual price, down to +3 at the dearest; free beer is +17) and tempts more (the bar's appeal counts how many beers the purse would buy). Dearer beer brings more of each worker's wages back to the treasury. Changing it is a command, logged.
- **In the 30-day simulation:** workers drink about once a day, do about 9 jobs a day, and send home about 6 to 7 gold a day each. A colony given 400 gold a head on day one sends most of it home within days and keeps working.

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
| **Scribe** | The worker who writes the player's designs onto carriers. Fast in languages they know, slow in others; copying is always fast. |
| **Notice** | An order posted on a board, addressed to Anyone or to a name, with a count of how many times it can be done. |
| **Name** | A worker's unique name. Never lost to drift, always recognized on an order. |
| **Courier** | A worker carrying a bag of carriers to deliver. |
| **Patron** | The funder. Their patience is the difficulty. |
| **Camp** | Everything built on the ground (buildings and fixtures), as opposed to the tower. `[BUILD] [CAMP]` builds it. |
| **Fixture** | Something fixed in place inside a building: bed, oven, pantry, brewing station, bar, stockpile, storage shelves. |

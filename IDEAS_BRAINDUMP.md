# Ideas Brain Dump

Raw idea notes for later integration into the roadmap. Recorded as-is with only obvious typo fixes.

---

## 2026-11-24 — Relationships

We already have relationships on the roadmap in broadly but here's what I was thinking. Every worker has an internal relationship value 0-1 or whatever range you think is best for each other worker. These are randomly rolled at world generation and then updated based on gameplay. At generation workers are then given relationship statuses listed in their bios based on those plus another round of rng.

We have the base sentiment:

- Hates X = under 10%
- Dislikes X = under 30%
- Likes X = 50% or more
- Fond of X = 70% or more
- Adores X = 85% +

> **Clarification (2026-11-24):** X is a placeholder for the name of the worker they feel that way about. The 30%–50% range is an intentional neutral, unlabeled gap. All values are percentages of the 0–1 scale (50% = 0.5).

- Enemies with = mutual hate
- Frenemies with = mixed positive and negative sentiments
- Friends with = mutual Like
- Good friends with = mutually fond of
- Best friends with = mutual Adores

And then at game generation we run another rng based on the initial sentiments to assign other relationship labels of Spouse and Lover and Parent and Child. Spouses are 90% likely to be lovers and must be 50%+ mutual sentiments at the assignment of the relationship status. Spouse status is removed if either falls under 10%. Lovers must have mutual above 10%. Parent child relationships should map consistently but a child can have more than 2 parents since a spouse of a parent is also a parent and workers can have multiple spouses or lovers who are not spouses. Spouse and lover relationships are not capped but probabilities decrease the more accumulate (traits can modify this so at first pass two best friends have a higher chance to become lovers being lovers boost mutual sentiment and increases the chance of them being married and then them having a spouse and lover decreases the chance of them having another spouse or lover but it's still possible). Basically we run several successive rounds with each round impacting the odds for the next one. Children can also have only one parent or no parents. ~~Bio parent/child relationship is permanent but not listed differently than by marriage while parents by marriage can change with new marriages or divorces.~~ *(Partly superseded — new marriages still add parents, divorces no longer remove them; see follow-up.)* All statuses are updated once per day at dawn. Internal sentiments are updated per event as needed (two workers socializing + 0.25%, fight -1%, etc)

> **Clarification (2026-11-24) — supersedes the struck-through parent rule above:** All parent/child relationships are permanent once assigned. Add an **Estranged** status if either party's sentiment toward the other falls under 10%.

### Follow-up (2026-11-24)

Well parents/child by marriage can change but only additively. A new spouse adds a new parent to the child but a divorce doesn't negate that parent child relationship. A child can only have 2 bio parents but that's internal. If 2 workers are lovers there's a chance another worker may be their child. Don't worry about tracking sex/gender for it though. No incest. Also children that share a parent are siblings and I guess we could technically have grandparents and grandchildren and cousins and piblings and niblings but we don't have to track beyond that. The goal is to have a decent percentage of relationship graph overall but unconnected nodes or loosely connected nodes are fine and expected

> **Clarification (2026-11-24):** I mean the graph should have a decent amount of connections overall but we need to find a sweet spot of enough connections to be interesting but not so connected it's hard to understand.

> **Clarification (2026-11-24) — divorce:** Removal of spouse relationship is the divorce and the divorce happens automatically at the threshold with a one day grace period to give a chance to recover.

> **Clarification (2026-11-24) — log entries:** Relationships rolled at world generation don't get log entries but relationship changes during the game do "Ebbin and Flim became best friends" "Tibbi and Hembo have married".

> **Clarification (2026-11-24) — bio relationships:** Bio relationships are only generated at worker creation so at world generation for starters or when a new worker arrives for the first time. So a new worker could arrive later that is the bio child of two other workers but an existing worker can only become someone's child by marriage.

> **Clarification (2026-11-24) — incest:** Probably needs to block step-incest too.

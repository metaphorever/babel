import { log } from './actions';
import { hasWriteLine, scribeLoop } from './carriers';
import { knows, knowsWord } from './drift';
import { LANGS, floorName, langName, type LangId } from './lang';
import { ARRIVALS, PATRON, POPULATION, TIME } from './tuning';
import { dayOf } from './time';
import type { Carrier, SimState } from './types';
import { arriveOnRoad, headcount } from './recruit';
import { sendMoneyHome } from './morale';

// The patron's charter is a standing order nailed to the board:
//
//   IF no one is writing THEN post the scribe loop for Anyone
//
// It's the one conditional order in P0, a preview of what players will be
// able to write later. It means firing your scribe (or losing them) can
// never leave you with no way to write a new one.

export const CHARTER_TEXT = 'IF no one is writing, THEN post [write] [deliver] [repeat] for Anyone';

/** The WRITE word on a carrier, if it has one. */
function writeToken(c: Carrier) {
  return c.orders.find((o) => o[0].t === 'WRITE')?.[0] ?? null;
}

/** Could any worker read this scribe loop? */
function someoneCanRead(s: SimState, c: Carrier): boolean {
  const tok = writeToken(c);
  return !!tok && s.workers.some((w) => !w.leaving && knows(w, tok));
}

/**
 * Is anyone writing, or about to be? Holding a scribe loop only counts if
 * you can still read "write" on it: a scribe whose word for it has drifted
 * away is no scribe at all.
 */
export function someoneIsWriting(s: SimState): boolean {
  for (const w of s.workers) {
    if (w.leaving) continue;
    if (
      w.held.some((c) => {
        const tok = writeToken(c);
        return !!tok && knows(w, tok);
      })
    )
      return true;
    // a scribe loop in the bag of someone who will deliver it
    const delivers = w.held.some((c) => c.orders.some((o) => o[0].t === 'DELIVER'));
    if (delivers && w.bag.some((c) => hasWriteLine(c) && someoneCanRead(s, c))) return true;
  }
  return s.boardScrolls.some((c) => hasWriteLine(c) && someoneCanRead(s, c));
}

/**
 * The language to post a new scribe loop in: the one the most workers can
 * read all three words of. The patron's clerk knows them all.
 */
function bestScribeLanguage(s: SimState): LangId | null {
  let best: LangId | null = null;
  let bestCount = 0;
  for (const l of LANGS) {
    const n = s.workers.filter((w) => !w.leaving && (['WRITE', 'DELIVER', 'REPEAT'] as const).every((t) => knowsWord(w, t, l.id))).length;
    if (n > bestCount) {
      best = l.id;
      bestCount = n;
    }
  }
  return best;
}

export function checkCharter(s: SimState): void {
  // the charter is decreed once the scriptorium and first board stand
  if (!s.charter) return;
  if (s.tick % PATRON.charterCheckTicks !== 0) return;
  if (someoneIsWriting(s)) return;
  const lang = bestScribeLanguage(s);
  if (!lang) return; // nobody left who could read it in any language
  // take down any patron's scribe loop nobody can read before posting a fresh one
  s.boardScrolls = s.boardScrolls.filter((c) => !(c.patron && hasWriteLine(c)));
  s.boardScrolls.push(scribeLoop(s, { kind: 'board', addressee: null }, true, lang));
  log(s, `No one is writing. The patron's charter posts a scribe loop on the board for Anyone${lang === 'en' ? '' : `, in ${langName(lang)}`}.`);
}

// ----------------------------------------------------------- the stipend

/**
 * The patron starts generous and loses patience steadily. Every finished
 * floor wins some back, along with a bonus. The stipend shrinks with
 * patience; at zero it stops. Difficulty is how fast patience drains.
 */
export function updatePatron(s: SimState): void {
  const before = s.patience;
  // the grace period: nothing drains until it's over, or floor 1 is done
  if (inGrace(s)) {
    if (s.tick === s.graceUntil - 1) log(s, "The patron's grace period is over. Their patience will start to wear thin.");
  } else s.patience = Math.max(0, s.patience - PATRON.patienceDrain[s.difficulty]);
  if (before > 0 && s.patience === 0) log(s, 'The patron has run out of patience. No more stipend until the tower grows again.');
  else if (before >= 25 && s.patience < 25) log(s, 'The patron is growing impatient. Finish a level of the tower soon.');

  // the patron pays at dawn
  if (s.tick >= s.nextStipend) {
    s.nextStipend += TIME.dayTicks;
    const pay = currentStipend(s);
    if (pay > 0) {
      s.gold += pay;
      s.income += pay;
    }
    log(s, `Day ${dayOf(s.tick)} dawns.${pay > 0 ? ` The patron pays ${pay} gold.` : ' The patron pays nothing.'}`);
    sendMoneyHome(s);
  }

  if (s.tick >= s.nextArrival) {
    s.nextArrival = s.tick + ARRIVALS.every[s.difficulty];
    const target = Math.min(POPULATION.cap, POPULATION.start + s.floors * ARRIVALS.perFloor);
    if (s.patience >= PATRON.recruitAbove && headcount(s) < target) {
      const w = arriveOnRoad(s);
      log(s, `${w.name} arrived on the road, sent by the patron to work on the tower.`, w.id);
    }
  }
}

/** A floor is done: the patron is pleased. */
export function patronFloorDone(s: SimState, level: number): void {
  s.patience = Math.min(100, s.patience + PATRON.floorPatience);
  const bonus = PATRON.floorBonusBase + PATRON.floorBonusPerLevel * level;
  s.gold += bonus;
  s.income += bonus;
  log(s, `The patron is pleased with ${floorName(level)} and sends ${bonus} gold.`);
}

/** The patron gives the colony a few days to get started (until floor 1 is finished). */
export function inGrace(s: SimState): boolean {
  return s.floors === 0 && s.tick < s.graceUntil;
}

/** Gold per day's stipend at the current patience. */
export function currentStipend(s: SimState): number {
  return Math.round((PATRON.stipendPerDay * s.patience) / 100);
}

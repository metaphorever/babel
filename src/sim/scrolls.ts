import { addMoodlet, letGo, log, moveTo, releaseReservations, settle } from './actions';
import { startActivity, train, workOrder, type Result } from './activities';
import { carrierText, hasWriteLine, lineText, pinCarrier, writingCost } from './carriers';
import { addConfusion, knows, knowsWord } from './drift';
import { ALL, DRIFTABLE, LANGS, conditionText, isSpecialCount, isWorkVerb, langName, orderText, parseOrder, splitUntil, word, type LangId, type Order, type TokenId, type Verb } from './lang';
import { evalCondition, readCondition, statementEnd } from './logic';
import { skillLevel } from './skills';
import { LESSON, MOOD, SCRIBE, TIME } from './tuning';
import { startFloorFromBlueprint, topSpot } from './tower';
import type { Carrier, SimState, Worker } from './types';
import { findSite, spotFor } from './world';
import { lessonWord } from './social';

// A worker holding a card or scroll carries it out line by line; the
// current line is their current job. Needs can still pull them away, but the
// scroll stays in hand and they pick up where they left off. REPEAT loops
// back to the top, which is the only way to keep a worker on a job without
// sending them back to the board each time.

export function activeCarrier(w: Worker): Carrier | null {
  return w.held[0] ?? null;
}

/**
 * Put a card or scroll in a worker's hands. It replaces whatever they were
 * doing: any remembered job, and any scroll they held. That's how you
 * reassign someone, or release a scribe from the scribe loop.
 */
export function giveCarrier(s: SimState, to: Worker, c: Carrier): void {
  const old = to.held[0];
  if (old) log(s, `${to.name} set aside their old ${old.kind}: ${carrierText(old)}.`, to.id);
  c.pc = 0;
  c.lineDone = 0;
  c.waitUntil = 0;
  resetLine(c);
  c.branch = undefined;
  to.held = [c];
  to.memory = null;
  // a released courier leaves undelivered carriers at the scriptorium
  if (to.bag.length > 0 && !c.orders.some((o) => o[0].t === 'DELIVER')) {
    s.outbox.push(...to.bag);
    log(s, `${to.name} left ${to.bag.length} undelivered at the scriptorium.`, to.id);
    to.bag = [];
  }
  releaseReservations(s, to);
  startActivity(to, 'idle');
  to.nextThink = s.tick;
}

export function runScroll(s: SimState, w: Worker): Result {
  const c = activeCarrier(w);
  if (!c) return 'failed';
  if (c.pc >= c.orders.length) return endCarrier(s, w, c);
  const line = c.orders[c.pc];
  const verb = line[0].t as Verb;
  // IF and OTHERWISE have their own rules for a word they can't read
  if (verb === 'IF' || verb === 'OTHERWISE') return branchLine(s, w, c, line);
  // a line they can't read is skipped; work lines are read word by word in workOrder
  if (!isWorkVerb(verb) && !knows(w, line[0])) {
    addConfusion(w, { order: null, guesses: 0 });
    return unreadableLine(s, w, c, line);
  }
  switch (verb) {
    case 'REPEAT':
      // a scroll that is only REPEAT would spin forever
      if (c.pc === 0) return endCarrier(s, w, c);
      c.pc = 0;
      resetLine(c);
      c.branch = undefined;
      c.loops++;
      startActivity(w, 'scroll');
      return 'running';
    case 'CHECK':
      // done with this scroll: head to the board for the next job
      w.thought = 'Off to check the board.';
      removeCarrier(s, w, c);
      startActivity(w, 'readBoard');
      return 'running';
    case 'WRITE':
      return writeLine(s, w);
    case 'DELIVER':
      return deliverLine(s, w);
    case 'TEACH':
    case 'LEARN':
      return lessonLine(s, w, c, verb);
    case 'WAIT':
      return waitLine(s, w, c, line);
    default:
      return untilThenWork(s, w, c, line);
  }
}

/** Starting a line afresh: nothing done on it, nothing checked, no wait under way. */
function resetLine(c: Carrier): void {
  c.lineDone = 0;
  c.checked = false;
  c.waitEnd = undefined;
}

/** Carry on from line `pc` (or finish, past the end). */
function jumpTo(s: SimState, w: Worker, c: Carrier, pc: number): Result {
  c.pc = pc;
  letGo(w);
  resetLine(c);
  if (c.pc >= c.orders.length) return endCarrier(s, w, c);
  startActivity(w, 'scroll');
  return 'running';
}

/** Words on a line that couldn't be read. */
function puzzled(w: Worker, line: Order, words = 1): void {
  if (words > 0) addConfusion(w, { order: line, guesses: words });
}

/**
 * IF: check the condition; if it holds, go on to the line it guards, and if
 * not, skip that line (and any further IFs in a row: two IFs are an AND).
 * OTHERWISE: the line after it runs only if the last IF didn't hold.
 *
 * Drift: an IF they can't read isn't seen as a condition at all, so they do
 * the line anyway. An OTHERWISE they can't read is ignored, so both lines run.
 */
function branchLine(s: SimState, w: Worker, c: Carrier, line: Order): Result {
  if (line[0].t === 'OTHERWISE') {
    if (!knows(w, line[0])) {
      puzzled(w, line);
      return jumpTo(s, w, c, c.pc + 1);
    }
    return jumpTo(s, w, c, c.branch === false ? c.pc + 1 : statementEnd(c.orders, c.pc + 1) + 1);
  }
  let holds: boolean;
  if (!knows(w, line[0])) {
    puzzled(w, line);
    holds = true;
  } else {
    const r = readCondition(w, line.slice(1));
    puzzled(w, line, r.guesses);
    if (r.cond === null) {
      w.thought = "Couldn't make out what to check. I'll just do it.";
      holds = true;
    } else {
      const v = evalCondition(s, w, r.cond);
      if (v === 'looking') return 'running';
      if (v === 'unreachable') {
        w.thought = "Couldn't get over there to look.";
        holds = false;
      } else holds = v;
    }
  }
  c.branch = holds;
  return jumpTo(s, w, c, holds ? c.pc + 1 : statementEnd(c.orders, c.pc + 1) + 1);
}

/**
 * WAIT: stand by, for a number of hours or until a condition holds. Waiting
 * on a store means standing where you can see it. Needs still pull a waiting
 * worker away (the clock keeps running while they eat).
 * Drift: an UNTIL they can't read leaves a plain wait, for the line's count.
 */
function waitLine(s: SimState, w: Worker, c: Carrier, line: Order): Result {
  if (settle(s, w)) return 'running';
  const untilTok = line[1];
  if (untilTok?.t === 'UNTIL' && knows(w, untilTok)) {
    const r = readCondition(w, line.slice(2));
    if (r.cond === null) {
      puzzled(w, line, r.guesses);
      w.thought = "Waiting until... something. I'll stop waiting.";
      return scrollLineDone(s, w, 0, true);
    }
    const v = evalCondition(s, w, r.cond);
    if (v === 'looking') return 'running';
    if (v === 'unreachable') return scrollLineFailed(s, w, "Can't get where I'm meant to wait.");
    if (v) {
      w.thought = 'Done waiting.';
      return scrollLineDone(s, w, 0, true);
    }
    w.thought = `Waiting until ${conditionText(r.cond)}.`;
    return 'running';
  }
  if (c.waitEnd === undefined) {
    if (untilTok?.t === 'UNTIL') puzzled(w, line);
    c.waitEnd = s.tick + c.counts[c.pc] * hourTicks();
  }
  if (s.tick >= c.waitEnd) {
    w.thought = 'Done waiting.';
    return scrollLineDone(s, w, 0, true);
  }
  const left = Math.ceil((c.waitEnd - s.tick) / hourTicks());
  w.thought = `Waiting, ${left} ${left === 1 ? 'hour' : 'hours'} to go.`;
  return 'running';
}

export function hourTicks(): number {
  return TIME.dayTicks / 24;
}

/**
 * A work line with UNTIL: before each unit of work (and before the first),
 * check whether the condition holds yet; once it does, the line is done.
 * A count on the line still caps it. Checking a store can mean a walk.
 * Drift: an UNTIL they can't read is dropped, so they work to the count; an
 * UNTIL whose condition they can't make out counts as met, so they stop.
 */
function untilThenWork(s: SimState, w: Worker, c: Carrier, line: Order): Result {
  const { action, until } = splitUntil(line);
  if (until && !c.checked) {
    const untilTok = line[action.length];
    if (!knows(w, untilTok)) puzzled(w, line);
    else {
      const r = readCondition(w, until);
      puzzled(w, line, r.guesses);
      if (r.cond === null) {
        w.thought = "Can't make out when to stop, so I'll call it done.";
        return scrollLineDone(s, w, 0, true);
      }
      const v = evalCondition(s, w, r.cond);
      if (v === 'looking') return 'running';
      if (v === true) {
        w.thought = `Done: ${conditionText(r.cond)}.`;
        return scrollLineDone(s, w, 0, true);
      }
    }
    c.checked = true;
  }
  return workOrder(s, w, action);
}

/**
 * Some units of the current line are done: pay for them, and move to the
 * next line once the line's count is reached (or straight away if `finish`).
 */
export function scrollLineDone(s: SimState, w: Worker, units: number, finish = false): Result {
  const c = activeCarrier(w)!;
  const pay = c.wage * units;
  if (pay > 0) {
    if (s.gold - s.reserved >= pay) {
      s.gold -= pay;
      w.purse += pay;
      addMoodlet(s, w, 'paid', `Paid ${pay} gold`, MOOD.gotPaid.value, MOOD.gotPaid.ticks);
    } else {
      addMoodlet(s, w, 'unpaid', 'Treasury was empty', -6, MOOD.missedJobTicks);
      log(s, `No gold to pay ${w.name} for "${lineText(c, c.pc)}".`, w.id);
    }
  }
  if (units > 0) w.jobsDone++;
  c.lineDone += units;
  // the next unit starts with a fresh look at any UNTIL
  if (units > 0) c.checked = false;
  const target = c.counts[c.pc];
  if (finish || (!isSpecialCount(target) && c.lineDone >= target)) {
    c.pc++;
    resetLine(c);
    // a cart is let go of at the end of the line that used it
    letGo(w);
  }
  if (c.pc >= c.orders.length) return endCarrier(s, w, c);
  startActivity(w, 'scroll');
  return 'running';
}

/** A line couldn't be done: skip it, take a breather, carry on later. */
export function scrollLineFailed(s: SimState, w: Worker, why: string): Result {
  const c = activeCarrier(w)!;
  w.thought = why;
  log(s, `${w.name} skipped "${lineText(c, c.pc)}": ${why}`, w.id);
  addMoodlet(s, w, 'failed', "Couldn't do a line on my scroll", MOOD.failedJob.value, MOOD.failedJob.ticks);
  c.pc++;
  resetLine(c);
  letGo(w);
  c.waitUntil = s.tick + SCRIBE.lineRetryTicks;
  if (c.pc >= c.orders.length) return endCarrier(s, w, c);
  return 'failed';
}

function endCarrier(s: SimState, w: Worker, c: Carrier): Result {
  removeCarrier(s, w, c);
  return 'done';
}

function removeCarrier(s: SimState, w: Worker, c: Carrier): void {
  w.held = w.held.filter((x) => x !== c);
  log(s, `${w.name} finished a ${c.kind}: ${carrierText(c)}.`, w.id);
}

// ------------------------------------------------------------------ WRITE

function delivers(c: Carrier): boolean {
  return c.orders.some((o) => o[0].t === 'DELIVER');
}

function writeSpeed(w: Worker): number {
  return 1 + skillLevel(w, 'writing') * SCRIBE.speedPerLevel;
}

/**
 * Sit at the scriptorium desk and write out the next design in the queue.
 * With nothing queued, the scribe waits at the desk.
 */
function writeLine(s: SimState, w: Worker): Result {
  const a = w.activity;
  const desk = findSite(s, 'scriptorium');
  if (!desk) return scrollLineFailed(s, w, 'There is no scriptorium yet.');
  if (a.stage === 0) {
    w.thought = 'Off to the scriptorium.';
    const m = moveTo(s, w, spotFor(desk, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return scrollLineFailed(s, w, "Can't reach the scriptorium.");
    a.stage = 1;
  }
  let d = s.designs.find((x) => x.claimedBy === w.id);
  if (!d) {
    if (delivers(activeCarrier(w)!) && w.bag.length >= SCRIBE.bagSize) return scrollLineFailed(s, w, 'My bag is full.');
    d = s.designs.find((x) => x.claimedBy === null);
    if (!d) {
      // nothing to write, but things waiting to go out: move on to delivering
      if (delivers(activeCarrier(w)!) && (w.bag.some((b) => b.retryAfter <= s.tick) || s.outbox.length > 0)) return scrollLineDone(s, w, 0, true);
      // "write all": the queue is empty, so this line is done
      if (activeCarrier(w)!.counts[activeCarrier(w)!.pc] === ALL) return scrollLineDone(s, w, 0, true);
      w.thought = 'Nothing to write. Waiting at the desk.';
      return 'running';
    }
    d.claimedBy = w.id;
  }
  w.thought = `Writing: ${carrierText(d.carrier)}.`;
  // words the scribe doesn't know have to be spelled out for them: much slower
  d.progress += writeSpeed(w) * (writingCost(d.carrier) / writingCostFor(d.carrier, w));
  if (d.progress < d.cost) return 'running';
  s.designs = s.designs.filter((x) => x !== d);
  // a scribe who also delivers keeps it in their bag; a pure writer leaves it in the outbox
  if (delivers(activeCarrier(w)!)) w.bag.push(d.carrier);
  else s.outbox.push(d.carrier);
  train(s, w, 'writing');
  return scrollLineDone(s, w, 1);
}

// ---------------------------------------------------------------- DELIVER

/**
 * Carry everything in the bag to where it's going: pin things on the board,
 * hand cards and scrolls to workers by name. If the bag is empty but the
 * scriptorium's outbox isn't, fetch from there first. activity.timer counts
 * deliveries this time round, which is what the line pays for.
 */
function deliverLine(s: SimState, w: Worker): Result {
  const a = w.activity;
  const c = w.bag.find((b) => b.retryAfter <= s.tick);
  if (!c) {
    const desk = findSite(s, 'scriptorium');
    if (s.outbox.length > 0 && w.bag.length < SCRIBE.bagSize && desk) {
      w.thought = 'Collecting from the scriptorium outbox.';
      const m = moveTo(s, w, spotFor(desk, w.id));
      if (m === 'moving') return 'running';
      while (s.outbox.length > 0 && w.bag.length < SCRIBE.bagSize) w.bag.push(s.outbox.shift()!);
      return 'running';
    }
    // a dedicated courier (no writing to do) waits at the scriptorium for work
    if (a.timer === 0 && w.bag.length === 0 && !hasWriteLine(activeCarrier(w)!) && desk) {
      w.thought = 'Waiting at the scriptorium for something to deliver.';
      moveTo(s, w, spotFor(desk, w.id));
      return 'running';
    }
    if (a.timer === 0) w.thought = w.bag.length ? 'Nobody can take these yet.' : 'Nothing to deliver.';
    return scrollLineDone(s, w, a.timer, true);
  }
  if (c.dest.kind === 'board') {
    w.thought = 'Taking something to the board.';
    const board = findSite(s, 'board');
    const m = board ? moveTo(s, w, spotFor(board, w.id)) : 'unreachable';
    if (m === 'moving') return 'running';
    if (m === 'unreachable') {
      c.retryAfter = s.tick + SCRIBE.retryTicks;
      return 'running';
    }
    w.bag = w.bag.filter((x) => x !== c);
    pinCarrier(s, c);
    a.timer++;
    log(s, `${w.name} pinned up: ${carrierText(c)}.`, w.id);
    return 'running';
  }
  if (c.dest.kind === 'tower') {
    // blueprints are carried all the way up to the top finished floor
    w.thought = 'Carrying a blueprint up the tower.';
    const m = s.tower ? moveTo(s, w, topSpot(s)) : 'unreachable';
    if (m === 'moving') return 'running';
    if (m === 'unreachable') {
      c.retryAfter = s.tick + SCRIBE.retryTicks;
      return 'running';
    }
    w.bag = w.bag.filter((x) => x !== c);
    a.timer++;
    log(s, `${w.name} carried a blueprint to the top of the tower.`, w.id);
    startFloorFromBlueprint(s);
    return 'running';
  }
  const dest = c.dest;
  const to = s.workers.find((x) => x.id === dest.workerId);
  if (!to) {
    w.bag = w.bag.filter((x) => x !== c);
    log(s, `${w.name} threw away a ${c.kind}: its reader is gone.`, w.id);
    return 'running';
  }
  const close = to === w || (to.y === w.y && Math.abs(to.x - w.x) <= SCRIBE.handRange);
  if (!close) {
    // everyone recognizes their own name, so the courier just has to get near
    w.thought = `Looking for ${to.name}.`;
    const m = moveTo(s, w, { x: to.x, y: to.y });
    if (m === 'unreachable') c.retryAfter = s.tick + SCRIBE.retryTicks;
    return 'running';
  }
  w.bag = w.bag.filter((x) => x !== c);
  a.timer++;
  log(s, to === w ? `${w.name} kept a ${c.kind} for themself: ${carrierText(c)}.` : `${w.name} handed ${to.name} a ${c.kind}: ${carrierText(c)}.`, w.id);
  giveCarrier(s, to, c);
  // handing yourself a new order replaces this very scroll
  return to === w ? 'done' : 'running';
}

// --------------------------------------------------------- TEACH and LEARN

/** A scribe's cost to write this, given which words they know. */
export function writingCostFor(c: Carrier, w: Worker): number {
  if (c.kind === 'blueprint') return writingCost(c);
  let cost = SCRIBE.baseCost;
  for (const o of c.orders) for (const tok of o) cost += SCRIBE.perToken * (knows(w, tok) ? 1 : SCRIBE.unknownWordMult);
  return cost;
}

/** Languages a worker knows well enough (5+ words) to help them teach. */
function languagesKnown(w: Worker): number {
  return LANGS.filter((l) => (w.vocab[l.id]?.length ?? 0) >= 5).length;
}

/** The next word one worker could pass to another, common tongue first. */
function nextWord(from: Worker, to: Worker, onlyForeign: boolean): { t: TokenId; lang: LangId } | null {
  for (const l of LANGS) {
    if (onlyForeign && l.id === 'en') continue;
    for (const t of DRIFTABLE) if (knowsWord(from, t, l.id) && !knowsWord(to, t, l.id)) return { t, lang: l.id };
  }
  return null;
}

/** The translator running a TEACH or LEARN line that names this worker, if any. */
export function lessonFor(s: SimState, student: Worker): Worker | null {
  for (const t of s.workers) {
    if (t === student || t.activity.kind !== 'scroll' || t.activity.stage < 1) continue;
    const c = t.held[0];
    const line = c?.orders[c.pc];
    if (!line || (line[0].t !== 'TEACH' && line[0].t !== 'LEARN')) continue;
    if (parseOrder(line).who === student.id) return t;
  }
  return null;
}

function close(a: Worker, b: Worker): boolean {
  return a.y === b.y && Math.abs(a.x - b.x) <= 2;
}

/**
 * Translation happens at the scriptorium, on the ground. The translator
 * calls the student by name (anyone on the ground hears their name) and
 * they sit together, one word at a time.
 *
 * TEACH passes the translator's words to the student, common tongue first:
 * that's how you bring a drifted worker back. LEARN goes the other way: the
 * translator picks up the student's foreign words, and every word they learn
 * is one you can now write in that language.
 */
function lessonLine(s: SimState, w: Worker, c: Carrier, verb: 'TEACH' | 'LEARN'): Result {
  const a = w.activity;
  const who = parseOrder(c.orders[c.pc]).who;
  const student = s.workers.find((x) => x.id === who);
  if (!student || student === w) return scrollLineFailed(s, w, 'Who am I meant to be teaching?');
  if (a.stage === 0) {
    w.thought = 'Off to the scriptorium for a lesson.';
    const desk = findSite(s, 'scriptorium');
    if (!desk) return scrollLineFailed(s, w, 'There is no scriptorium yet.');
    const m = moveTo(s, w, spotFor(desk, w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return scrollLineFailed(s, w, "Can't reach the scriptorium.");
    a.stage = 1;
    a.timer = 0;
    a.ref = 0;
  }
  const done = a.ref ?? 0;
  const pair = verb === 'TEACH' ? nextWord(w, student, false) : nextWord(student, w, true);
  const limit = c.counts[c.pc];
  if (!pair || (!isSpecialCount(limit) && done >= limit)) {
    w.thought = done > 0 ? `Lesson done: ${done} ${done === 1 ? 'word' : 'words'}.` : `Nothing to ${verb === 'TEACH' ? 'teach' : 'learn from'} ${student.name}.`;
    return scrollLineDone(s, w, done, true);
  }
  if (!close(w, student)) {
    w.thought = `Calling for ${student.name}.`;
    return 'running';
  }
  w.thought = verb === 'TEACH' ? `Teaching ${student.name}.` : `Learning from ${student.name}.`;
  a.timer += 1 + languagesKnown(w) * LESSON.speedPerLanguage;
  if (a.timer < LESSON.perWord) return 'running';
  a.timer -= LESSON.perWord;
  a.ref = done + 1;
  lessonWord(s, verb === 'TEACH' ? w : student, verb === 'TEACH' ? student : w);
  if (verb === 'TEACH') {
    student.vocab[pair.lang] = [...(student.vocab[pair.lang] ?? []), pair.t];
    log(s, `${w.name} taught ${student.name} «${word({ t: pair.t, lang: pair.lang })}».`, w.id);
  } else {
    w.vocab[pair.lang] = [...(w.vocab[pair.lang] ?? []), pair.t];
    const lex = s.lexicon[pair.lang] ?? [];
    if (!lex.includes(pair.t)) {
      s.lexicon[pair.lang] = [...lex, pair.t];
      log(s, `${w.name} learned «${word({ t: pair.t, lang: pair.lang })}» (${word({ t: pair.t, lang: 'en' })}) from ${student.name}. You can now write it in ${langName(pair.lang)}.`, w.id);
    }
  }
  return 'running';
}

/** The student's side: come to the scriptorium and sit with the translator while called. */
export function attendLesson(s: SimState, w: Worker): Result {
  const teacher = lessonFor(s, w);
  if (!teacher) return 'done';
  w.thought = `${teacher.name} is calling me.`;
  if (close(w, teacher)) return 'running';
  const m = moveTo(s, w, { x: teacher.x + (teacher.x > 0 ? -1 : 1), y: teacher.y });
  return m === 'unreachable' ? 'failed' : 'running';
}

/**
 * A line the holder can't read. They skip it, and if they keep hitting
 * lines they can't read, they give up on the scroll altogether rather than
 * stew in confusion: they set it aside, leave anything undelivered at the
 * scriptorium, and go back to the board like anyone else.
 */
export function unreadableLine(s: SimState, w: Worker, c: Carrier, line: Order): Result {
  c.strikes++;
  if (c.strikes >= SCRIBE.giveUpAfter) {
    w.held = w.held.filter((x) => x !== c);
    if (w.bag.length > 0) {
      s.outbox.push(...w.bag);
      w.bag = [];
    }
    w.thought = "I can't make sense of this anymore.";
    log(s, `${w.name} gave up on their ${c.kind}: they can't read «${orderText(line)}» anymore.`, w.id);
    return 'failed';
  }
  return scrollLineFailed(s, w, `Can't read this line: «${orderText(line)}».`);
}

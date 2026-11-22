import { addMoodlet, log, moveTo, releaseReservations } from './actions';
import { startActivity, train, workOrder, type Result } from './activities';
import { carrierText, hasWriteLine, lineText, pinCarrier, writingCost } from './carriers';
import { addConfusion, knows, knowsWord } from './drift';
import { DRIFTABLE, LANGS, isWorkVerb, langName, orderText, parseOrder, word, type LangId, type TokenId, type Verb } from './lang';
import { skillLevel } from './skills';
import { LESSON, MOOD, SCRIBE } from './tuning';
import { startFloorFromBlueprint, topSpot } from './tower';
import type { Carrier, SimState, Worker } from './types';
import { siteOf, spotFor } from './world';

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
  // a line they can't read is skipped; work lines are read word by word in workOrder
  if (!isWorkVerb(verb) && !knows(w, line[0])) {
    addConfusion(w, { order: null, guesses: 0 });
    return scrollLineFailed(s, w, `Can't read this line: «${orderText(line)}».`);
  }
  switch (verb) {
    case 'REPEAT':
      // a scroll that is only REPEAT would spin forever
      if (c.pc === 0) return endCarrier(s, w, c);
      c.pc = 0;
      c.lineDone = 0;
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
    default:
      return workOrder(s, w, line);
  }
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
  if (finish || c.lineDone >= c.counts[c.pc]) {
    c.pc++;
    c.lineDone = 0;
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
  c.lineDone = 0;
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
  const desk = siteOf(s, 'scriptorium');
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
    if (s.outbox.length > 0 && w.bag.length < SCRIBE.bagSize) {
      w.thought = 'Collecting from the scriptorium outbox.';
      const m = moveTo(s, w, spotFor(siteOf(s, 'scriptorium'), w.id));
      if (m === 'moving') return 'running';
      while (s.outbox.length > 0 && w.bag.length < SCRIBE.bagSize) w.bag.push(s.outbox.shift()!);
      return 'running';
    }
    // a dedicated courier (no writing to do) waits at the scriptorium for work
    if (a.timer === 0 && w.bag.length === 0 && !hasWriteLine(activeCarrier(w)!)) {
      w.thought = 'Waiting at the scriptorium for something to deliver.';
      moveTo(s, w, spotFor(siteOf(s, 'scriptorium'), w.id));
      return 'running';
    }
    if (a.timer === 0) w.thought = w.bag.length ? 'Nobody can take these yet.' : 'Nothing to deliver.';
    return scrollLineDone(s, w, a.timer, true);
  }
  if (c.dest.kind === 'board') {
    w.thought = 'Taking something to the board.';
    const m = moveTo(s, w, spotFor(siteOf(s, 'board'), w.id));
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
    const m = moveTo(s, w, topSpot(s));
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
    const m = moveTo(s, w, spotFor(siteOf(s, 'scriptorium'), w.id));
    if (m === 'moving') return 'running';
    if (m === 'unreachable') return scrollLineFailed(s, w, "Can't reach the scriptorium.");
    a.stage = 1;
    a.timer = 0;
    a.ref = 0;
  }
  const done = a.ref ?? 0;
  const pair = verb === 'TEACH' ? nextWord(w, student, false) : nextWord(student, w, true);
  if (!pair || done >= c.counts[c.pc]) {
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

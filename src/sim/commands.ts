import { log } from './actions';
import { boardReserve, cancelDesign, carrierText, destText, newBlueprint, newCarrier, queueDesign } from './carriers';
import { ALL, FOREVER, allowsAll, allowsForever, isSpecialCount, isValidLine, langName, makeOrder, takesPlaces, takesWho, type LangId, type Noun, type Place, type Verb } from './lang';
import { SCRIBE, TOWER } from './tuning';
import type { Dest, SimState } from './types';

// Every player action is a command. The sim applies commands at the start of
// a tick, so the same seed plus the same command log always replays the same
// game. playerId is carried now so multiplayer stays possible later.
//
// The player never changes the world directly. Composing an order only adds
// a design to the scriptorium's writing queue; a scribe has to write it and
// someone has to carry it before it does anything.

export interface ComposeLine {
  verb: Verb;
  noun: Noun | null;
  /** Who to teach or learn from (TEACH / LEARN only). */
  who?: number | null;
  /** Where from and where to (hauling only). */
  from?: Place | null;
  to?: Place | null;
  /** Units to finish before moving to the next line (the notice count, for a notice). */
  count: number;
}

export type Command =
  | {
      type: 'compose';
      playerId: number;
      lines: ComposeLine[];
      wage: number;
      dest: Dest;
      /** The language it's written in. Only words in your lexicon can be used. */
      lang?: LangId;
    }
  | { type: 'cancelDesign'; playerId: number; designId: number }
  | { type: 'removeNotice'; playerId: number; noticeId: number }
  | { type: 'takeDown'; playerId: number; carrierId: number }
  | { type: 'blueprint'; playerId: number };

export interface StampedCommand {
  tick: number;
  cmd: Command;
}

export type CommandResult = { ok: true } | { ok: false; error: string };

export function availableGold(s: SimState): number {
  return s.gold - s.reserved;
}

/** Lines whose count means nothing (they're control words). */
function countless(verb: Verb): boolean {
  return verb === 'REPEAT' || verb === 'CHECK';
}

function buildCarrier(s: SimState, cmd: Extract<Command, { type: 'compose' }>, dryRun = false) {
  const lines = cmd.lines.map((l) => {
    const who = l.who !== undefined && l.who !== null ? { id: l.who, name: s.workers.find((w) => w.id === l.who)?.name ?? '?' } : null;
    return { order: makeOrder(l.verb, l.noun, { from: l.from, to: l.to, who }, cmd.lang ?? 'en'), count: countless(l.verb) ? 1 : l.count };
  });
  if (dryRun) {
    // a throwaway carrier for checking words; don't use up an id
    const id = s.nextId;
    const c = newCarrier(s, lines, cmd.wage, cmd.dest);
    s.nextId = id;
    return c;
  }
  return newCarrier(s, lines, cmd.wage, cmd.dest);
}

export function validateCommand(s: SimState, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'compose': {
      if (cmd.lines.length < 1) return { ok: false, error: 'Write at least one line.' };
      if (cmd.lines.length > SCRIBE.maxLines) return { ok: false, error: `A scroll holds at most ${SCRIBE.maxLines} lines.` };
      for (const l of cmd.lines) {
        if (!isValidLine(l.verb, l.noun)) return { ok: false, error: 'One of the lines makes no sense.' };
        if (l.count === ALL && !allowsAll(l.verb)) return { ok: false, error: `"All" doesn't work for ${l.verb.toLowerCase()}: it never runs out.` };
        if (l.count === FOREVER && !allowsForever(l.verb)) return { ok: false, error: `"Forever" doesn't work for ${l.verb.toLowerCase()}.` };
        if (!countless(l.verb) && !isSpecialCount(l.count) && (!Number.isInteger(l.count) || l.count < 1 || l.count > 999)) return { ok: false, error: 'Counts must be 1 to 999, all, or forever.' };
        const places = [l.from, l.to].filter((p): p is Place => p !== undefined && p !== null);
        if (places.length > 0 && !takesPlaces(l.verb)) return { ok: false, error: `"${l.verb.toLowerCase()}" doesn't take a from or to.` };
        if (places.some((p) => !Number.isInteger(p) || p < 0 || p > TOWER.maxFloors)) return { ok: false, error: 'No such floor.' };
        if (l.from !== undefined && l.from !== null && l.from === l.to) return { ok: false, error: 'From and to are the same place.' };
      }
      if (cmd.lines[0].verb === 'REPEAT') return { ok: false, error: 'Repeat what? Put it after the lines to repeat.' };
      for (const l of cmd.lines) {
        if (takesWho(l.verb) && (l.who === undefined || l.who === null || !s.workers.some((w) => w.id === l.who))) return { ok: false, error: 'Teach or learn from whom?' };
      }
      // you can only write words you know in that language
      const lang = cmd.lang ?? 'en';
      const lex = s.lexicon[lang] ?? [];
      for (const tok of buildCarrier(s, cmd, true).orders.flat()) {
        if (tok.t !== 'WHO' && !lex.includes(tok.t)) return { ok: false, error: `You don't know how to write «${tok.t.toLowerCase()}» in ${langName(lang)} yet.` };
      }
      if (!Number.isInteger(cmd.wage) || cmd.wage < 0 || cmd.wage > 50) return { ok: false, error: 'Wage must be 0 to 50.' };
      if (cmd.dest.kind === 'tower') return { ok: false, error: 'Only blueprints go to the top of the tower.' };
      const who = cmd.dest.kind === 'board' ? cmd.dest.addressee : cmd.dest.workerId;
      if (who !== null && !s.workers.some((w) => w.id === who)) return { ok: false, error: 'Who is it for?' };
      // what it would promise up front (only notices do)
      const promise = cmd.dest.kind === 'board' && cmd.lines.length === 1 && !['WRITE', 'DELIVER', 'REPEAT', 'CHECK', 'TEACH', 'LEARN'].includes(cmd.lines[0].verb) && !isSpecialCount(cmd.lines[0].count) ? cmd.lines[0].count * cmd.wage : 0;
      if (promise > availableGold(s)) return { ok: false, error: `Needs ${promise} gold; only ${availableGold(s)} available.` };
      return { ok: true };
    }
    case 'cancelDesign':
      if (!s.designs.some((d) => d.id === cmd.designId)) return { ok: false, error: 'Already written.' };
      return { ok: true };
    case 'removeNotice':
      if (!s.notices.some((n) => n.id === cmd.noticeId)) return { ok: false, error: 'No such notice.' };
      return { ok: true };
    case 'takeDown':
      if (!s.boardScrolls.some((c) => c.id === cmd.carrierId)) return { ok: false, error: 'Somebody already took it.' };
      return { ok: true };
    case 'blueprint': {
      const planned = s.floors + s.projects.length + s.designs.filter((d) => d.carrier.kind === 'blueprint').length;
      if (planned >= TOWER.maxFloors) return { ok: false, error: 'The tower is as tall as this world allows.' };
      return { ok: true };
    }
  }
}

export function applyCommand(s: SimState, cmd: Command): CommandResult {
  const v = validateCommand(s, cmd);
  if (!v.ok) return v;
  switch (cmd.type) {
    case 'compose': {
      const c = buildCarrier(s, cmd);
      // a notice's wages are set aside now and paid as the work is done
      s.reserved += boardReserve(c);
      queueDesign(s, c);
      log(s, `Sent to the scriptorium: a ${c.kind} for ${destText(s, c.dest)}: ${carrierText(c)}.`);
      break;
    }
    case 'cancelDesign':
      cancelDesign(s, cmd.designId);
      break;
    case 'removeNotice': {
      // Simplification for P0: the ground board is right outside the
      // scriptorium, so taking a notice down is immediate.
      const n = s.notices.find((x) => x.id === cmd.noticeId)!;
      s.reserved -= n.remaining * n.wage;
      s.notices = s.notices.filter((x) => x.id !== n.id);
      log(s, 'Took down a notice.');
      break;
    }
    case 'takeDown':
      s.boardScrolls = s.boardScrolls.filter((c) => c.id !== cmd.carrierId);
      log(s, 'Took down a scroll from the board.');
      break;
    case 'blueprint': {
      // a drawing for the next floor; a courier has to carry it to the top
      queueDesign(s, newBlueprint(s));
      log(s, 'Sent to the scriptorium: a blueprint for the next floor.');
      break;
    }
  }
  return { ok: true };
}

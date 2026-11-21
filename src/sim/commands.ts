import { log } from './actions';
import { boardReserve, cancelDesign, carrierText, newCarrier, queueDesign } from './carriers';
import { isValidJob, isValidLine, makeOrder, type Noun, type Verb, type WorkVerb } from './lang';
import { SCRIBE } from './tuning';
import type { SimState } from './types';

// Every player action is a command. The sim applies commands at the start of
// a tick, so the same seed plus the same command log always replays the same
// game. playerId is carried now so multiplayer stays possible later.
//
// The player never changes the world directly. Posting a notice or sending
// a scroll only adds a design to the scriptorium's writing queue; a scribe
// has to write it and someone has to carry it before it does anything.

export interface ScrollLine {
  verb: Verb;
  noun: Noun | null;
}

export type Command =
  | {
      type: 'postNotice';
      playerId: number;
      verb: WorkVerb;
      noun: Noun;
      count: number;
      wage: number;
      addressee: number | null;
    }
  | {
      type: 'sendScroll';
      playerId: number;
      lines: ScrollLine[];
      wage: number;
      to: number;
    }
  | { type: 'cancelDesign'; playerId: number; designId: number }
  | { type: 'removeNotice'; playerId: number; noticeId: number };

export interface StampedCommand {
  tick: number;
  cmd: Command;
}

export type CommandResult = { ok: true } | { ok: false; error: string };

export function availableGold(s: SimState): number {
  return s.gold - s.reserved;
}

export function validateCommand(s: SimState, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'postNotice': {
      if (!isValidJob(cmd.verb, cmd.noun)) return { ok: false, error: `Can't ${cmd.verb.toLowerCase()} ${cmd.noun.toLowerCase()}.` };
      if (!Number.isInteger(cmd.count) || cmd.count < 1 || cmd.count > 999) return { ok: false, error: 'Count must be 1 to 999.' };
      if (!Number.isInteger(cmd.wage) || cmd.wage < 0 || cmd.wage > 50) return { ok: false, error: 'Wage must be 0 to 50.' };
      if (cmd.addressee !== null && !s.workers.some((w) => w.id === cmd.addressee)) return { ok: false, error: 'No such worker.' };
      const cost = cmd.count * cmd.wage;
      if (cost > availableGold(s)) return { ok: false, error: `Needs ${cost} gold; only ${availableGold(s)} available.` };
      return { ok: true };
    }
    case 'sendScroll': {
      if (cmd.lines.length < 1) return { ok: false, error: 'Write at least one line.' };
      if (cmd.lines.length > SCRIBE.maxLines) return { ok: false, error: `A scroll holds at most ${SCRIBE.maxLines} lines.` };
      for (const l of cmd.lines) if (!isValidLine(l.verb, l.noun)) return { ok: false, error: 'That line makes no sense.' };
      if (!Number.isInteger(cmd.wage) || cmd.wage < 0 || cmd.wage > 50) return { ok: false, error: 'Wage must be 0 to 50.' };
      if (!s.workers.some((w) => w.id === cmd.to)) return { ok: false, error: 'Who is it for?' };
      return { ok: true };
    }
    case 'cancelDesign':
      if (!s.designs.some((d) => d.id === cmd.designId)) return { ok: false, error: 'Already written.' };
      return { ok: true };
    case 'removeNotice':
      if (!s.notices.some((n) => n.id === cmd.noticeId)) return { ok: false, error: 'No such notice.' };
      return { ok: true };
  }
}

export function applyCommand(s: SimState, cmd: Command): CommandResult {
  const v = validateCommand(s, cmd);
  if (!v.ok) return v;
  switch (cmd.type) {
    case 'postNotice': {
      const c = newCarrier(s, [makeOrder(cmd.verb, cmd.noun)], cmd.wage, { kind: 'board', count: cmd.count, addressee: cmd.addressee });
      // gold is reserved when the order is issued and paid as the work is done
      s.reserved += boardReserve(c);
      queueDesign(s, c);
      log(s, `Sent to the scriptorium: ${carrierText(c)} ×${cmd.count} @ ${cmd.wage}g, for the board.`);
      break;
    }
    case 'sendScroll': {
      const orders = cmd.lines.map((l) => makeOrder(l.verb, l.noun));
      const c = newCarrier(s, orders, cmd.wage, { kind: 'worker', workerId: cmd.to });
      queueDesign(s, c);
      const name = s.workers.find((w) => w.id === cmd.to)!.name;
      log(s, `Sent to the scriptorium: a ${c.kind} for ${name}: ${carrierText(c)}.`);
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
      log(s, `Took down a notice.`);
      break;
    }
  }
  return { ok: true };
}

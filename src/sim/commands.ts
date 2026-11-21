import { log } from './actions';
import { isValidJob, makeOrder, orderText, type Noun, type Verb } from './lang';
import type { SimState } from './types';

// Every player action is a command. The sim applies commands at the start of
// a tick, so the same seed plus the same command log always replays the same
// game. playerId is carried now so multiplayer stays possible later.

export type Command =
  | {
      type: 'postNotice';
      playerId: number;
      verb: Verb;
      noun: Noun;
      count: number;
      wage: number;
      addressee: number | null;
    }
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
      const order = makeOrder(cmd.verb, cmd.noun);
      s.notices.push({
        id: s.nextId++,
        order,
        remaining: cmd.count,
        wage: cmd.wage,
        addressee: cmd.addressee,
        postedTick: s.tick,
      });
      // gold is reserved when the order is issued and paid on completion
      s.reserved += cmd.count * cmd.wage;
      const to = cmd.addressee === null ? 'Anyone' : s.workers.find((w) => w.id === cmd.addressee)!.name;
      log(s, `Posted: ${orderText(order)} ×${cmd.count} @ ${cmd.wage}g, for ${to}.`);
      break;
    }
    case 'removeNotice': {
      const n = s.notices.find((x) => x.id === cmd.noticeId)!;
      s.reserved -= n.remaining * n.wage;
      s.notices = s.notices.filter((x) => x.id !== n.id);
      log(s, `Took down: ${orderText(n.order)}.`);
      break;
    }
  }
  return { ok: true };
}

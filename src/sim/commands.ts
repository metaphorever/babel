import { log } from './actions';
import { cancelDesign, carrierText, destText, newBlueprint, newCarrier, newLetter, queueDesign, upfrontReserve } from './carriers';
import { ALL, FOREVER, GOODS, STATE_WORDS, allowsAll, allowsForever, condRule, isSpecialCount, isStoreWord, isVehicleWord, isWorkVerb, takesWithin, isValidLine, type Condition, langName, makeOrder, placeKey, placeName, FIXTURE_WORDS, FIXTURE_WORD_KIND, STORES_FOR, takesPlaces, takesWho, type LangId, type Noun, type Place, type Verb } from './lang';

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
import { ALERTS, BONUS, BUILD, ECONOMY, LOGIC, SCRIBE, TOWER } from './tuning';
import { setAlertLine } from './alerts';
import { branchError } from './logic';
import { recruitError, recruitWorker } from './recruit';
import { ITEM_TYPES, type Dest, type ItemType, type SimState } from './types';
import { applyDemolish, applyPlace, applyRename, applyRenameFixture, validateDemolish, validatePlace, validateRename, validateRenameFixture, type DemolishTarget, type PlaceRequest } from './build';

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
  /** One planned build to work on, in place of the object (BUILD only): a building, a fixture, or a tower level. */
  target?: Place | null;
  /** "build fixtures in …": the camp, the tower, a level, or a building by name. */
  within?: Place | null;
  /** "… using cart 1": a wheelbarrow or cart to haul with (by number or name). */
  using?: Place | null;
  /** IF's condition (required), WAIT's "until" (instead of a count of hours), or a work line's UNTIL clause. */
  cond?: Condition | null;
  /** Units to finish before moving to the next line (the notice count, for a notice; hours, for WAIT). */
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
  | { type: 'blueprint'; playerId: number }
  /** A bonus for one worker: a scribe writes the letter (the gold leaves the treasury then) and a courier hands it over. */
  | { type: 'bonus'; playerId: number; workerId: number; gold: number }
  /** Hire a worker now (§16.9 step 4): no order; the fee (recruitFee) leaves the treasury at once and they walk in from the road. */
  | { type: 'recruit'; playerId: number }
  /** Lay out a building, fixture, the scriptorium or the tower site. Workers build it. */
  | { type: 'place'; playerId: number; place: PlaceRequest }
  /** Mark something to be taken down. */
  | { type: 'demolish'; playerId: number; target: DemolishTarget }
  /** Rename one of your buildings (its label shows the name). */
  | { type: 'rename'; playerId: number; buildingId: number; name: string }
  /** Rename a fixture (blank goes back to its number). */
  | { type: 'renameFixture'; playerId: number; siteId: number; name: string }
  | { type: 'setBeerPrice'; playerId: number; siteId: number; price: number }
  /** The Stores window's "alert below" for one good (§16.9 step 6): 0 never alerts, 1 when it's all gone. */
  | { type: 'setAlertBelow'; playerId: number; good: ItemType; below: number };

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
  return verb === 'REPEAT' || verb === 'CHECK' || verb === 'IF' || verb === 'OTHERWISE';
}

/** What's wrong with a condition, if anything. Like places, stores that don't exist yet are fine. */
function conditionError(c: Condition): string | null {
  if (typeof c !== 'object' || c === null) return 'No such condition.';
  if (c.kind === 'state') return STATE_WORDS.includes(c.state) && typeof c.not === 'boolean' ? null : 'No such condition.';
  if (c.kind !== 'has') return 'No such condition.';
  if (!GOODS.includes(c.noun)) return 'Check for which goods?';
  if (c.cmp !== 'least' && c.cmp !== 'fewer' && c.cmp !== 'none') return 'No such comparison.';
  if (c.cmp !== 'none' && (!Number.isInteger(c.n) || c.n < 1 || c.n > 999)) return 'Amounts must be 1 to 999.';
  const p = c.place;
  // one store, a store by name, or one tower level: somewhere a worker can go and look
  if (p === 0 || p === 'tower' || p === 'camp') return 'Check one store, or one level of the tower.';
  const bad = placeError(p);
  if (bad) return bad;
  if (typeof p === 'object' && 'fixture' in p) {
    if (!isStoreWord(p.fixture)) return `${cap(placeName(p))} doesn't keep goods.`;
    if (!(STORES_FOR[c.noun] as readonly string[]).includes(FIXTURE_WORD_KIND[p.fixture])) return `${cap(placeName(p))} doesn't keep ${c.noun.toLowerCase()}.`;
  }
  return null;
}

function buildCarrier(s: SimState, cmd: Extract<Command, { type: 'compose' }>, dryRun = false) {
  const lines = cmd.lines.map((l) => {
    const who = l.who !== undefined && l.who !== null ? { id: l.who, name: s.workers.find((w) => w.id === l.who)?.name ?? '?' } : null;
    // a WAIT UNTIL has no count of hours
    const count = countless(l.verb) || (l.verb === 'WAIT' && l.cond) ? 1 : l.count;
    return { order: makeOrder(l.verb, l.noun, { from: l.from, to: l.to, who, target: l.target, cond: l.cond ?? null, within: l.within ?? null, using: l.using ?? null }, cmd.lang ?? 'en'), count };
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

/** What's wrong with a place in an order, if anything. Places that don't exist (yet) are fine: the order just fails when it's carried out. */
function placeError(p: Place): string | null {
  if (typeof p === 'number') return Number.isInteger(p) && p >= 0 && p <= TOWER.maxFloors ? null : 'No such level.';
  if (p === 'tower' || p === 'camp') return null;
  if (typeof p !== 'object' || p === null) return 'No such place.';
  if ('fixture' in p) return FIXTURE_WORDS.includes(p.fixture) && Number.isInteger(p.n) && p.n >= 1 && p.n <= 999 ? null : 'No such fixture.';
  return typeof p.name === 'string' && p.name.trim() !== '' && p.name.length <= BUILD.house.maxName ? null : 'No such name.';
}

export function validateCommand(s: SimState, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'compose': {
      if (cmd.lines.length < 1) return { ok: false, error: 'Write at least one line.' };
      if (cmd.lines.length > SCRIBE.maxLines) return { ok: false, error: `A scroll holds at most ${SCRIBE.maxLines} lines.` };
      for (const l of cmd.lines) {
        const target = l.target ?? null;
        if (!isValidLine(l.verb, l.noun, target)) return { ok: false, error: 'One of the lines makes no sense.' };
        const badTarget = target === null ? null : placeError(target);
        if (badTarget) return { ok: false, error: badTarget };
        const cond = l.cond ?? null;
        const rule = condRule(l.verb);
        if (rule === 'must' && cond === null) return { ok: false, error: '"If" what? Choose something to check.' };
        if (rule === 'never' && cond !== null) return { ok: false, error: `"${l.verb.toLowerCase()}" can't take an "until".` };
        const badCond = cond === null ? null : conditionError(cond);
        if (badCond) return { ok: false, error: badCond };
        if (l.verb === 'WAIT' && cond === null && (!Number.isInteger(l.count) || l.count < 1 || l.count > LOGIC.waitMaxHours)) return { ok: false, error: `Wait from 1 to ${LOGIC.waitMaxHours} hours.` };
        if (l.count === ALL && !allowsAll(l.verb)) return { ok: false, error: `"All" doesn't work for ${l.verb.toLowerCase()}: it never runs out.` };
        if (l.count === FOREVER && !allowsForever(l.verb)) return { ok: false, error: `"Forever" doesn't work for ${l.verb.toLowerCase()}.` };
        if (!countless(l.verb) && !isSpecialCount(l.count) && (!Number.isInteger(l.count) || l.count < 1 || l.count > 999)) return { ok: false, error: 'Counts must be 1 to 999, all, or forever.' };
        // moving a cart: it needs somewhere on the ground to go, and it happens once at a time
        const moving = l.verb === 'HAUL' && target !== null;
        if (moving && (l.to === undefined || l.to === null || typeof l.to !== 'object')) return { ok: false, error: 'Push it where? Name a store, a fixture or a building.' };
        if (moving && isSpecialCount(l.count)) return { ok: false, error: 'Give a number of times to move it.' };
        const using = l.using ?? null;
        if (using !== null) {
          if (l.verb !== 'HAUL' || moving || l.noun === null) return { ok: false, error: 'Only hauling goods can use a wheelbarrow or cart.' };
          if (typeof using !== 'object' || ('fixture' in using && !isVehicleWord(using.fixture))) return { ok: false, error: 'Haul using a wheelbarrow or cart.' };
          const badUsing = placeError(using);
          if (badUsing) return { ok: false, error: badUsing };
        }
        const places = [l.from, l.to].filter((p): p is Place => p !== undefined && p !== null);
        if (places.length > 0 && !takesPlaces(l.verb)) return { ok: false, error: `"${l.verb.toLowerCase()}" doesn't take a from or to.` };
        const bad = places.map(placeError).find((e) => e !== null);
        if (bad) return { ok: false, error: bad };
        // a fixture by number has to be a store, and the kind that keeps this good
        const notStore = moving ? undefined : places.find((p) => typeof p === 'object' && 'fixture' in p && !isStoreWord(p.fixture));
        if (notStore) return { ok: false, error: `${cap(placeName(notStore))} doesn't keep goods.` };
        const wrong = places.find((p) => typeof p === 'object' && 'fixture' in p && l.noun && l.noun in STORES_FOR && !(STORES_FOR[l.noun as keyof typeof STORES_FOR] as readonly string[]).includes(FIXTURE_WORD_KIND[p.fixture]));
        if (wrong && l.noun) return { ok: false, error: `${placeName(wrong)} doesn't keep ${l.noun.toLowerCase()}.` };
        if (places.includes('camp')) return { ok: false, error: 'Haul to or from a store, a level or the tower.' };
        const within = l.within ?? null;
        if (within !== null) {
          if (!takesWithin(l.verb, l.noun)) return { ok: false, error: 'Only "build fixtures" takes an "in".' };
          if (typeof within === 'object' && 'fixture' in within) return { ok: false, error: 'Build fixtures in the camp, the tower, a level or a building.' };
          const badIn = placeError(within);
          if (badIn) return { ok: false, error: badIn };
        }
        if (l.from !== undefined && l.from !== null && placeKey(l.from) === placeKey(l.to ?? null)) return { ok: false, error: 'From and to are the same place.' };
      }
      if (cmd.lines[0].verb === 'REPEAT') return { ok: false, error: 'Repeat what? Put it after the lines to repeat.' };
      const branching = branchError(cmd.lines.map((l) => l.verb));
      if (branching) return { ok: false, error: branching };
      for (const l of cmd.lines) {
        if (takesWho(l.verb) && (l.who === undefined || l.who === null || !s.workers.some((w) => w.id === l.who))) return { ok: false, error: 'Teach or learn from whom?' };
      }
      // you can only write words you know in that language
      const lang = cmd.lang ?? 'en';
      const lex = s.lexicon[lang] ?? [];
      for (const tok of buildCarrier(s, cmd, true).orders.flat()) {
        if (tok.t !== 'WHO' && tok.t !== 'NAMED' && tok.t !== 'NUM' && !lex.includes(tok.t)) return { ok: false, error: `You don't know how to write «${tok.t.toLowerCase()}» in ${langName(lang)} yet.` };
      }
      if (!Number.isInteger(cmd.wage) || cmd.wage < 0 || cmd.wage > 50) return { ok: false, error: 'Wage must be 0 to 50.' };
      if (cmd.dest.kind === 'tower') return { ok: false, error: 'Only blueprints go to the top of the tower.' };
      const who = cmd.dest.kind === 'board' ? cmd.dest.addressee : cmd.dest.workerId;
      if (who !== null && !s.workers.some((w) => w.id === who)) return { ok: false, error: 'Who is it for?' };
      // what it would promise up front (only notices do)
      const one = cmd.lines[0];
      const promise = cmd.dest.kind === 'board' && cmd.lines.length === 1 && isWorkVerb(one.verb) && !one.cond && !isSpecialCount(one.count) ? one.count * cmd.wage : 0;
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
      if (!s.tower) return { ok: false, error: 'Choose the tower site first.' };
      const planned = s.floors + s.projects.length + s.designs.filter((d) => d.carrier.kind === 'blueprint').length;
      if (planned >= TOWER.maxFloors) return { ok: false, error: 'The tower is as tall as this world allows.' };
      return { ok: true };
    }
    case 'bonus': {
      const w = s.workers.find((x) => x.id === cmd.workerId);
      if (!w) return { ok: false, error: 'Who is it for?' };
      if (w.leaving) return { ok: false, error: w.name + ' has already quit.' };
      if (!Number.isInteger(cmd.gold) || cmd.gold < 1 || cmd.gold > BONUS.maxGold) return { ok: false, error: 'A bonus is 1 to ' + BONUS.maxGold + ' gold.' };
      if (cmd.gold > availableGold(s)) return { ok: false, error: 'Needs ' + cmd.gold + ' gold; only ' + availableGold(s) + ' available.' };
      return { ok: true };
    }
    case 'recruit': {
      const error = recruitError(s);
      return error ? { ok: false, error } : { ok: true };
    }
    case 'place': {
      const error = validatePlace(s, cmd.place);
      return error ? { ok: false, error } : { ok: true };
    }
    case 'demolish': {
      const error = validateDemolish(s, cmd.target);
      return error ? { ok: false, error } : { ok: true };
    }
    case 'rename': {
      const error = validateRename(s, cmd.buildingId, cmd.name);
      return error ? { ok: false, error } : { ok: true };
    }
    case 'renameFixture': {
      const error = validateRenameFixture(s, cmd.siteId, cmd.name);
      return error ? { ok: false, error } : { ok: true };
    }
    case 'setBeerPrice': {
      const bar = s.sites.find((x) => x.id === cmd.siteId);
      if (!bar || bar.kind !== 'bar') return { ok: false, error: 'That isn’t a bar.' };
      if (!Number.isInteger(cmd.price) || cmd.price < 0 || cmd.price > ECONOMY.beerPriceMax) return { ok: false, error: `A beer costs from 0 to ${ECONOMY.beerPriceMax} gold.` };
      return { ok: true };
    }
    case 'setAlertBelow': {
      if (!ITEM_TYPES.includes(cmd.good)) return { ok: false, error: 'That isn’t a good.' };
      if (!Number.isInteger(cmd.below) || cmd.below < 0 || cmd.below > ALERTS.supplyBelowMax) return { ok: false, error: `An alert line runs from 0 (never) to ${ALERTS.supplyBelowMax}.` };
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
      s.reserved += upfrontReserve(c);
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
      log(s, 'Sent to the scriptorium: a blueprint for the next level.');
      break;
    }
    case 'bonus': {
      // set aside now, paid out of the treasury when it's written
      const c = newLetter(s, cmd.workerId, cmd.gold);
      s.reserved += upfrontReserve(c);
      queueDesign(s, c);
      log(s, 'Sent to the scriptorium: a letter for ' + destText(s, c.dest) + ': ' + carrierText(c) + '.');
      break;
    }
    case 'recruit':
      recruitWorker(s);
      break;
    case 'place':
      applyPlace(s, cmd.place);
      break;
    case 'demolish':
      applyDemolish(s, cmd.target);
      break;
    case 'rename':
      applyRename(s, cmd.buildingId, cmd.name);
      break;
    case 'renameFixture':
      applyRenameFixture(s, cmd.siteId, cmd.name);
      break;
    case 'setBeerPrice': {
      const bar = s.sites.find((x) => x.id === cmd.siteId)!;
      bar.price = cmd.price;
      log(s, `${bar.label}: a beer now costs ${cmd.price === 0 ? 'nothing' : `${cmd.price} gold`}.`);
      break;
    }
    case 'setAlertBelow':
      setAlertLine(s, cmd.good, cmd.below);
      break;
  }
  return { ok: true };
}

import { alert } from './actions';
import { floorName, levelName } from './lang';
import { headcount, goldText, recruitError } from './recruit';
import { ALERTS, PATRON, TIME } from './tuning';
import { ITEM_TYPES, type ItemType, type SimState } from './types';

// The alerts that watch the colony as a whole (§16.9 step 5): a supply
// running out, the patron's goal reached, and everyone gone. The ones tied to
// a moment (a notice, a quit, the patron's patience, an unpaid wage, a scroll
// given up, a newcomer, a level finished) are raised where it happens.

/** All of a good in the colony: in every finished store (carts too) and lying around. */
export function goodTotal(s: SimState, g: ItemType): number {
  let n = 0;
  for (const x of s.sites) if (x.build === null) n += x.store[g];
  for (const it of s.items) if (it.type === g) n++;
  return n;
}

/** Goods already under their alert line, so a game doesn't open with alerts for what was never there. */
export function goodsOut(s: SimState): ItemType[] {
  return ITEM_TYPES.filter((g) => goodTotal(s, g) < s.alertBelow[g]);
}

const OUT_TEXT: Record<ItemType, string> = {
  stone: 'There’s no stone left in the stockpiles or lying around. Building stops without it: post a notice to mine some.',
  wood: 'There’s no wood left in the stockpiles or lying around. Building stops without it: post a notice to gather some.',
  grain: 'There’s no grain left. Without it there’s no bread or beer: post a notice to harvest some.',
  bread: 'There’s no bread left. Hungry workers soon grow fed up: post a notice to bake some, or haul some to the pantries.',
  beer: 'There’s no beer left at the bars. Workers will miss their drink: post a notice to brew some.',
};

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A good falls under its alert line (1 by default: it's all gone). Once raised, not again until it's back above the line by ALERTS.supplyRearm. */
export function checkSupplies(s: SimState): void {
  if (s.tick % ALERTS.supplyCheckTicks !== 0) return;
  for (const g of ITEM_TYPES) {
    const n = goodTotal(s, g);
    const below = s.alertBelow[g];
    if (s.supplyOut.includes(g)) {
      if (n >= below + ALERTS.supplyRearm) s.supplyOut = s.supplyOut.filter((x) => x !== g);
    } else if (n < below) {
      s.supplyOut.push(g);
      alert(s, 'supply', below <= 1 ? `${cap(g)} has run out` : `${cap(g)} is running low`, below <= 1 ? OUT_TEXT[g] : `Only ${n} ${g} left in the colony, under the ${below} you asked to hear about.`);
    }
  }
}

/** Days played, to one decimal, for the score. */
export function daysPlayed(s: SimState): number {
  return Math.round((s.tick * 10) / TIME.dayTicks) / 10;
}

/** (tower height × 1000) / (days played) + gold in the treasury: the user's formula. */
export function score(s: SimState): number {
  return Math.round((s.floors * 1000 * TIME.dayTicks) / Math.max(1, s.tick)) + s.gold;
}

/** The patron's goal reached: once a game. */
export function checkGoal(s: SimState): void {
  if (s.won || s.floors < s.goal) return;
  s.won = true;
  alert(
    s,
    'goal',
    'The patron’s goal is reached',
    `Congratulations! You reached the patron's goal of a tower ${s.goal} levels tall. Your score is ${goldText(score(s))}: ${s.goal} levels × 1000 ÷ ${daysPlayed(s)} days, plus ${goldText(s.gold)} gold in the treasury.`,
  );
}

/**
 * Everyone gone: no worker is staying. It says whether you can recruit now,
 * should wait for the patron (a stipend at dawn, or a newcomer), or it's the
 * end: no workers and no money coming. Raised again when that changes.
 */
export type GoneState = 'recruit' | 'wait' | 'end';

export function goneState(s: SimState): GoneState {
  if (recruitError(s) === null) return 'recruit';
  if (PATRON.stipendPerDay * s.patience >= 100 || s.patience >= PATRON.recruitAbove) return 'wait';
  return 'end';
}

export function checkGone(s: SimState): void {
  if (headcount(s) > 0) {
    s.gone = null;
    return;
  }
  const now = goneState(s);
  if (now === s.gone) return;
  s.gone = now;
  const tower = s.floors > 0 ? ` The tower stands at ${levelName(s.floors - 1)}.` : '';
  const text =
    now === 'recruit'
      ? 'All of your workers have quit and you are unable to continue building. You can recruit new workers from the Workers window.'
      : now === 'wait'
        ? `All of your workers have quit and you are unable to continue building, and the treasury can't pay for a recruit yet. ${s.patience >= PATRON.recruitAbove ? 'The patron may send a newcomer, and their stipend comes at dawn.' : 'The patron’s stipend comes at dawn.'}`
        : `All of your workers have quit, there's no gold to recruit more, and the patron has stopped paying. The tower is finished as it stands.${tower}`;
  alert(s, 'gone', now === 'end' ? 'The end of the work' : 'Everyone is gone', text);
}

/** Every colony-wide alert check, once a tick. */
export function checkAlerts(s: SimState): void {
  checkSupplies(s);
  checkGoal(s);
  checkGone(s);
}

/** The patron's patience has fallen past one of ALERTS.patienceAt (50%, 25%, 0). */
export function patienceAlert(s: SimState, before: number): void {
  for (const at of ALERTS.patienceAt) {
    if (!(before > at && s.patience <= at)) continue;
    const stipend = Math.round((PATRON.stipendPerDay * s.patience) / 100);
    const text =
      at === 0
        ? 'The patron has run out of patience and will pay no more stipend until the tower grows again. Finish a level to win them back.'
        : at >= PATRON.recruitAbove
          ? `The patron's patience is down to ${at}%. Their stipend is now ${stipend} gold a day, and below ${PATRON.recruitAbove}% they stop sending newcomers. Finish a level of the tower to win it back.`
          : `The patron is growing impatient: ${at}% left, and the stipend is down to ${stipend} gold a day. Finish a level of the tower soon.`;
    alert(s, 'patron', at === 0 ? 'The patron has lost patience' : `The patron's patience is at ${at}%`, text);
  }
}

/** A level finished (info, muted by default). */
export function levelAlert(s: SimState, floor: number, bonus: number): void {
  alert(s, 'level', `${floorName(floor)} is finished`, `${floorName(floor)} is finished. The patron is pleased and sends ${bonus} gold.${s.floors < s.goal ? ` ${s.goal - s.floors} to go to the patron's goal.` : ''}`);
}

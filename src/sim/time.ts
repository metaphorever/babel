import { TIME } from './tuning';

// Days and hours. Tick 0 is dawn on day 1; one day is TIME.dayTicks long.
// The clock is for the player's sense of time: the patron pays at dawn, and
// the sky darkens at night. Night doesn't (yet) change what workers do.

export function dayOf(tick: number): number {
  // the day number turns over at midnight, like a clock (tick 0 is TIME.startHour on day 1)
  return Math.floor((tick + (TIME.startHour * TIME.dayTicks) / 24) / TIME.dayTicks) + 1;
}

/** Hour of the day as a fraction, 0..24. */
export function hourOf(tick: number): number {
  const frac = (tick % TIME.dayTicks) / TIME.dayTicks;
  return (TIME.startHour + frac * 24) % 24;
}

export function clockText(tick: number): string {
  const h = hourOf(tick);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `Day ${dayOf(tick)} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * How dark the sky is: 0 in full day, 1 in the dead of night, with dusk
 * and dawn in between.
 */
export function darkness(tick: number): number {
  const h = hourOf(tick);
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 21) return (h - 18) / 3; // dusk
  if (h >= 21 || h < 4) return 1;
  return 1 - (h - 4) / 3; // dawn, 4 to 7
}

export function isNight(tick: number): boolean {
  return darkness(tick) >= 0.5;
}

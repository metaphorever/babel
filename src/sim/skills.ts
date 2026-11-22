import type { WorkVerb } from './lang';
import { rand, type RngState } from './rng';
import { SKILLS, WORK } from './tuning';
import type { SkillId, Worker } from './types';

// Skills grow with practice. A skilled worker gets more done per trip: a good
// miner sometimes breaks off two stones, a strong or practiced hauler carries
// more than one load. Each worker also has a knack: one skill they start a
// little ahead in and learn faster.

export const SKILL_IDS: readonly SkillId[] = ['mining', 'woodcutting', 'farming', 'cooking', 'hauling', 'building', 'writing'];

export const SKILL_LABEL: Record<SkillId, string> = {
  mining: 'Mining',
  woodcutting: 'Woodcutting',
  farming: 'Farming',
  cooking: 'Cooking',
  hauling: 'Hauling',
  writing: 'Writing',
  building: 'Building',
};

export const SKILL_OF_VERB: Record<WorkVerb, SkillId> = {
  MINE: 'mining',
  CHOP: 'woodcutting',
  HARVEST: 'farming',
  COOK: 'cooking',
  HAUL: 'hauling',
  BUILD: 'building',
};

export function emptySkills(): Record<SkillId, number> {
  return { mining: 0, woodcutting: 0, farming: 0, cooking: 0, hauling: 0, writing: 0, building: 0 };
}

export function levelOf(xp: number): number {
  let lvl = 0;
  for (let i = 1; i < SKILLS.levelXp.length; i++) if (xp >= SKILLS.levelXp[i]) lvl = i;
  return lvl;
}

export function skillLevel(w: Worker, skill: SkillId): number {
  return levelOf(w.skills[skill]);
}

/** Practice. Returns the new level if it went up, else null. */
export function practice(w: Worker, skill: SkillId): number | null {
  const before = skillLevel(w, skill);
  w.skills[skill] += skill === w.knack ? SKILLS.knackXpMult : 1;
  const after = skillLevel(w, skill);
  return after > before ? after : null;
}

/** Chance that one work action produces a bonus unit. */
export function bonusChance(w: Worker, skill: SkillId): number {
  return Math.min(SKILLS.bonusCap, skillLevel(w, skill) * SKILLS.bonusPerLevel);
}

/** Units produced by one work action: the base plus a skill-based bonus roll. */
export function rollYield(rng: RngState, w: Worker, skill: SkillId, base: number): number {
  return base + (rand(rng) < bonusChance(w, skill) ? 1 : 0);
}

export function carryCapacity(w: Worker): number {
  let cap = 1;
  if (w.traits.includes('strong')) cap++;
  if (skillLevel(w, 'hauling') >= SKILLS.haulExtraAtLevel) cap++;
  return cap;
}

/** Units a worker expects from one trip at a job. Used to weigh wages per unit. */
export function expectedUnits(w: Worker, verb: WorkVerb): number {
  if (verb === 'HAUL' || verb === 'BUILD') return carryCapacity(w);
  const base = verb === 'COOK' ? WORK.breadPerGrain : 1;
  return base + bonusChance(w, SKILL_OF_VERB[verb]);
}

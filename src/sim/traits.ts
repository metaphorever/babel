import { rand, randRange, type RngState } from './rng';
import type { Personality, TraitId } from './types';

export interface TraitDef {
  id: TraitId;
  label: string;
  blurb: string;
  apply: (p: Personality) => void;
  /** Traits that can't appear together with this one. */
  excludes: TraitId[];
}

export const TRAITS: Record<TraitId, TraitDef> = {
  industrious: {
    id: 'industrious',
    label: 'Industrious',
    blurb: 'Likes to keep busy.',
    apply: (p) => (p.work *= 1.35),
    excludes: ['lazy'],
  },
  lazy: {
    id: 'lazy',
    label: 'Lazy',
    blurb: 'Would rather not.',
    apply: (p) => (p.work *= 0.7),
    excludes: ['industrious'],
  },
  greedy: {
    id: 'greedy',
    label: 'Greedy',
    blurb: 'Goes where the gold is.',
    apply: (p) => (p.greed *= 1.6),
    excludes: [],
  },
  glutton: {
    id: 'glutton',
    label: 'Glutton',
    blurb: 'Always peckish.',
    apply: (p) => (p.hunger *= 1.4),
    excludes: [],
  },
  sleepyhead: {
    id: 'sleepyhead',
    label: 'Sleepyhead',
    blurb: 'Tires quickly.',
    apply: (p) => (p.fatigue *= 1.35),
    excludes: [],
  },
  spendthrift: {
    id: 'spendthrift',
    label: 'Spendthrift',
    blurb: 'Gold burns a hole in their pocket.',
    apply: (p) => (p.spend *= 1.7),
    excludes: ['frugal'],
  },
  frugal: {
    id: 'frugal',
    label: 'Frugal',
    blurb: 'Saves for the family back home.',
    apply: (p) => (p.spend *= 0.5),
    excludes: ['spendthrift'],
  },
  cheerful: {
    id: 'cheerful',
    label: 'Cheerful',
    blurb: 'Hard to keep down.',
    apply: (p) => (p.moodBias += 8),
    excludes: ['grumpy'],
  },
  grumpy: {
    id: 'grumpy',
    label: 'Grumpy',
    blurb: 'Hard to please.',
    apply: (p) => (p.moodBias -= 8),
    excludes: ['cheerful'],
  },
};

const ALL = Object.keys(TRAITS) as TraitId[];

export function rollPersonality(rng: RngState): { traits: TraitId[]; p: Personality } {
  // everyone gets small random leanings, then one or two named traits
  const p: Personality = {
    work: randRange(rng, 0.9, 1.1),
    greed: randRange(rng, 0.8, 1.2),
    hunger: randRange(rng, 0.9, 1.1),
    fatigue: randRange(rng, 0.9, 1.1),
    spend: randRange(rng, 0.8, 1.2),
    moodBias: 0,
  };
  const count = rand(rng) < 0.6 ? 1 : 2;
  const traits: TraitId[] = [];
  for (let i = 0; i < 20 && traits.length < count; i++) {
    const t = ALL[Math.floor(rand(rng) * ALL.length)];
    if (traits.includes(t)) continue;
    if (traits.some((have) => TRAITS[have].excludes.includes(t))) continue;
    traits.push(t);
  }
  for (const t of traits) TRAITS[t].apply(p);
  return { traits, p };
}

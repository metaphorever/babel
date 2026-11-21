import { pick, rand, type RngState } from './rng';

// Names with a loose ancient Near East flavor, built from syllables. A
// worker's name is the one word that never drifts, so names need to be
// short, distinct and pronounceable.

const START = ['A', 'E', 'I', 'U', 'Ba', 'Da', 'Ea', 'Ga', 'Ha', 'Ish', 'Ka', 'La', 'Ma', 'Na', 'Nin', 'Ra', 'Sa', 'Shu', 'Ta', 'Ur', 'Za', 'Zi', 'Ab', 'En', 'Ku', 'Lu', 'Mu', 'Pu', 'Ti', 'Bel', 'Gil', 'Ner'];
const MID = ['bi', 'du', 'ga', 'li', 'ma', 'na', 'ri', 'sha', 'ta', 'zu', 'ki', 'lu', 'mi', 'ni', 'ba', 'gu', 'ru'];
const END = ['', '', 't', 'm', 'n', 'r', 'k', 'l', 'sh', 'd', 'ia', 'um', 'an', 'ur', 'il', 'ak', 'u', 'i'];

export function makeName(rng: RngState, taken: readonly string[]): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let name = pick(rng, START);
    const mids = rand(rng) < 0.55 ? 1 : rand(rng) < 0.6 ? 0 : 2;
    for (let i = 0; i < mids; i++) {
      let m = pick(rng, MID);
      // occasional doubled consonant: Ziggu, Labbi
      if (rand(rng) < 0.15) m = m[0] + m;
      name += m;
    }
    name += pick(rng, END);
    if (name.length < 3 || name.length > 9) continue;
    if (taken.includes(name)) continue;
    return name;
  }
  // fall back to something guaranteed unique
  return `Worker${taken.length + 1}`;
}

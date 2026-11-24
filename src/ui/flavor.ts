import { LANGS, type LangId } from '../sim';

// Flavor words for the opening text. Each one is shown in a language picked
// at random from every language in the game except the common tongue
// (English): they're always foreign, whether or not the player has met that
// language yet. They're never translated and nothing depends on them: the
// sentences read fine without them.

export type FlavorWord = 'benevolent' | 'legendary' | 'industrious' | 'plentiful' | 'heavy' | 'trusted' | 'monumental' | 'goodLuck';

const WORDS: Record<FlavorWord, Record<LangId, string>> = {
  benevolent: { en: 'benevolent', fr: 'bienveillant', el: 'καλοπροαίρετος' },
  legendary: { en: 'legendary', fr: 'légendaire', el: 'θρυλική' },
  industrious: { en: 'industrious', fr: 'laborieux', el: 'εργατικούς' },
  plentiful: { en: 'plentiful', fr: 'abondantes', el: 'άφθονη' },
  heavy: { en: 'heavy', fr: 'lourd', el: 'βαρύ' },
  trusted: { en: 'trusted', fr: 'fidèles', el: 'έμπιστους' },
  monumental: { en: 'monumental', fr: 'monumentale', el: 'μνημειώδες' },
  goodLuck: { en: 'Good luck!', fr: 'Bonne chance !', el: 'Καλή τύχη!' },
};

/** Every language but the one everyone starts with. */
const LANG_IDS: LangId[] = LANGS.map((l) => l.id).filter((id) => id !== 'en');

/** The same game always gets the same flavor (from its seed), so a replay reads the same. */
export function flavor(seed: number, word: FlavorWord): { text: string; lang: LangId } {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const lang = LANG_IDS[h % LANG_IDS.length];
  return { text: WORDS[word][lang], lang };
}

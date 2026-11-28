import { h } from './dom';
import { showDialog } from './dialog';
import { prefs, setPrefs, UI_SCALES } from './prefs';

// Settings (§16.9 step 9): the player's own, kept in this browser. Changes
// take effect as they're made; Done just closes the window.

export function showSettings(root: HTMLElement): void {
  const p = prefs();

  const slider = (label: string, value: number) =>
    h('label', { class: 'pref-row' }, h('span', { class: 'pref-label' }, label), h('input', { type: 'range', min: 0, max: 100, value, disabled: true, 'aria-label': label }));

  const scales = h(
    'div',
    { class: 'radio-row' },
    ...UI_SCALES.map((z) => {
      const input = h('input', { type: 'radio', name: 'ui-scale', value: String(z), checked: z === p.uiScale });
      input.addEventListener('change', () => setPrefs({ uiScale: z }));
      return h('label', { class: 'radio' }, input, `${Math.round(z * 100)}%`);
    }),
  );

  const motion = h('input', { type: 'checkbox', checked: p.reduceMotion });
  motion.addEventListener('change', () => setPrefs({ reduceMotion: motion.checked }));

  showDialog(
    root,
    'Settings',
    [
      h('fieldset', { class: 'group' }, h('legend', {}, 'Language'), h('p', { class: 'pref-note' }, 'Right now this game is only available in English. If you would like to help translate it into another language, contact Clover.')),
      h('fieldset', { class: 'group' }, h('legend', {}, 'Sound'), slider('Effects', p.effects), slider('Music', p.music), h('p', { class: 'hint' }, 'Babel has no sound yet. These will set it when it does.')),
      h('fieldset', { class: 'group' }, h('legend', {}, 'Interface size'), scales, h('p', { class: 'hint' }, 'The menus and windows; the world has its own zoom (the scroll wheel).')),
      h('fieldset', { class: 'group' }, h('legend', {}, 'Motion'), h('label', { class: 'check' }, motion, 'Reduce motion'), h('p', { class: 'hint' }, 'The title doesn’t scramble and the clouds hold still.')),
      h('p', { class: 'hint' }, 'These are yours, kept in this browser: they go with you from game to game, not into saves.'),
    ],
    [{ label: 'Done', primary: true, run: () => undefined }],
  );
}

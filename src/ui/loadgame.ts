import { readSave } from '../sim';
import { h } from './dom';
import { showDialog } from './dialog';
import { bootInto, listSlots, readSlot, summaryText } from './saves';

// Load Game, from the title screen (§16.9 step 9): the saves in this
// browser, newest first, or one from a file. With no game running there's
// nothing to lose, so it loads without asking (a loaded game starts the page
// over on it, as the in-game Saved Games window does).

export function showLoadGame(root: HTMLElement, message: string | null = null): void {
  const slots = listSlots().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  const load = (text: string | null) => {
    if (text === null) return showLoadGame(root, 'That save has gone missing from the browser.');
    const r = readSave(text);
    if (!r.ok) return showLoadGame(root, r.error);
    const err = bootInto(text);
    if (err) showLoadGame(root, err);
  };
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'file-in' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return showLoadGame(root, 'That file is far too big to be a Babel save.');
    load(await f.text());
  });
  showDialog(
    root,
    'Load Game',
    [
      message ? h('p', { class: 'error' }, message) : null,
      slots.length === 0
        ? h('p', { class: 'hint' }, 'No games are saved in this browser. Games save themselves at midnight (the Autosave), and the File menu saves one whenever you like.')
        : h(
            'div',
            { class: 'alert-list' },
            ...slots.map((sl) =>
              h(
                'div',
                { class: 'alert-entry row' },
                h('div', { class: 'grow' }, h('b', {}, sl.name), h('div', { class: 'hint' }, summaryText(sl.summary))),
                h('button', { class: 'btn btn-small', onclick: () => load(readSlot(sl.id)) }, 'Load'),
              ),
            ),
          ),
      fileIn,
    ],
    [
      {
        label: 'Load from a File…',
        run: () => {
          fileIn.click();
          return false;
        },
      },
      { label: 'Cancel', primary: true, run: () => undefined },
    ],
  );
}

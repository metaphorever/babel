import { dayOf, makeSave, readSave, type SaveFile, type SaveSummary, type SaveUi, type Sim } from '../sim';
import { clear, h } from './dom';
import type { WindowManager } from './windows';

// Saves in the browser (§16.9 step 7): slots in localStorage, an autosave at
// the turn of each day, and download / upload as a file. Loading reloads the
// page with the save handed over in sessionStorage, so every window starts
// fresh on the loaded game.

const INDEX_KEY = 'babel.saves';
const SLOT_KEY = (id: string) => `babel.save.${id}`;
const BOOT_KEY = 'babel.boot';
export const AUTOSAVE_ID = 'auto';

/** What the list shows, kept apart from the saves themselves so listing doesn't read every one. */
export interface SlotInfo {
  id: string;
  name: string;
  savedAt: string;
  summary: SaveSummary;
}

export function listSlots(): SlotInfo[] {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string' && localStorage.getItem(SLOT_KEY(x.id)) !== null) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SlotInfo[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

/** Write a save to a slot (a new one if id is null). Returns an error, or null. */
export function writeSlot(id: string | null, file: SaveFile): string | null {
  const slot = id ?? `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  try {
    localStorage.setItem(SLOT_KEY(slot), JSON.stringify(file));
    const list = listSlots().filter((x) => x.id !== slot);
    list.push({ id: slot, name: file.name, savedAt: file.savedAt, summary: file.summary });
    writeIndex(list);
    return null;
  } catch {
    return 'This browser has no room left for saves. Delete an old one, or download the game as a file instead.';
  }
}

export function readSlot(id: string): string | null {
  try {
    return localStorage.getItem(SLOT_KEY(id));
  } catch {
    return null;
  }
}

export function deleteSlot(id: string): void {
  try {
    localStorage.removeItem(SLOT_KEY(id));
    writeIndex(listSlots().filter((x) => x.id !== id));
  } catch {
    // nothing to do
  }
}

/** Start the page over on this save. Returns an error, or doesn't return (the page reloads). */
export function bootInto(text: string): string | null {
  try {
    sessionStorage.setItem(BOOT_KEY, text);
  } catch {
    return 'The browser wouldn’t hold the save long enough to load it.';
  }
  location.assign(location.pathname);
  return null;
}

/** At startup: a save handed over by bootInto, read and checked (null if there wasn't one). */
export function takeBootSave(): ReturnType<typeof readSave> | null {
  let text: string | null = null;
  try {
    text = sessionStorage.getItem(BOOT_KEY);
    sessionStorage.removeItem(BOOT_KEY);
  } catch {
    return null;
  }
  return text === null ? null : readSave(text);
}

export function summaryText(m: SaveSummary): string {
  const tower = m.floors === 0 ? 'no tower yet' : `${m.floors} ${m.floors === 1 ? 'level' : 'levels'}`;
  return `Day ${m.day} · ${tower} · ${m.workers} ${m.workers === 1 ? 'worker' : 'workers'} · ${m.gold} gold · ${m.difficulty}`;
}

function whenSaved(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export interface SavesHooks {
  /** A question in a dialog (the game pauses while it's up). */
  ask(title: string, body: (HTMLElement | string | null)[], buttons: { label: string; primary?: boolean; run: () => void }[], focus?: HTMLElement | null): void;
  /** What only the interface knows, to keep with a save. */
  uiSnapshot(): SaveUi;
}

/** The Saved Games window: save, load, download, upload, delete. */
export class SavesPanel {
  private body: HTMLElement;
  private status: HTMLElement;
  private nameIn: HTMLInputElement;
  private fileIn: HTMLInputElement;
  /** The day of the last autosave (or of the start of this session). */
  private autoDay: number;

  constructor(
    private wm: WindowManager,
    private sim: Sim,
    private hooks: SavesHooks,
  ) {
    const win = wm.create('saves', 'Saved Games', 120, 34, 360);
    this.nameIn = h('input', { type: 'text', maxlength: 60, 'aria-label': 'Name for the save', class: 'save-name', onkeydown: (e) => (e as KeyboardEvent).key === 'Enter' && this.saveNew() });
    this.fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'save-file', onchange: () => void this.upload() });
    this.body = h('div', { class: 'save-list' });
    this.status = h('div', { class: 'build-status', role: 'status' });
    win.body.append(
      h('div', { class: 'row save-row' }, this.nameIn, h('button', { class: 'btn btn-default', onclick: () => this.saveNew() }, 'Save')),
      this.body,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', title: 'A file you can keep, or load on another computer', onclick: () => this.download(this.current('Babel')) }, 'Download this game'),
        h('button', { class: 'btn', onclick: () => this.fileIn.click() }, 'Load from a file…'),
        this.fileIn,
      ),
      this.status,
      h('div', { class: 'hint' }, 'Saves are kept in this browser. The game also saves itself at midnight each day, over the Autosave. Download a game to keep it safe, or to carry it to another computer.'),
    );
    this.autoDay = dayOf(sim.state.tick);
  }

  private current(name: string): SaveFile {
    return makeSave(this.sim.state, name, new Date().toISOString(), this.hooks.uiSnapshot());
  }

  private say(text: string, error = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('error', error);
  }

  private defaultName(): string {
    const s = this.sim.state;
    return `Day ${dayOf(s.tick)}${s.floors ? `, ${s.floors} ${s.floors === 1 ? 'level' : 'levels'}` : ''}`;
  }

  refresh(): void {
    this.nameIn.placeholder = this.defaultName();
    clear(this.body);
    const slots = listSlots().sort((a, b) => (a.id === AUTOSAVE_ID ? -1 : b.id === AUTOSAVE_ID ? 1 : b.savedAt.localeCompare(a.savedAt)));
    if (slots.length === 0) this.body.append(h('div', { class: 'hint' }, 'No saved games in this browser yet.'));
    for (const slot of slots) {
      const auto = slot.id === AUTOSAVE_ID;
      this.body.append(
        h(
          'div',
          { class: 'save-entry' },
          h('div', {}, h('b', {}, slot.name), ' ', h('span', { class: 'hint' }, whenSaved(slot.savedAt))),
          h('div', { class: 'hint' }, summaryText(slot.summary)),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn btn-small', onclick: () => this.load(slot) }, 'Load'),
            auto ? '' : h('button', { class: 'btn btn-small', onclick: () => this.saveOver(slot) }, 'Save over'),
            h('button', { class: 'btn btn-small', onclick: () => this.downloadSlot(slot) }, 'Download'),
            h('button', { class: 'btn btn-small', onclick: () => this.remove(slot) }, 'Delete'),
          ),
        ),
      );
    }
  }

  private saveNew(): void {
    const name = this.nameIn.value.trim() || this.defaultName();
    const err = writeSlot(null, this.current(name));
    if (err) return this.say(err, true);
    this.nameIn.value = '';
    this.say(`Saved “${name}”.`);
    this.refresh();
  }

  private saveOver(slot: SlotInfo): void {
    this.hooks.ask('Save over', [h('p', {}, `Replace “${slot.name}” (${summaryText(slot.summary)}) with the game you’re playing?`)], [
      { label: 'Cancel', run: () => undefined },
      {
        label: 'Replace',
        primary: true,
        run: () => {
          const err = writeSlot(slot.id, this.current(slot.name));
          this.say(err ?? `Saved over “${slot.name}”.`, !!err);
          this.refresh();
        },
      },
    ]);
  }

  private remove(slot: SlotInfo): void {
    this.hooks.ask('Delete a save', [h('p', {}, `Delete “${slot.name}” (${summaryText(slot.summary)}) from this browser? It can’t be undone.`)], [
      { label: 'Cancel', primary: true, run: () => undefined },
      {
        label: 'Delete',
        run: () => {
          deleteSlot(slot.id);
          this.say(`Deleted “${slot.name}”.`);
          this.refresh();
        },
      },
    ]);
  }

  private load(slot: SlotInfo): void {
    const text = readSlot(slot.id);
    if (text === null) {
      this.say('That save has gone missing from the browser.', true);
      return this.refresh();
    }
    this.confirmLoad(text);
  }

  /** Check a save, then ask before leaving the game being played. */
  private confirmLoad(text: string): void {
    const r = readSave(text);
    if (!r.ok) return this.say(r.error, true);
    this.hooks.ask('Load a game', [h('div', { class: 'dialog-title' }, `Load “${r.save.name}”?`), h('p', {}, summaryText(r.save.summary)), h('p', {}, 'Anything in the game you’re playing since you last saved it will be lost.')], [
      { label: 'Cancel', run: () => undefined },
      {
        label: 'Load',
        primary: true,
        run: () => {
          const err = bootInto(text);
          if (err) this.say(err, true);
        },
      },
    ]);
  }

  private downloadSlot(slot: SlotInfo): void {
    const text = readSlot(slot.id);
    const r = text === null ? null : readSave(text);
    if (!r?.ok) return this.say(r ? r.error : 'That save has gone missing from the browser.', true);
    this.download(JSON.parse(text!) as SaveFile);
  }

  private download(file: SaveFile): void {
    const slug = file.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `babel-${slug}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async upload(): Promise<void> {
    const f = this.fileIn.files?.[0];
    this.fileIn.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return this.say('That file is far too big to be a Babel save.', true);
    this.confirmLoad(await f.text());
  }

  private wasOpen = false;

  /** Called as the game runs: freshen the list when the window opens, and save over the Autosave when a new day starts. */
  tick(): void {
    const open = this.wm.get('saves')!.open;
    if (open && !this.wasOpen) {
      this.say('');
      this.refresh();
    }
    this.wasOpen = open;
    const day = dayOf(this.sim.state.tick);
    if (day <= this.autoDay) return;
    this.autoDay = day;
    const err = writeSlot(AUTOSAVE_ID, this.current('Autosave'));
    if (err) console.warn(`Babel: autosave failed. ${err}`);
    if (this.wm.get('saves')!.open) this.refresh();
  }
}

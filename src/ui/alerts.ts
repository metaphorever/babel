import { type AlertKind, type Sim, type SimState } from '../sim';
import { clear, h } from './dom';
import { formatTime } from './ui';
import type { WindowManager } from './windows';

// Alerts (§16.9 step 5): which kinds the player has muted, kept in the
// browser across games, and the Alerts window: every recent alert, and a box
// per kind to turn it back on.

/** How each kind of alert is named in its "mute" box and the Alerts window. */
export const ALERT_KIND_TEXT: Record<AlertKind, string> = {
  notice: 'a worker putting in notice',
  quit: 'a worker quitting',
  patron: 'the patron losing patience (50%, 25%, 0)',
  supply: 'a supply running out',
  wages: 'the treasury unable to pay wages',
  scroll: 'a worker giving up on a scroll they can’t read',
  newcomer: 'a newcomer arriving',
  level: 'a tower level finished',
  goal: 'the patron’s goal reached',
  gone: 'everyone gone',
};

/** The order they're listed in the Alerts window. */
const KINDS: AlertKind[] = ['notice', 'quit', 'patron', 'supply', 'wages', 'scroll', 'newcomer', 'level'];

/** Info only: muted until the player turns them on. */
export const MUTED_BY_DEFAULT: readonly AlertKind[] = ['newcomer', 'level'];

/** The end of a game, or of the work: always shown, never muted (not even by "mute all"). */
export const NEVER_MUTED: readonly AlertKind[] = ['goal', 'gone'];

export interface Mutes {
  all: boolean;
  /** Kinds the player muted. */
  kinds: string[];
  /** Kinds muted by default that the player turned on. */
  on: string[];
}

const MUTE_KEY = 'babel.alerts.muted';

/** The player's muted alerts: all of them, or by kind. Kept in the browser, across games. */
export function readMutes(): Mutes {
  try {
    const m = JSON.parse(localStorage.getItem(MUTE_KEY) ?? '{}');
    return { all: !!m.all, kinds: Array.isArray(m.kinds) ? m.kinds : [], on: Array.isArray(m.on) ? m.on : [] };
  } catch {
    return { all: false, kinds: [], on: [] };
  }
}

export function writeMutes(m: Mutes): void {
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify(m));
  } catch {
    // private browsing: mutes last until the page closes
  }
}

/** Would an alert of this kind be shown? */
export function isMuted(kind: AlertKind, m: Mutes = readMutes()): boolean {
  if (NEVER_MUTED.includes(kind)) return false;
  if (m.all) return true;
  if (MUTED_BY_DEFAULT.includes(kind)) return !m.on.includes(kind);
  return m.kinds.includes(kind);
}

/** Mute or unmute one kind. */
export function setMuted(kind: AlertKind, muted: boolean): void {
  const m = readMutes();
  m.kinds = m.kinds.filter((k) => k !== kind);
  m.on = m.on.filter((k) => k !== kind);
  if (MUTED_BY_DEFAULT.includes(kind)) {
    if (!muted) m.on.push(kind);
  } else if (muted) m.kinds.push(kind);
  writeMutes(m);
}

/**
 * The Alerts window (the menu bar's list): the latest alerts, newest first,
 * muted ones too, and which kinds pop up.
 */
export class AlertsPanel {
  private body: HTMLElement;
  private lastShown = '';

  constructor(
    wm: WindowManager,
    private sim: Sim,
    private showWorker: (id: number) => void,
  ) {
    const win = wm.create('alerts', 'Alerts', 220, 34, 360);
    this.body = h('div');
    win.body.append(this.body);
  }

  private get s(): SimState {
    return this.sim.state;
  }

  refresh(): void {
    // rebuild only when something changed, so the checkboxes don't flicker under the mouse
    const m = readMutes();
    const key = `${this.s.alerts[this.s.alerts.length - 1]?.id ?? 0}|${JSON.stringify(m)}|${this.s.workers.length}`;
    if (key === this.lastShown && this.body.childElementCount > 0) return;
    this.lastShown = key;
    clear(this.body);
    const list = h('div', { class: 'alert-list' });
    if (this.s.alerts.length === 0) list.append(h('p', { class: 'hint' }, 'No alerts yet.'));
    for (let i = this.s.alerts.length - 1; i >= 0; i--) {
      const a = this.s.alerts[i];
      const w = a.workerId !== null ? this.s.workers.find((x) => x.id === a.workerId && !x.leaving) : undefined;
      list.append(
        h(
          'div',
          { class: 'alert-entry' },
          h('div', {}, h('span', { class: 'when' }, formatTime(a.tick)), ' ', h('b', {}, a.title), isMuted(a.kind, m) ? h('span', { class: 'hint' }, ' (muted)') : ''),
          h('div', { class: 'hint' }, a.text),
          w ? h('button', { class: 'btn btn-small', onclick: () => this.showWorker(w.id) }, `Show ${w.name}`) : '',
        ),
      );
    }
    const all = h('input', { type: 'checkbox', checked: m.all, onchange: () => writeMutes({ ...readMutes(), all: all.checked }) });
    const boxes = KINDS.map((k) => {
      const box = h('input', { type: 'checkbox', checked: !isMuted(k, { ...m, all: false }), disabled: m.all, onchange: () => setMuted(k, !box.checked) });
      return h('label', { class: 'alert-mute' }, box, ` ${ALERT_KIND_TEXT[k]}${MUTED_BY_DEFAULT.includes(k) ? ' (off unless ticked)' : ''}`);
    });
    this.body.append(
      list,
      h('div', { class: 'section-label' }, 'Pop up when…'),
      ...boxes,
      h('label', { class: 'alert-mute' }, all, ' Mute all alerts'),
      h('div', { class: 'hint' }, 'Kept in this browser, for every game. The patron’s goal and everyone leaving always pop up. Muted alerts still land in the list above.'),
    );
  }
}

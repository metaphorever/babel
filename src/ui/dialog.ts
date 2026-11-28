import { h } from './dom';

// A System 7 dialog for screens with no game behind them (the title screen,
// the New Game screen) and for the Babel menu's windows in a game. One at a
// time; while one is open the game stands still (game.ts checks dialogOpen).

export interface DialogButton {
  label: string;
  primary?: boolean;
  /** Return false to keep the dialog open. */
  run: () => void | boolean;
}

let open: HTMLElement | null = null;

export function dialogOpen(): boolean {
  return open !== null;
}

export function closeDialog(): void {
  open?.remove();
  open = null;
}

/** Show a dialog in `root`. `wide` for the bigger ones (About). */
export function showDialog(root: HTMLElement, title: string, body: (Node | string | null)[], buttons: DialogButton[], opts: { wide?: boolean; className?: string } = {}): HTMLElement {
  closeDialog();
  const btns = buttons.map((b) =>
    h(
      'button',
      {
        class: `btn${b.primary ? ' btn-default' : ''}`,
        onclick: () => {
          if (b.run() === false) return;
          closeDialog();
        },
      },
      b.label,
    ),
  );
  const dialog = h('div', { class: `dialog${opts.wide ? ' dialog-wide' : ''}${opts.className ? ` ${opts.className}` : ''}`, role: 'dialog', 'aria-label': title }, h('div', { class: 'dialog-title' }, title));
  for (const b of body) if (b !== null) dialog.append(b);
  dialog.append(h('div', { class: 'row row-end dialog-buttons' }, ...btns));
  const back = h('div', { class: 'modal-back' }, dialog);
  back.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Escape is Cancel, or the only button there is
      (btns.find((_, i) => buttons[i].label === 'Cancel') ?? (btns.length === 1 ? btns[0] : null))?.click();
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      btns.find((_, i) => buttons[i].primary)?.click();
    }
  });
  root.append(back);
  open = back;
  (btns.find((_, i) => buttons[i].primary) ?? btns[0])?.focus();
  return dialog;
}

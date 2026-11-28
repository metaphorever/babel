import { h } from './dom';
import { uiScale } from './prefs';

/** The screen in the interface's own pixels (smaller than the window when the interface is scaled up). */
function screenW(): number {
  return window.innerWidth / uiScale();
}
function screenH(): number {
  return window.innerHeight / uiScale();
}

// A minimal System 7 style window manager: pinstriped title bars, a close
// box, dragging, and click-to-front.

export interface Win {
  id: string;
  el: HTMLElement;
  body: HTMLElement;
  title: HTMLElement;
  open: boolean;
}

export class WindowManager {
  private wins = new Map<string, Win>();
  private z = 10;

  constructor(private root: HTMLElement) {}

  /** Negative x / y are measured from the right / bottom edge, resolved on first show. */
  private anchors = new Map<string, { x: number; y: number; placed: boolean }>();

  create(id: string, title: string, x: number, y: number, width: number): Win {
    const titleText = h('span', { class: 'win-title-text' }, title);
    const close = h('button', { class: 'win-close', title: 'Close', 'aria-label': 'Close' });
    const titleBar = h('div', { class: 'win-title' }, close, titleText);
    const body = h('div', { class: 'win-body' });
    const el = h('div', { class: 'win', role: 'dialog', 'aria-label': title }, titleBar, body);
    this.anchors.set(id, { x, y, placed: false });
    el.style.width = `${width}px`;
    el.style.display = 'none';
    const win: Win = { id, el, body, title: titleText, open: false };
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close(id);
    });
    el.addEventListener('mousedown', () => this.front(id));
    this.makeDraggable(el, titleBar);
    this.root.append(el);
    this.wins.set(id, win);
    return win;
  }

  get(id: string): Win | undefined {
    return this.wins.get(id);
  }

  show(id: string): void {
    const w = this.wins.get(id);
    if (!w) return;
    w.open = true;
    w.el.style.display = '';
    const a = this.anchors.get(id)!;
    if (!a.placed) {
      a.placed = true;
      const left = a.x < 0 ? screenW() + a.x : a.x;
      const top = a.y < 0 ? screenH() + a.y : a.y;
      w.el.style.left = `${left}px`;
      w.el.style.top = `${top}px`;
    }
    this.keepOnScreen(w.el);
    this.front(id);
  }

  /** Pull a window back into view (after a resize, or a bad first position). */
  keepOnScreen(el: HTMLElement): void {
    const maxLeft = Math.max(0, screenW() - el.offsetWidth - 4);
    const maxTop = Math.max(24, screenH() - Math.min(el.offsetHeight, 120));
    el.style.left = `${Math.max(0, Math.min(maxLeft, el.offsetLeft))}px`;
    el.style.top = `${Math.max(24, Math.min(maxTop, el.offsetTop))}px`;
  }

  keepAllOnScreen(): void {
    for (const w of this.wins.values()) if (w.open) this.keepOnScreen(w.el);
  }

  close(id: string): void {
    const w = this.wins.get(id);
    if (!w) return;
    w.open = false;
    w.el.style.display = 'none';
  }

  toggle(id: string): void {
    const w = this.wins.get(id);
    if (w?.open) this.close(id);
    else this.show(id);
  }

  front(id: string): void {
    const w = this.wins.get(id);
    if (w) w.el.style.zIndex = String(++this.z);
  }

  private makeDraggable(el: HTMLElement, handle: HTMLElement): void {
    handle.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      // mouse positions are in screen pixels; a window's position is in the interface's, which differ when it's scaled
      const z = uiScale();
      const sx = e.clientX / z - el.offsetLeft;
      const sy = e.clientY / z - el.offsetTop;
      const move = (m: MouseEvent) => {
        const x = Math.max(0, Math.min(screenW() - 60, m.clientX / z - sx));
        const y = Math.max(20, Math.min(screenH() - 20, m.clientY / z - sy));
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }
}

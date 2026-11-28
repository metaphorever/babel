import { TICKS_PER_SECOND, step, type GameSettings } from '../sim';
import { WELCOMES, keepBuilding, scrambled, showcaseState } from './showcase';
import { Renderer, TILE } from '../render/renderer';
import { titleWords } from '../render/titleText';
import { h } from './dom';
import { closeDialog, showDialog } from './dialog';
import { showAbout } from './about';
import { showLoadGame } from './loadgame';
import { showNewGame } from './newgame';
import { showSettings } from './settings';
import { PREFS_EVENT, prefs } from './prefs';

// The title screen (§16.9 step 9). A showcase colony runs behind it, zoomed
// out, with no controls: a large camp, a tower nine levels tall with the
// tenth going up, and workers at it. Above, "Welcome" scrambles through its
// translations over "to Babel", and four buttons: New Game, Load Game,
// Settings, About.

const SHOW = {
  /** Each word is held this long, then scrambles into the next for `scramble`. */
  hold: 3200,
  scramble: 900,
  /** How often the scramble redraws. */
  frame: 55,
};

export interface TitleOptions {
  /** A save that couldn't be loaded, to say so. */
  error?: string | null;
  /** Start a game from the New Game screen. */
  play: (seed: number, settings: GameSettings) => void;
}

export function showTitle(canvas: HTMLCanvasElement, ui: HTMLElement, opts: TitleOptions): void {
  // ------------------------------------------------ the colony behind it
  const s = showcaseState();
  const renderer = new Renderer(canvas);
  renderer.labels = false;
  let running = true;
  let acc = 0;
  let last = performance.now();
  function frame(now: number): void {
    if (!running) return;
    const dt = Math.min(250, now - last);
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= 1000 / TICKS_PER_SECOND && n < 8) {
      step(s);
      if (s.tick % 100 === 0) keepBuilding(s);
      acc -= 1000 / TICKS_PER_SECOND;
      n++;
    }
    if (n === 8) acc = 0;
    renderer.resize();
    renderer.zoom = Math.max(1, Math.round(window.devicePixelRatio || 1));
    renderer.stillClouds = prefs().reduceMotion;
    // the tower three-quarters of the way across, the ground near the bottom
    const t = s.tower!;
    renderer.camX = ((t.x0 + t.x1 + 1) / 2) * TILE - renderer.viewW * 0.75;
    renderer.camY = (s.height - 16) * TILE - renderer.viewH * 0.84;
    renderer.render(s, acc / (1000 / TICKS_PER_SECOND), null, null);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ------------------------------------------------------ the words
  const welcome = h('canvas', { class: 'title-words', role: 'img', 'aria-label': 'Welcome' });
  const toBabel = h('canvas', { class: 'title-words', role: 'img', 'aria-label': 'to Babel' });
  /** One whole-number size for every word, so the title never jumps: as big as fits, 2× to 4×. */
  const widest = Math.max(...WELCOMES.map((w) => titleWords(w).width));
  const scaleFor = () => Math.max(2, Math.min(4, Math.floor((window.innerWidth * 0.9) / widest)));
  const paint = (el: HTMLCanvasElement, text: string) => {
    const pic = titleWords(text);
    el.width = pic.width;
    el.height = pic.height;
    el.getContext('2d')!.drawImage(pic, 0, 0);
    const z = scaleFor();
    el.style.width = `${pic.width * z}px`;
    el.style.height = `${pic.height * z}px`;
    // the two lines closer than a line apart: each word has room for accents and the outline above and below
    if (el === toBabel) el.style.marginTop = `${-6 * z}px`;
  };
  paint(welcome, WELCOMES[0]);
  paint(toBabel, 'to Babel');
  window.addEventListener('resize', () => {
    if (!running) return;
    paint(toBabel, 'to Babel');
    paint(welcome, welcome.getAttribute('aria-label') ?? WELCOMES[0]);
  });

  // "Welcome" scrambles through its translations (or, with reduced motion, simply changes)
  let at = 0;
  let timer = 0;
  const next = () => {
    if (!running) return;
    const from = WELCOMES[at];
    at = (at + 1) % WELCOMES.length;
    const to = WELCOMES[at];
    welcome.setAttribute('aria-label', to);
    if (prefs().reduceMotion) {
      paint(welcome, to);
      timer = window.setTimeout(next, SHOW.hold);
      return;
    }
    const t0 = performance.now();
    const tick = () => {
      if (!running) return;
      const t = (performance.now() - t0) / SHOW.scramble;
      if (t >= 1) {
        paint(welcome, to);
        timer = window.setTimeout(next, SHOW.hold);
        return;
      }
      paint(welcome, scrambled(from, to, t, Math.random));
      timer = window.setTimeout(tick, SHOW.frame);
    };
    tick();
  };
  timer = window.setTimeout(next, SHOW.hold);

  // ------------------------------------------------------ the buttons
  const button = (label: string, run: () => void, primary = false) => h('button', { class: `btn title-btn${primary ? ' btn-default' : ''}`, onclick: run }, label);
  const menu = h(
    'div',
    { class: 'title-menu' },
    button('New Game', () => newGame(), true),
    button('Load Game', () => showLoadGame(ui)),
    button('Settings', () => showSettings(ui)),
    button('About', () => showAbout(ui)),
  );
  // the words stay out of the interface's scaling (a 125% pixel font would blur); the buttons follow it
  const screen = h('div', { class: 'title-screen' }, h('div', { class: 'title-words-box' }, welcome, toBabel), menu);
  const sizeMenu = () => menu.style.setProperty('zoom', String(prefs().uiScale));
  sizeMenu();
  window.addEventListener(PREFS_EVENT, sizeMenu);
  document.body.append(screen);
  (menu.querySelector('.btn-default') as HTMLButtonElement | null)?.focus();

  function newGame(): void {
    closeDialog();
    screen.style.display = 'none';
    showNewGame(ui, {
      cancel: () => {
        screen.style.display = '';
        (menu.querySelector('.btn-default') as HTMLButtonElement | null)?.focus();
      },
      start: (seed, settings) => {
        running = false;
        window.clearTimeout(timer);
        screen.remove();
        opts.play(seed, settings);
      },
    });
  }

  if (opts.error) showDialog(ui, 'Couldn’t load the game', [h('p', {}, opts.error)], [{ label: 'OK', primary: true, run: () => undefined }]);
}

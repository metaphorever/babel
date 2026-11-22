import './ui/style.css';
import { Sim, TICKS_PER_SECOND } from './sim';
import { Renderer, TILE } from './render/renderer';
import { Ui } from './ui/ui';

// Seed from the URL (?seed=123) so a playtest can be reproduced exactly.
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 1 + Math.floor(Math.random() * 1e9);
const sim = new Sim(seed);

const canvas = document.getElementById('world') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
renderer.resize();
const boardSite = sim.state.sites.find((s) => s.kind === 'board')!;
/** Frame the board with the ground about two-thirds of the way down. */
function frameStart(): void {
  renderer.centerOn(boardSite.x0 * TILE, (boardSite.y + 1) * TILE);
  renderer.camY -= renderer.viewH * 0.17;
}
// the page can load while hidden (zero size), so frame once there's a size
let framed = false;

// speed index: 0 paused, 1 = 1x, 2 = 2x, 3 = 4x
const SPEEDS = [0, 1, 2, 4];
let speed = 1;
let lastSpeed = 1;

const ui = new Ui(document.getElementById('ui')!, sim, {
  getSpeed: () => speed,
  setSpeed: (n) => {
    if (n > 0) lastSpeed = n;
    speed = n;
  },
  centerOnTile: (x, y) => renderer.centerOn(x * TILE, y * TILE),
  centerOnWorker: (id) => {
    const w = sim.state.workers.find((x) => x.id === id);
    if (w) renderer.centerOn(w.x * TILE, w.y * TILE);
  },
});

// ------------------------------------------------------------------ input

const keys = new Set<string>();
const typing = (e: Event) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
};

window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  const k = e.key.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    if (speed === 0) speed = lastSpeed;
    else {
      lastSpeed = speed;
      speed = 0;
    }
    return;
  }
  if (k === '1' || k === '2' || k === '3') {
    speed = Number(k);
    lastSpeed = speed;
    return;
  }
  if (k === 'n') {
    renderer.showNames = !renderer.showNames;
    return;
  }
  if (k === 'escape') {
    ui.select(null);
    return;
  }
  keys.add(k);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

let hover: number | null = null;
let drag: { x: number; y: number; camX: number; camY: number } | null = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1 || e.button === 2) {
    e.preventDefault();
    drag = { x: e.clientX, y: e.clientY, camX: renderer.camX, camY: renderer.camY };
  }
});
window.addEventListener('mouseup', () => (drag = null));
canvas.addEventListener('mousemove', (e) => {
  if (drag) {
    const dpr = window.devicePixelRatio || 1;
    renderer.camX = drag.camX - ((e.clientX - drag.x) * dpr) / renderer.zoom;
    renderer.camY = drag.camY - ((e.clientY - drag.y) * dpr) / renderer.zoom;
    return;
  }
  const p = renderer.screenToWorld(e.clientX, e.clientY);
  hover = renderer.workerAt(sim.state, p.x, p.y)?.id ?? null;
  canvas.style.cursor = hover !== null ? 'pointer' : 'default';
});
canvas.addEventListener('click', (e) => {
  const p = renderer.screenToWorld(e.clientX, e.clientY);
  const w = renderer.workerAt(sim.state, p.x, p.y);
  if (w) {
    ui.select(w.id);
    return;
  }
  const site = renderer.siteAt(sim.state, p.x, p.y);
  if (site?.kind === 'board') ui.wm.show('board');
  else if (site?.kind === 'scriptorium') ui.wm.show('scriptorium');
  else if (site?.kind === 'foundation') ui.wm.show('tower');
  else if (site?.kind === 'stockpile' || site?.kind === 'kitchen') ui.wm.show('stores');
  else ui.select(null);
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    renderer.zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
  },
  { passive: false },
);

// ------------------------------------------------------------------- loop

const TICK_MS = 1000 / TICKS_PER_SECOND;
let acc = 0;
let last = performance.now();
let uiTimer = 0;

function frame(now: number) {
  const dt = Math.min(250, now - last);
  last = now;
  if (!framed && canvas.width > 0 && canvas.height > 0) {
    frameStart();
    framed = true;
  }

  // pan: a constant speed on screen, whatever the zoom
  const pan = (dt / 1000) * 600 * (window.devicePixelRatio || 1) / renderer.zoom;
  if (keys.has('a') || keys.has('arrowleft')) renderer.camX -= pan;
  if (keys.has('d') || keys.has('arrowright')) renderer.camX += pan;
  if (keys.has('w') || keys.has('arrowup')) renderer.camY -= pan;
  if (keys.has('s') || keys.has('arrowdown')) renderer.camY += pan;
  renderer.clampCamera(sim.state);

  const mult = SPEEDS[speed];
  if (mult > 0) {
    acc += dt * mult;
    let n = 0;
    while (acc >= TICK_MS && n < 16) {
      sim.step();
      acc -= TICK_MS;
      n++;
    }
    if (n === 16) acc = 0; // fell behind; drop the backlog rather than spiral
  }
  const alpha = mult > 0 ? acc / TICK_MS : 0;
  renderer.render(sim.state, alpha, ui.selected, hover);

  uiTimer += dt;
  if (uiTimer > 200) {
    uiTimer = 0;
    ui.refresh();
  }
  requestAnimationFrame(frame);
}
ui.refresh();
requestAnimationFrame(frame);

// handy in the console while tuning: babel.sim.state, babel.seed
(window as unknown as { babel: unknown }).babel = { sim, seed, renderer };
console.info(`Babel P0 — seed ${seed}. Reload with ?seed=${seed} to replay this start.`);

import { TICKS_PER_SECOND, type Sim, type SaveFile } from './sim';
import { Renderer, TILE, ZOOMS } from './render/renderer';
import { Ui } from './ui/ui';
import { BuildUi } from './ui/build';
import { SavesPanel } from './ui/saves';
import { h } from './ui/dom';
import { dialogOpen } from './ui/dialog';
import { showAbout } from './ui/about';
import { showSettings } from './ui/settings';
import { prefs } from './ui/prefs';

/** A game loaded from a save: its interface part goes back on. */
export interface Loaded {
  save: SaveFile;
}

/**
 * Play a game: the world, the windows, input and the loop. Called once a
 * page, when there's a game to play (a save, a quick start from the URL, or
 * the New Game screen's Start). Quitting reloads the page.
 */
export function play(sim: Sim, loaded: Loaded | null): void {
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const renderer = new Renderer(canvas);
  renderer.resize();
  /** Frame the board (or, at the opening, the patron's supplies) with the ground about two-thirds of the way down. */
  function frameStart(): void {
    const focus = sim.state.sites.find((s) => s.kind === 'board') ?? sim.state.sites.find((s) => s.supplies) ?? sim.state.sites[0];
    renderer.centerOn(focus.x0 * TILE, (focus.y + 1) * TILE);
    renderer.camY -= renderer.viewH * 0.17;
  }
  // the page can load while hidden (zero size), so frame once there's a size
  let framed = false;

  // speed index: 0 paused, 1 = 1x, 2 = 2x, 3 = 4x
  const SPEEDS = [0, 1, 2, 4];
  let speed = 1;
  let lastSpeed = 1;

  const uiRoot = document.getElementById('ui')!;
  /** The page without its URL options: the title screen. */
  const quitGame = () => location.assign(location.pathname);
  const ui = new Ui(uiRoot, sim, {
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
    sendBonus: (id) => build.bonusDialog(id),
    recruit: () => build.recruitDialog(),
    showSite: (site) => {
      renderer.centerOn(((site.x0 + site.x1 + 1) / 2) * TILE, site.y * TILE);
      build.inspect({ kind: 'site', site });
    },
    about: () => showAbout(uiRoot),
    settings: () => showSettings(uiRoot),
    quitToTitle: () =>
      build.ask('Quit to Title', [h('div', { class: 'dialog-title' }, 'Quit to the title screen?'), h('p', {}, 'Anything in this game since you last saved it will be lost. (It saves itself at midnight, and the File menu saves it whenever you like.)')], [
        { label: 'Quit', run: () => quitGame() },
        { label: 'Cancel', primary: true, run: () => undefined },
      ]),
  });
  const build = new BuildUi(document.getElementById('ui')!, ui.wm, sim, renderer, ui.scriptorium, {
    // back to the title screen
    quitGame: () => quitGame(),
    centerOnTile: (x, y) => renderer.centerOn(x * TILE, y * TILE),
    showWorker: (id) => {
      ui.select(id);
      const w = sim.state.workers.find((x) => x.id === id);
      if (w) renderer.centerOn(w.x * TILE, w.y * TILE);
    },
  });

  const saves = new SavesPanel(ui.wm, sim, {
    ask: (title, body, buttons, focus) => build.ask(title, body, buttons, focus),
    uiSnapshot: () => ({ ...build.uiSnapshot(), camera: { x: renderer.camX, y: renderer.camY, zoom: renderer.zoom } }),
  });
  if (loaded) {
    build.restoreUi(loaded.save.ui);
    const cam = loaded.save.ui.camera;
    if (cam && [cam.x, cam.y, cam.zoom].every(Number.isFinite)) {
      if ((ZOOMS as readonly number[]).includes(cam.zoom)) renderer.zoom = cam.zoom;
      renderer.camX = cam.x;
      renderer.camY = cam.y;
      framed = true;
    }
  }

  // ------------------------------------------------------------------ input

  const keys = new Set<string>();
  const typing = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
  };

  /** Put down whatever build tool is in hand. Returns false if there wasn't one. */
  function dropTool(): boolean {
    if (build.placing) build.cancel();
    else if (build.demolishing) build.stopDemolish();
    else return false;
    return true;
  }

  window.addEventListener('keydown', (e) => {
    if (typing(e) || build.modalOpen) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && dropTool()) return;
    if (k === '[' || k === ']') {
      build.nudgeWidth(k === '[' ? -1 : 1);
      return;
    }
    if (k === 'b') {
      ui.wm.toggle('build');
      return;
    }
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
  let drag: { x: number; y: number; camX: number; camY: number; button: number; moved: boolean } | null = null;

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      drag = { x: e.clientX, y: e.clientY, camX: renderer.camX, camY: renderer.camY, button: e.button, moved: false };
    }
  });
  // a right-click that doesn't drag puts the tool down, like Escape; a right-drag still pans
  window.addEventListener('mouseup', (e) => {
    if (drag && e.button === 2 && drag.button === 2 && !drag.moved && !build.modalOpen) dropTool();
    drag = null;
  });
  canvas.addEventListener('mousemove', (e) => {
    if (drag) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      const dpr = window.devicePixelRatio || 1;
      renderer.camX = drag.camX - ((e.clientX - drag.x) * dpr) / renderer.zoom;
      renderer.camY = drag.camY - ((e.clientY - drag.y) * dpr) / renderer.zoom;
      return;
    }
    const p = renderer.screenToWorld(e.clientX, e.clientY);
    if (build.hover(p.x, p.y)) {
      hover = null;
      canvas.style.cursor = 'crosshair';
      return;
    }
    hover = renderer.workerAt(sim.state, p.x, p.y)?.id ?? null;
    canvas.style.cursor = hover !== null ? 'pointer' : 'default';
  });
  canvas.addEventListener('click', (e) => {
    const p = renderer.screenToWorld(e.clientX, e.clientY);
    if (build.click(p.x, p.y)) return;
    const w = renderer.workerAt(sim.state, p.x, p.y);
    if (w) {
      ui.select(w.id);
      return;
    }
    const thing = renderer.thingAt(sim.state, p.x, p.y);
    const site = thing?.kind === 'site' ? thing.site : null;
    if (site?.kind === 'board' && !site.build) ui.wm.show('board');
    else if (site?.kind === 'scriptorium' && !site.build) ui.wm.show('scriptorium');
    else if (site?.kind === 'foundation') ui.wm.show('tower');
    else if (site?.supplies || (site?.kind === 'stockpile' && site.level > 0)) ui.wm.show('stores');
    else if (thing && (thing.kind === 'building' || site?.buildingId !== null || site?.kind === 'stockpile' || site?.kind === 'shelves' || site?.build)) build.inspect(thing);
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

    // time stands still while a dialog asks something
    const mult = build.modalOpen || dialogOpen() ? 0 : SPEEDS[speed];
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
    saves.tick();
    const alpha = mult > 0 ? acc / TICK_MS : 0;
    renderer.stillClouds = prefs().reduceMotion;
    renderer.render(sim.state, alpha, ui.selected, hover);

    uiTimer += dt;
    if (uiTimer > 200) {
      uiTimer = 0;
      ui.refresh();
      build.refresh();
    }
    requestAnimationFrame(frame);
  }
  ui.refresh();
  build.refresh();
  requestAnimationFrame(frame);


  // handy in the console while tuning: babel.sim.state, babel.seed
  const seed = sim.state.seed;
  (window as unknown as { babel: unknown }).babel = { sim, seed, renderer, ui, build, saves };
  console.info(loaded ? `Babel P1 — loaded “${loaded.save.name}” (seed ${seed}).` : `Babel P1 — seed ${seed}. Reload with ?seed=${seed} to replay this start (add &start=prebuilt to skip the opening).`);
}

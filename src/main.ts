import './ui/style.css';
import { Sim, gameSettings, TOWER, type DifficultyChoice, type StartMode } from './sim';
import { play } from './game';
import { showTitle } from './ui/title';
import { takeBootSave } from './ui/saves';
import { applyPrefs } from './ui/prefs';
import { loadArt } from './render/artLoader';

// Starting the page: a save handed over by the Saved Games window (§16.9
// step 7), a quick start from the URL for playtests, or the title screen
// (§16.9 step 9), whose New Game button opens the New Game screen (step 8).
//
// Quick starts: ?seed=123 reproduces a game exactly; ?difficulty=easy|normal|hard|custom|sandbox,
// ?start=prebuilt|large (or the opening without it) and ?goal=50 pick the rest. Any of them skips the screen.
applyPrefs();
// Sprite sheets from public/art/ replace the built-in art when present (for the title's colony and the game alike). While
// the dev server is running, coming back to the window reloads them, so you can save in an image editor, switch back,
// and see the change.
void loadArt();
if (import.meta.env.DEV) window.addEventListener('focus', () => void loadArt());
const params = new URLSearchParams(location.search);
const boot = takeBootSave();
const quick = ['seed', 'difficulty', 'start', 'goal'].some((k) => params.has(k));

if (boot?.ok) {
  play(Sim.fromState(boot.state), boot);
} else if (quick) {
  const seed = Number(params.get('seed')) || 1 + Math.floor(Math.random() * 1e9);
  const d = params.get('difficulty');
  const difficulty: DifficultyChoice = d === 'easy' || d === 'hard' || d === 'custom' || d === 'sandbox' ? d : 'normal';
  const st = params.get('start');
  const start: StartMode = st === 'prebuilt' || st === 'large' ? st : 'opening';
  // a goal of 30 unless asked, as quick starts always had
  const goal = Number(params.get('goal')) || TOWER.goal;
  play(new Sim(seed, gameSettings(difficulty, start, { goal })), null);
} else {
  showTitle(document.getElementById('world') as HTMLCanvasElement, document.getElementById('ui')!, {
    error: boot && !boot.ok ? boot.error : null,
    play: (seed, settings) => play(new Sim(seed, settings), null),
  });
}

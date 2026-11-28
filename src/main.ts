import './ui/style.css';
import { Sim, gameSettings, TOWER, type DifficultyChoice, type StartMode } from './sim';
import { play } from './game';
import { showNewGame } from './ui/newgame';
import { takeBootSave } from './ui/saves';

// Starting the page: a save handed over by the Saved Games window (§16.9
// step 7), a quick start from the URL for playtests, or the New Game screen
// (§16.9 step 8). The title screen (step 9) will come before the last.
//
// Quick starts: ?seed=123 reproduces a game exactly; ?difficulty=easy|normal|hard|custom|sandbox,
// ?start=prebuilt|large (or the opening without it) and ?goal=50 pick the rest. Any of them skips the screen.
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
  showNewGame(document.getElementById('ui')!, {
    error: boot && !boot.ok ? `Couldn’t load the game: ${boot.error}` : null,
    start: (seed, settings) => play(new Sim(seed, settings), null),
  });
}

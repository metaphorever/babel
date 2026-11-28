import { h } from './dom';
import { showDialog } from './dialog';

// About Babel (§16.4): who did what, and the user's acknowledgements. The
// text is docs/CREDITS.md's; keep the two the same.

const THANKS: (string | Node)[][] = [
  [h('b', {}, 'Moses'), ' (or another author perhaps, I’m no Biblical scholar) for writing Genesis 11'],
  [h('b', {}, 'Derin Elada'), ' for the ', h('a', { href: 'https://www.tumblr.com/derinthescarletpescatarian/813115583067504640?source=share', target: '_blank', rel: 'noopener' }, 'original inspiration'), ' to make this game (even though they said the game should have “nothing to do with the story or its themes”)'],
  [h('b', {}, 'Ted Chiang'), ' for the beautifully detailed logistics involved in building a tower to the heavens in his novelette ', h('i', {}, 'Tower of Babylon')],
  [h('b', {}, 'Duane Blehm'), ' for creating ', h('i', {}, 'Stunt Copter'), ' and many other Mac classics. The horse and wagon and the clouds are based on his designs, in his honor'],
  [h('b', {}, 'Rick Holzgrafe'), ' for creating ', h('i', {}, 'Scarab of Ra'), ', my earliest and longest-running computer game obsession'],
  [h('b', {}, 'Christopher Kent Wigginton'), ' for creating ', h('i', {}, 'Radical Castle'), ' and introducing me to the concept of rage-quitting'],
  [h('b', {}, 'John Calhoun'), ' for creating ', h('i', {}, 'Glider'), ' and showing me just how beautiful lovingly crafted 1-bit graphics could be'],
  [h('b', {}, 'Klei and the creators of ', h('i', {}, 'Oxygen Not Included')), ' for getting me hooked on colony sim games and providing much of the mechanical inspiration for this game'],
  [h('b', {}, 'Bill Atkinson'), ' for creating HyperCard and giving me an endless digital sandbox to build and play in'],
  [h('b', {}, 'Steve Jobs, Steve Wozniak and everyone at Apple'), ' for creating the Macintosh Plus and System 7 and beyond'],
  [h('b', {}, 'My parents, John and Clare,'), ' for always encouraging and supporting me and nurturing my creative endeavors'],
  [h('b', {}, 'My loving wife, Sarah,'), ' for reminding me not to stay up too late “talking to AI” about my game'],
];

/** Clover's mark, the user's pixel art (art-src/shots/clover.png), ink only. */
const CLOVER = [
  '.....11.11.....',
  '....1..1111....',
  '....1.11111....',
  '....1..1111....',
  '.111.11.11.111.',
  '11111.111.1...1',
  '111111.1.11.1.1',
  '.111.11.11.111.',
  '1.1.11.1.111111',
  '1...1..1..11111',
  '.111....1..111.',
  '........1......',
  '.......1.......',
  '.....11........',
];

/** The clover at 1× beside the text (its 14 rows sit on a 12 px line); pixel art only scales by whole numbers, and at 1× it stays crisp on any screen. */
function cloverMark(): HTMLCanvasElement {
  const w = CLOVER[0].length;
  const ht = CLOVER.length;
  const c = h('canvas', { class: 'clover-mark', width: w, height: ht, role: 'img', 'aria-label': 'a four-leaf clover' });
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) if (CLOVER[y][x] === '1') g.fillRect(x, y, 1, 1);
  c.style.width = `${w}px`;
  c.style.height = `${ht}px`;
  return c;
}

export function showAbout(root: HTMLElement): void {
  showDialog(
    root,
    'About Babel',
    [
      h('p', { class: 'about-lede' }, 'A colony sim about building the Tower of Babel. You can’t touch anything: you write orders, your workers carry them out, and the higher they climb, the more their words drift into other tongues.'),
      h('div', { class: 'section-label' }, 'Who did what'),
      h(
        'ul',
        { class: 'about-list' },
        h('li', {}, h('b', {}, 'Game design, art direction and pixel art:'), ' Clover ', cloverMark()),
        h('li', {}, h('b', {}, 'Programming, design collaboration and placeholder art:'), ' Claude, an AI model made by Anthropic'),
        h('li', {}, h('b', {}, 'Horse, wagon, and clouds:'), ' based on designs by Duane Blehm'),
      ),
      h('div', { class: 'section-label' }, 'Many thanks to'),
      h('ul', { class: 'about-list about-thanks' }, ...THANKS.map((parts) => h('li', {}, ...parts))),
      h('p', { class: 'hint' }, 'A hobby project, open source and not for sale: ', h('a', { href: 'https://github.com/metaphorever/babel', target: '_blank', rel: 'noopener' }, 'github.com/metaphorever/babel'), '.'),
    ],
    [{ label: 'OK', primary: true, run: () => undefined }],
    { wide: true },
  );
}

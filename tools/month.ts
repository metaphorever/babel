// A 30-day colony with plenty of food and drink, to see how the social web
// and the economy settle over a month. Run: npm run sim:month
import { addWorker, createState, step } from '../src/sim/sim';
import { pinNotice } from '../src/sim/carriers';
import { FOREVER, makeOrder } from '../src/sim/lang';
import { pairLabel, feelOf, socialArrival, partnersOf } from '../src/sim/social';
import { BUILD, SOCIAL, TIME } from '../src/sim/tuning';
import { sitesOf } from '../src/sim/world';
import type { SimState } from '../src/sim/types';

BUILD.capacity.stockpile = 100000; // stockpiles never fill, so hauling never fails for lack of room

const DAYS = 30;
const SEEDS = [1, 2, 3, 4, 5, 6];

let RICH = true;
function stock(s: SimState) {
  s.gold = Math.max(s.gold, 5000);
  for (const p of sitesOf(s, 'pantry')) p.store.bread = 5000;
  for (const b of sitesOf(s, 'bar')) b.store.beer = 5000;
  s.patience = 100;
}

const LABELS = ['best friends', 'good friends', 'friends', '', 'frenemies', 'enemies'] as const;

function snapshot(s: SimState) {
  const ws = s.workers.filter((w) => !w.leaving);
  const count: Record<string, number> = Object.fromEntries(LABELS.map((l) => [l, 0]));
  let pairs = 0, sum = 0, warm = 0, cold = 0;
  for (let i = 0; i < ws.length; i++)
    for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i], b = ws[j];
      count[pairLabel(feelOf(a, b), feelOf(b, a))]++;
      pairs++;
      for (const v of [feelOf(a, b), feelOf(b, a)]) {
        sum += v;
        if (v >= SOCIAL.likes) warm++;
        if (v < SOCIAL.dislikes) cold++;
      }
    }
  return { pairs, count, mean: sum / (2 * pairs), warm: warm / (2 * pairs), cold: cold / (2 * pairs), workers: ws.length };
}

function run(size: number) {
  const days: ReturnType<typeof snapshot>[][] = [];
  const tally: Record<string, number> = {};
  let quits = 0;
  for (const seed of SEEDS) {
    const s = createState(seed);
    while (s.workers.length < size) socialArrival(s, addWorker(s));
    { s.notices = []; for (const [v, n] of [['MINE', 'STONE'], ['HAUL', 'STONE'], ['HARVEST', 'GRAIN'], ['HAUL', 'GRAIN'], ['CHOP', 'WOOD']] as const) pinNotice(s, makeOrder(v, n), FOREVER, 1, null); }
    if (RICH) for (const w of s.workers) w.purse = 400;
    stock(s);
    let bars = 0;
    const series = [snapshot(s)];
    let last = s.events[s.events.length - 1];
    for (let d = 1; d <= DAYS; d++) {
      for (let t = 0; t < TIME.dayTicks; t++) {
        step(s);
        if (t % 600 === 0) stock(s);
        for (const w of s.workers) if (w.activity.kind === 'bar' && w.activity.stage === 1 && w.activity.timer === 1) bars++;
        const from = last ? s.events.indexOf(last) + 1 : 0;
        for (const e of s.events.slice(from)) {
          const kind =
            /came to blows/.test(e.text) ? 'scuffles' :
            /have married/.test(e.text) ? 'weddings' :
            /become lovers|secretly seeing/.test(e.text) ? 'new lovers' :
            /divorced|split up/.test(e.text) ? 'breakups' :
            /found out/.test(e.text) ? 'affairs found out' :
            /has quit/.test(e.text) ? 'quits' :
            /leaving together/.test(e.text) ? 'spouse followed' :
            /friends|enemies|odd pair|drifted apart|hatchet|indifference|as close/.test(e.text) ? 'label changes' : null;
          if (kind) tally[kind] = (tally[kind] ?? 0) + 1;
          if (kind === 'quits') quits++;
        }
        last = s.events[s.events.length - 1];
      }
      series.push(snapshot(s));
    }
    days.push(series);
    tally['drinks per worker-day'] = (tally['drinks per worker-day'] ?? 0) + bars / DAYS / size;
    tally['gold sent home per worker-day'] = (tally['gold sent home per worker-day'] ?? 0) + s.sentHome / DAYS / size;
    tally['jobs per worker-day'] = (tally['jobs per worker-day'] ?? 0) + s.workers.reduce((n, w) => n + w.jobsDone, 0) / DAYS / size;
    if (seed === SEEDS[0]) {
      const ws = s.workers.filter((w) => !w.leaving);
      console.log(`  seed ${seed}, day ${DAYS}: couples ${s.social.ties.filter((t) => t.kind !== 'parent').length}, with 2+ partners ${ws.filter((w) => partnersOf(s, w.id).length > 1).length}`);
    }
  }
  console.log(`\n=== ${size} workers, ${SEEDS.length} seeds, ${DAYS} days (averages per colony) ===`);
  console.log('day | workers | mean feel | sides warm | sides cold | ' + LABELS.map((l) => (l || 'neutral').padStart(12)).join(' '));
  for (const d of [0, 1, 3, 7, 14, 21, 30]) {
    const avg = (f: (x: ReturnType<typeof snapshot>) => number) => days.reduce((n, sr) => n + f(sr[d]), 0) / days.length;
    const pct = (f: (x: ReturnType<typeof snapshot>) => number) => `${(avg(f) * 100).toFixed(0)}%`.padStart(10);
    console.log(
      `${String(d).padStart(3)} | ${avg((x) => x.workers).toFixed(1).padStart(7)} | ${avg((x) => x.mean).toFixed(3).padStart(9)} | ${pct((x) => x.warm)} | ${pct((x) => x.cold)} | ` +
        LABELS.map((l) => pct((x) => x.count[l] / x.pairs).padStart(12)).join(' '),
    );
  }
  console.log('events over the month, per colony:', Object.entries(tally).map(([k, v]) => `${k} ${(v / SEEDS.length).toFixed(1)}`).join(', '));
}

const t0 = Date.now();
console.log('--- RICH START: 400 gold each on day 0, food stocked, standing work notices ---');
RICH = true;
run(8);
RICH = false;
console.log('--- REALISTIC: food stocked, beer paid from wages (standing work notices at 1 gold) ---');
run(8);
run(16);
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);

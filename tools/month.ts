// A month in a colony, for tuning the social web and the economy.
//
//   npm run sim:month
//   npm run sim:month -- gossip.chance=0.5
//   npm run sim:month -- gossip.chance=0.5 vs gossip.chance=0.1 scuffle.sour=0.08
//   npm run sim:month -- --seeds=12 --days=45 --size=16 --rich
//
// Every run is a prebuilt colony with the pantries and bar kept stocked,
// roomy stockpiles, and standing work notices at 1 gold a unit, so workers
// earn, eat, drink, work side by side and socialize. Each variation (the
// settings after a "vs" change the baseline) runs on the same seeds as the
// baseline, so differences come from the settings, not the dice.
//
// Settings are paths into the tuning tables: SOCIAL is the default
// (gossip.chance, event.dailyCap, drift...), or name the table:
// REMIT.share.usual, ECONOMY.beerPrice, AI.barAfterDrink, MOOD.bar.value.
//
// What it prints, per variation:
//  - how the web ends up: labels, average feeling, events, purses;
//  - what moved feelings: each cause's share of all movement, and which
//    way it pushed (net), plus how much shared time the daily cap held back;
//  - what changed labels: for each pair whose label changed on a day, the
//    biggest push in that direction that day gets the credit;
//  - churn: labels that flipped back within three days (chaos, not waves).

import { addWorker, createState, step } from '../src/sim/sim';
import { pinNotice } from '../src/sim/carriers';
import { FOREVER, makeOrder } from '../src/sim/lang';
import { feelOf, feelingWatch, pairLabel, socialArrival } from '../src/sim/social';
import * as tuning from '../src/sim/tuning';
import { sitesOf } from '../src/sim/world';
import type { PairLabel, SimState } from '../src/sim/types';

// ------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const SEEDS = Array.from({ length: Number(flag('seeds', '8')) }, (_, i) => i + 1);
const DAYS = Number(flag('days', '30'));
const SIZE = Number(flag('size', '12'));
const RICH = args.includes('--rich');

type Override = { path: string; value: number };
const variants: { name: string; overrides: Override[] }[] = [{ name: 'baseline', overrides: [] }];
{
  let cur: Override[] | null = null;
  for (const a of args.filter((x) => !x.startsWith('--'))) {
    if (a === 'vs') {
      cur = null;
      continue;
    }
    const [path, v] = a.split('=');
    if (v === undefined || Number.isNaN(Number(v))) throw new Error(`Not a setting: ${a} (expected path=number)`);
    if (!cur) {
      cur = [];
      variants.push({ name: '', overrides: cur });
    }
    cur.push({ path, value: Number(v) });
  }
  for (const v of variants.slice(1)) v.name = v.overrides.map((o) => `${o.path}=${o.value}`).join(' ');
}

/** Find a tuning number by path; SOCIAL unless the first part names another table. */
function locate(path: string): { obj: Record<string, unknown>; key: string } {
  const parts = path.split('.');
  const tables = tuning as unknown as Record<string, unknown>;
  let obj: unknown = parts[0] in tables && parts[0] === parts[0].toUpperCase() ? tables[parts.shift()!] : tuning.SOCIAL;
  for (const p of parts.slice(0, -1)) obj = (obj as Record<string, unknown>)?.[p];
  const key = parts[parts.length - 1];
  if (!obj || typeof (obj as Record<string, unknown>)[key] !== 'number') throw new Error(`No tuning number at ${path}`);
  return { obj: obj as Record<string, unknown>, key };
}

// ------------------------------------------------------------- one run

const RANK: Record<PairLabel, number> = { enemies: -2, frenemies: -1, '': 0, friends: 1, 'good friends': 2, 'best friends': 3 };
const LABELS: PairLabel[] = ['best friends', 'good friends', 'friends', '', 'frenemies', 'enemies'];

interface Result {
  labels: Record<string, number>;
  meanFeel: number;
  meanMood: number;
  events: Record<string, number>;
  econ: Record<string, number>;
  moved: Record<string, { abs: number; net: number }>;
  capped: Record<string, number>;
  credit: Record<string, number>;
  changes: number;
  flipBacks: number;
  drama: Record<string, number>;
}

function stock(s: SimState) {
  s.gold = Math.max(s.gold, 5000);
  for (const p of sitesOf(s, 'pantry')) p.store.bread = 5000;
  for (const b of sitesOf(s, 'bar')) b.store.beer = 5000;
  s.patience = 100;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function runColony(seed: number, r: Result) {
  const s = createState(seed);
  while (s.workers.length < SIZE) socialArrival(s, addWorker(s));
  s.notices = [];
  for (const [v, n] of [['MINE', 'STONE'], ['HAUL', 'STONE'], ['HARVEST', 'GRAIN'], ['HAUL', 'GRAIN'], ['CHOP', 'WOOD']] as const) pinNotice(s, makeOrder(v, n), FOREVER, 1, null);
  if (RICH) for (const w of s.workers) w.purse = 400;
  stock(s);

  // feelings moved today, per pair, per cause (both directions summed)
  let today = new Map<string, Map<string, number>>();
  feelingWatch.moved = (from, to, why, by) => {
    const m = (r.moved[why] ??= { abs: 0, net: 0 });
    m.abs += Math.abs(by);
    m.net += by;
    const k = pairKey(from, to);
    const per = today.get(k) ?? new Map<string, number>();
    per.set(why, (per.get(why) ?? 0) + by);
    today.set(k, per);
  };
  feelingWatch.capped = (why, amount) => (r.capped[why] = (r.capped[why] ?? 0) + amount);

  const labelNow = () => {
    const out = new Map<string, PairLabel>();
    const ws = s.workers.filter((w) => !w.leaving);
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) out.set(pairKey(ws[i].id, ws[j].id), pairLabel(feelOf(ws[i], ws[j]), feelOf(ws[j], ws[i])));
    return out;
  };
  const history = new Map<string, PairLabel[]>();
  for (const [k, l] of labelNow()) history.set(k, [l]);

  let drinks = 0;
  let last = s.events[s.events.length - 1];
  for (let d = 1; d <= DAYS; d++) {
    for (let t = 0; t < tuning.TIME.dayTicks; t++) {
      step(s);
      if (t % 600 === 0) stock(s);
      for (const w of s.workers) if (w.activity.kind === 'bar' && w.activity.stage === 1 && w.activity.timer === 1) drinks++;
      const from = last ? s.events.indexOf(last) + 1 : 0;
      for (const e of s.events.slice(from)) {
        const kind = /leaving together/.test(e.text)
          ? 'spouses who followed'
          : /came to blows/.test(e.text)
          ? 'scuffles'
          : /have married/.test(e.text)
            ? 'weddings'
            : /become lovers|secretly seeing/.test(e.text)
              ? 'new couples'
              : /divorced|split up/.test(e.text)
                ? 'breakups'
                : /found out/.test(e.text)
                  ? 'affairs found out'
                  : /has quit/.test(e.text)
                    ? 'quits'
                    : null;
        if (kind) r.events[kind] = (r.events[kind] ?? 0) + 1;
      }
      last = s.events[s.events.length - 1];
    }
    // labels that changed today: credit the biggest push that way
    for (const [k, now] of labelNow()) {
      const h = history.get(k) ?? [];
      const was = h[h.length - 1];
      h.push(now);
      history.set(k, h);
      if (was === undefined || was === now) continue;
      r.changes++;
      const bump = (k: string) => (r.drama[k] = (r.drama[k] ?? 0) + 1);
      bump(RANK[now] > RANK[was] ? 'labels warmed' : 'labels cooled');
      if (RANK[was] < 1 && RANK[now] >= 1) bump('friendships formed');
      if (RANK[was] >= 1 && RANK[now] < 1) bump('friendships ended');
      if (h.slice(0, -1).some((l) => RANK[l] >= 1) && RANK[now] < 0 && RANK[was] >= 0) bump('falling outs (once friends, now foes)');
      if (RANK[was] >= 0 && now === 'enemies') bump('new enemies');
      if (h.length >= 4 && (h[h.length - 3] === now || h[h.length - 4] === now)) r.flipBacks++;
      const dir = Math.sign(RANK[now] - RANK[was]);
      let best = 'other';
      let most = 0;
      for (const [why, by] of today.get(k) ?? []) {
        if (Math.sign(by) === dir && Math.abs(by) > most) {
          most = Math.abs(by);
          best = why;
        }
      }
      r.credit[best] = (r.credit[best] ?? 0) + 1;
    }
    today = new Map();
  }
  feelingWatch.moved = null;
  feelingWatch.capped = null;

  const ws = s.workers.filter((w) => !w.leaving);
  for (const l of labelNow().values()) r.labels[l] = (r.labels[l] ?? 0) + 1;
  let sum = 0;
  let n = 0;
  for (const a of ws) for (const b of ws) if (a !== b) (sum += feelOf(a, b)), n++;
  r.meanFeel += sum / n;
  r.meanMood += ws.reduce((m, w) => m + w.mood, 0) / ws.length;
  const workerDays = SIZE * DAYS;
  r.econ['drinks a day'] = (r.econ['drinks a day'] ?? 0) + drinks / workerDays;
  r.econ['jobs a day'] = (r.econ['jobs a day'] ?? 0) + s.workers.reduce((m, w) => m + w.jobsDone, 0) / workerDays;
  r.econ['gold sent home a day'] = (r.econ['gold sent home a day'] ?? 0) + s.sentHome / workerDays;
  r.econ['couples at the end'] = (r.econ['couples at the end'] ?? 0) + s.social.ties.filter((t) => t.kind !== 'parent').length;
}

function runVariant(overrides: Override[]): Result {
  const saved = overrides.map((o) => {
    const { obj, key } = locate(o.path);
    const was = obj[key] as number;
    obj[key] = o.value;
    return () => (obj[key] = was);
  });
  const r: Result = { labels: {}, meanFeel: 0, meanMood: 0, events: {}, econ: {}, moved: {}, capped: {}, credit: {}, changes: 0, flipBacks: 0, drama: {} };
  try {
    for (const seed of SEEDS) runColony(seed, r);
  } finally {
    for (const undo of saved) undo();
  }
  return r;
}

// ------------------------------------------------------------- report

tuning.BUILD.capacity.stockpile = 100000; // stockpiles never fill, so hauling never fails for lack of room
const t0 = Date.now();
const results = variants.map((v) => ({ ...v, r: runVariant(v.overrides) }));
const N = SEEDS.length;

const COL = 16;
const cols = (cells: string[]) => cells.map((c) => c.padStart(COL)).join('');
const header = (title: string) => {
  console.log(`\n${title}`);
  console.log(''.padEnd(40) + cols(results.map((x, i) => (i === 0 ? 'baseline' : `variant ${i}`))));
};
const row = (label: string, f: (r: Result) => string) => console.log(label.padEnd(40) + cols(results.map((x) => f(x.r))));
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

console.log(`A month in a colony: ${N} seeds, ${SIZE} workers, ${DAYS} days${RICH ? ', 400 gold each to start' : ''}. Averages per colony.`);
results.slice(1).forEach((x, i) => console.log(`  variant ${i + 1}: ${x.name}`));

header(`How the web ends up (day ${DAYS}), share of pairs`);
const pairs = (r: Result) => Object.values(r.labels).reduce((a, b) => a + b, 0);
for (const l of LABELS) row(l || 'neutral', (r) => pct((r.labels[l] ?? 0) / pairs(r)));
row('average feeling', (r) => (r.meanFeel / N).toFixed(3));
row('average mood', (r) => (r.meanMood / N).toFixed(1));
row('label changes a day', (r) => (r.changes / N / DAYS).toFixed(1));
row('  of which flipped back', (r) => pct(r.flipBacks / Math.max(1, r.changes)));

header('Drama over the month');
for (const d of ['labels warmed', 'labels cooled', 'friendships formed', 'friendships ended', 'falling outs (once friends, now foes)', 'new enemies']) row(d, (r) => ((r.drama[d] ?? 0) / N).toFixed(1));

header('Events over the month');
const evs = [...new Set(results.flatMap((x) => Object.keys(x.r.events)))].sort();
for (const e of evs) row(e, (r) => ((r.events[e] ?? 0) / N).toFixed(1));
for (const e of ['drinks a day', 'jobs a day', 'gold sent home a day', 'couples at the end']) row(e, (r) => ((r.econ[e] ?? 0) / N).toFixed(1));

header('What moved feelings: share of all movement (net push, + warmer / − colder)');
const causes = [...new Set(results.flatMap((x) => Object.keys(x.r.moved)))].sort((a, b) => (results[0].r.moved[b]?.abs ?? 0) - (results[0].r.moved[a]?.abs ?? 0));
const total = (r: Result) => Object.values(r.moved).reduce((a, m) => a + m.abs, 0);
for (const c of causes) {
  row(c, (r) => {
    const m = r.moved[c];
    if (!m) return '–';
    const net = (m.net / N).toFixed(1);
    return `${pct(m.abs / total(r))} (${m.net >= 0 ? '+' : ''}${net})`;
  });
}
const cappedCauses = [...new Set(results.flatMap((x) => Object.keys(x.r.capped)))];
if (cappedCauses.length) {
  header('Shared time held back by the daily cap (feeling points a colony)');
  for (const c of cappedCauses) row(c, (r) => ((r.capped[c] ?? 0) / N).toFixed(1));
}

header('What changed labels: share of label changes credited to each cause');
const credited = [...new Set(results.flatMap((x) => Object.keys(x.r.credit)))].sort((a, b) => (results[0].r.credit[b] ?? 0) - (results[0].r.credit[a] ?? 0));
for (const c of credited) row(c, (r) => pct((r.credit[c] ?? 0) / Math.max(1, r.changes)));

console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}s. Net push is in feeling points summed over every pair and direction, per colony.)`);

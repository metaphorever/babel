import { Tile, type Pt, type SimState } from './types';
import { standable, tileAt } from './world';

/**
 * Breadth-first search over standable tiles. Moves: walk left/right, step
 * up or down one tile, climb ladders. Returns the steps after the start,
 * ending at the goal, or null if the goal can't be reached.
 *
 * Only standable tiles are searched (the ground and the tower), and there
 * are at most 30 workers, so plain BFS is plenty. Neighbor order is fixed,
 * which keeps paths deterministic.
 *
 * The two buffers are as big as the map (most of a million tiles on a
 * 1,000-level map), so they're kept between searches rather than made each
 * time; `prev` is put back to -1 only where a search touched it. They hold
 * nothing from one search to the next, so the result never depends on them.
 */
let prevBuf = new Int32Array(0);
let queueBuf = new Int32Array(0);

export function findPath(s: SimState, from: Pt, to: Pt): Pt[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  if (!standable(s, to.x, to.y)) return null;
  const W = s.width;
  const N = W * s.height;
  if (prevBuf.length < N) {
    prevBuf = new Int32Array(N).fill(-1);
    queueBuf = new Int32Array(N);
  }
  const prev = prevBuf;
  const queue = queueBuf;
  try {
    return search(s, from, to, prev, queue);
  } finally {
    // every tile a search marks is in the queue
    for (let i = 0; i < searched; i++) prev[queue[i]] = -1;
  }
}

let searched = 0;

function search(s: SimState, from: Pt, to: Pt, prev: Int32Array, queue: Int32Array): Pt[] | null {
  const W = s.width;
  const start = from.y * W + from.x;
  const goal = to.y * W + to.x;
  prev[start] = start;
  searched = 0;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  searched = tail;
  const nb: number[] = [];
  while (head < tail) {
    const cur = queue[head++];
    if (cur === goal) break;
    const cx = cur % W;
    const cy = (cur - cx) / W;
    neighbors(s, cx, cy, nb);
    for (let i = 0; i < nb.length; i++) {
      const n = nb[i];
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      queue[tail++] = n;
      searched = tail;
    }
  }
  if (prev[goal] === -1) return null;
  const out: Pt[] = [];
  let c = goal;
  while (c !== start) {
    const x = c % W;
    out.push({ x, y: (c - x) / W });
    c = prev[c];
  }
  out.reverse();
  return out;
}

function neighbors(s: SimState, x: number, y: number, out: number[]): void {
  out.length = 0;
  const W = s.width;
  const here = tileAt(s, x, y);
  const onLadder = here === Tile.Ladder;
  for (const dx of [-1, 1]) {
    const nx = x + dx;
    if (standable(s, nx, y)) out.push(y * W + nx);
    else {
      // step up one (needs headroom above the worker)
      if (!onLadder && standable(s, nx, y - 1) && !isBlockedAbove(s, x, y)) out.push((y - 1) * W + nx);
      // step down one
      if (standable(s, nx, y + 1)) out.push((y + 1) * W + nx);
    }
  }
  // ladders: climb up into a ladder or off the top of one
  if ((onLadder || tileAt(s, x, y - 1) === Tile.Ladder) && standable(s, x, y - 1)) out.push((y - 1) * W + x);
  if (tileAt(s, x, y + 1) === Tile.Ladder && standable(s, x, y + 1)) out.push((y + 1) * W + x);
}

function isBlockedAbove(s: SimState, x: number, y: number): boolean {
  const t = tileAt(s, x, y - 2);
  return t === Tile.Dirt || t === Tile.Deck;
}

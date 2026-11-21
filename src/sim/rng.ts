// Seeded PRNG (sfc32). The whole state is four 32-bit integers stored in the
// sim state, so saves and replays reproduce every roll exactly.

export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  // splitmix32 to spread a single seed across the four words
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: RngState = [next(), next(), next(), next()];
  // warm up
  for (let i = 0; i < 12; i++) nextU32(st);
  return st;
}

/** Next unsigned 32-bit integer. Mutates the state in place. */
export function nextU32(st: RngState): number {
  let [a, b, c, d] = st;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  st[0] = a >>> 0;
  st[1] = b >>> 0;
  st[2] = c;
  st[3] = d;
  return t;
}

/** Float in [0, 1). */
export function rand(st: RngState): number {
  return nextU32(st) / 4294967296;
}

/** Integer in [lo, hi] inclusive. */
export function randInt(st: RngState, lo: number, hi: number): number {
  return lo + Math.floor(rand(st) * (hi - lo + 1));
}

export function pick<T>(st: RngState, arr: readonly T[]): T {
  return arr[Math.floor(rand(st) * arr.length)];
}

/** Float in [lo, hi). */
export function randRange(st: RngState, lo: number, hi: number): number {
  return lo + rand(st) * (hi - lo);
}

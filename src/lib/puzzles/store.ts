// Offline puzzle library (~100k puzzles). index.json holds every rating and a bitset per category;
// the puzzles themselves sit in text files of 1000 rows (sorted by rating) loaded only when needed,
// so the app never parses the whole library.
import type { Puzzle } from './categories';

export interface PuzzleIndex { n: number; chunk: number; ratings: Int16Array; cats: Record<string, Uint8Array>; source: string }
type FetchText = (path: string) => Promise<string>;

function b64(s: string): Uint8Array {
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function decodeIndex(raw: { n: number; chunk: number; ratingDeltas: string; cats: Record<string, string>; source: string }): PuzzleIndex {
  const ratings = new Int16Array(raw.n);
  let r = 0, i = 0;
  for (const d of raw.ratingDeltas.split(',')) { r += Number(d); ratings[i++] = r; }
  const cats: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(raw.cats)) cats[k] = b64(v);
  return { n: raw.n, chunk: raw.chunk, ratings, cats, source: raw.source };
}

export const inCat = (idx: PuzzleIndex, cat: string, i: number) => cat === 'c_random' || !!((idx.cats[cat]?.[i >> 3] ?? 0) >> (i & 7) & 1);

/** first row with rating >= r (rows are sorted by rating) */
export function lowerBound(idx: PuzzleIndex, r: number): number {
  let lo = 0, hi = idx.n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (idx.ratings[m] < r) lo = m + 1; else hi = m; }
  return lo;
}

export function countIn(idx: PuzzleIndex, cat: string, band?: { min: number; max: number }): number {
  const a = band ? lowerBound(idx, band.min) : 0, b = band ? lowerBound(idx, band.max) : idx.n;
  if (cat === 'c_random') return b - a;
  let c = 0;
  for (let i = a; i < b; i++) if (inCat(idx, cat, i)) c++;
  return c;
}

/** Rows of the category closest to `target` (within `band` if given), nearest first, at most `k`. */
export function nearest(idx: PuzzleIndex, cat: string, target: number, k: number, band?: { min: number; max: number }): number[] {
  const a = band ? lowerBound(idx, band.min) : 0, b = band ? lowerBound(idx, band.max) : idx.n;
  const t = Math.min(Math.max(target, band?.min ?? -Infinity), band ? band.max - 1 : Infinity);
  let lo = Math.min(Math.max(lowerBound(idx, t), a), b) - 1, hi = lo + 1;
  const out: number[] = [];
  while (out.length < k && (lo >= a || hi < b)) {
    const dl = lo >= a ? t - idx.ratings[lo] : Infinity, dh = hi < b ? idx.ratings[hi] - t : Infinity;
    if (dl <= dh) { if (inCat(idx, cat, lo)) out.push(lo); lo--; } else { if (inCat(idx, cat, hi)) out.push(hi); hi++; }
  }
  return out;
}

export function parseLine(line: string): Puzzle {
  const [id, fen, moves, rating, rd, plays, themes, material, source] = line.split('|');
  return { id, fen, moves: moves.split(' '), rating: +rating, rd: +rd, popularity: 0, plays: +plays, themes: themes.split(' ').filter(Boolean), material, source: source === 'g' ? 'g' : 'l' };
}

export class PuzzleStore {
  private idx: Promise<PuzzleIndex> | null = null;
  private chunks = new Map<number, Promise<string[]>>();
  constructor(private fetchText: FetchText) {}
  index(): Promise<PuzzleIndex> {
    this.idx ??= this.fetchText('index.json').then((t) => decodeIndex(JSON.parse(t)));
    return this.idx;
  }
  async get(i: number): Promise<Puzzle> {
    const idx = await this.index();
    const c = Math.floor(i / idx.chunk);
    if (!this.chunks.has(c)) {
      if (this.chunks.size > 8) this.chunks.delete(this.chunks.keys().next().value!);
      this.chunks.set(c, this.fetchText(`${c}.txt`).then((t) => t.split('\n')));
    }
    return parseLine((await this.chunks.get(c)!)[i % idx.chunk]);
  }
  /**
   * A puzzle of the category near the target rating, not attempted before when possible.
   * Random among the 25 nearest unseen ones, so the order is not predictable.
   */
  async pick(cat: string, target: number, attempted: Set<string>, rng = Math.random, band?: { min: number; max: number }): Promise<Puzzle | null> {
    const idx = await this.index();
    const near = nearest(idx, cat, target, 400, band);
    if (!near.length) return null;
    const fresh: Puzzle[] = [];
    for (const i of near) {
      const p = await this.get(i);
      if (!attempted.has(p.id)) fresh.push(p);
      if (fresh.length >= 25) break;
    }
    if (fresh.length) return fresh[Math.floor(rng() * fresh.length)];
    return this.get(near[Math.floor(rng() * Math.min(25, near.length))]);
  }
}

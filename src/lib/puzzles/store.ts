// Offline puzzle library (≈1 million puzzles). The index holds every rating (Uint16) and a bitset per
// category; the puzzles sit in gzip files of 1000 rows (sorted by rating) loaded only when needed,
// so the app never parses the whole library.
import type { Puzzle } from './categories';
import { BANDS } from './glicko2';

export interface PuzzleIndex { n: number; chunk: number; ratings: Uint16Array; cats: Record<string, Uint8Array>; counts: Record<string, number[]>; source: string }
/** returns the (already decompressed) bytes of a file in the library */
export type FetchBytes = (path: string) => Promise<Uint8Array>;

const text = (b: Uint8Array) => new TextDecoder().decode(b);

export function decodeIndex(meta: { n: number; chunk: number; cats: string[]; counts: Record<string, number[]>; source: string }, ratingBytes: Uint8Array, catBytes: Uint8Array): PuzzleIndex {
  const ratings = new Uint16Array(ratingBytes.buffer.slice(ratingBytes.byteOffset, ratingBytes.byteOffset + meta.n * 2));
  const B = Math.ceil(meta.n / 8);
  const cats: Record<string, Uint8Array> = {};
  meta.cats.forEach((id, k) => { cats[id] = catBytes.subarray(k * B, (k + 1) * B); });
  return { n: meta.n, chunk: meta.chunk, ratings, cats, counts: meta.counts, source: meta.source };
}

export const inCat = (idx: PuzzleIndex, cat: string, i: number) => cat === 'c_random' || !!((idx.cats[cat]?.[i >> 3] ?? 0) >> (i & 7) & 1);

/** first row with rating >= r (rows are sorted by rating) */
export function lowerBound(idx: PuzzleIndex, r: number): number {
  let lo = 0, hi = idx.n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (idx.ratings[m] < r) lo = m + 1; else hi = m; }
  return lo;
}

export function countIn(idx: PuzzleIndex, cat: string, band?: { min: number; max: number }): number {
  const pre = idx.counts[cat];
  if (pre) {
    if (!band) return pre.reduce((a, b) => a + b, 0);
    const k = BANDS.findIndex((b) => b.min === band.min && b.max === band.max);
    if (k >= 0) return pre[k];
  }
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
  constructor(private fetchBytes: FetchBytes) {}
  index(): Promise<PuzzleIndex> {
    this.idx ??= Promise.all([this.fetchBytes('index.json'), this.fetchBytes('ratings.gz'), this.fetchBytes('cats.gz')])
      .then(([m, r, c]) => decodeIndex(JSON.parse(text(m)), r, c));
    return this.idx;
  }
  async get(i: number): Promise<Puzzle> {
    const idx = await this.index();
    const c = Math.floor(i / idx.chunk);
    if (!this.chunks.has(c)) {
      if (this.chunks.size > 12) this.chunks.delete(this.chunks.keys().next().value!);
      this.chunks.set(c, this.fetchBytes(`${c}.gz`).then((b) => text(b).split('\n')));
    }
    return parseLine((await this.chunks.get(c)!)[i % idx.chunk]);
  }
  /**
   * A puzzle of the category near the target rating, not attempted before when possible.
   * Random among the 25 nearest unseen ones, so the order is not predictable.
   */
  async pick(cat: string, target: number, attempted: Set<string>, rng = Math.random, band?: { min: number; max: number }): Promise<Puzzle | null> {
    const idx = await this.index();
    // start from a random offset among equally rated rows, so two users of the same rating get different puzzles
    const near = nearest(idx, cat, target + Math.round((rng() - 0.5) * 40), 400, band);
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

/** Browser/WebView loader: files are gzip; decompress unless the server already did. */
export async function fetchGz(base: string, path: string): Promise<Uint8Array> {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error('puzzle data ' + path);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) return buf;
  const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(ds).arrayBuffer());
}

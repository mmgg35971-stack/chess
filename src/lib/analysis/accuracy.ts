// Accuracy exactly as Lichess computes it (open source: lila, modules/analyse AccuracyPercent.scala and
// WinPercent.scala), so the same evaluations give the same numbers as a Lichess analysis.
// Chess.com's CAPS formula is not public; it gives similar but not identical values.
import type { Score } from '../engine/uci';

/** White-POV centipawns, capped at ±1000 like lila (`Cp.ceiled`); mates count as ±1000. */
export function cpOf(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 1000 : s.mate < 0 ? -1000 : 0;
  return Math.max(-1000, Math.min(1000, s.cp ?? 0));
}

/** Lichess win percentage for White, 0..100. */
export function winPercent(cpWhite: number): number {
  const c = Math.max(-1000, Math.min(1000, cpWhite));
  const w = 2 / (1 + Math.exp(-0.00368208 * c)) - 1;
  return 50 + 50 * Math.max(-1, Math.min(1, w));
}

/** Accuracy of one move from the mover's win% before and after it (with lila's +1 uncertainty bonus). */
export function moveAccuracyFromWin(before: number, after: number): number {
  if (after >= before) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function stdev(xs: number[]) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / xs.length);
}

export interface GameAccuracy {
  w: number | null;
  b: number | null;
  /** accuracy of each ply (index 0 = first move) */
  perMove: number[];
}

/**
 * Game accuracy per side: the average of a volatility-weighted mean and the harmonic mean of the move
 * accuracies (lila's `gameAccuracy`). `afterEach` are White-POV evaluations of the position after each ply.
 * `startColor` is the side that made the first move (normally White).
 */
export function lichessAccuracy(afterEach: Score[], startColor: 'w' | 'b' = 'w'): GameAccuracy {
  const cps = afterEach.map(cpOf);
  const wins = [15, ...cps].map(winPercent); // lila starts from Cp.initial = 15
  const n = cps.length;
  if (!n) return { w: null, b: null, perMove: [] };
  const ws = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const windows: number[][] = [];
  for (let k = 0; k < Math.min(ws, wins.length) - 2; k++) windows.push(wins.slice(0, ws));
  for (let k = 0; k + ws <= wins.length; k++) windows.push(wins.slice(k, k + ws));
  const weights = windows.map((x) => Math.max(0.5, Math.min(12, stdev(x))));
  const per: { acc: number; w: number; color: 'w' | 'b' }[] = [];
  for (let i = 0; i < n; i++) {
    const color: 'w' | 'b' = (i % 2 === 0) === (startColor === 'w') ? 'w' : 'b';
    const prev = wins[i], next = wins[i + 1];
    const acc = color === 'w' ? moveAccuracyFromWin(prev, next) : moveAccuracyFromWin(100 - prev, 100 - next);
    per.push({ acc, w: weights[i] ?? 0.5, color });
  }
  const side = (c: 'w' | 'b') => {
    const xs = per.filter((p) => p.color === c);
    if (!xs.length) return null;
    const wm = xs.reduce((a, p) => a + p.acc * p.w, 0) / xs.reduce((a, p) => a + p.w, 0);
    const hm = xs.length / xs.reduce((a, p) => a + 1 / Math.max(1, p.acc), 0);
    return Math.round(((wm + hm) / 2) * 10) / 10;
  };
  return { w: side('w'), b: side('b'), perMove: per.map((p) => p.acc) };
}

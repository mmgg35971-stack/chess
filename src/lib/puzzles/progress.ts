// Puzzle rating and statistics, stored locally (spec 7.4, 7.7).
import { db, type PuzzleAttempt } from '../storage/db';
import { DEFAULT_PLAYER, decay, update, type Glicko } from './glicko2';
import type { Puzzle } from './categories';

export interface PuzzleRatingState extends Glicko { peak: number; lastAt: number | null; games: number }
const KEY = 'puzzleRating';
const DAY = 86400000;

export async function getPuzzleRating(now = Date.now()): Promise<PuzzleRatingState> {
  const row = await db().kv.get(KEY);
  const s = (row?.value as PuzzleRatingState | undefined) ?? { ...DEFAULT_PLAYER, peak: DEFAULT_PLAYER.rating, lastAt: null, games: 0 };
  if (!s.lastAt) return s;
  const idle = Math.floor((now - s.lastAt) / DAY);
  return { ...s, ...decay(s, idle) };
}

export interface AttemptInput { puzzle: Puzzle; result: 0 | 1 | null; completed: boolean; hints: number; timeMs: number; category: string }

/** Saves an attempt and, when it has a rated result, updates the Glicko-2 rating. */
export async function recordAttempt(a: AttemptInput, now = Date.now()): Promise<{ before: PuzzleRatingState; after: PuzzleRatingState; attempt: PuzzleAttempt }> {
  const before = await getPuzzleRating(now);
  let after: PuzzleRatingState = before;
  if (a.result !== null) {
    const g = update(before, { rating: a.puzzle.rating, rd: a.puzzle.rd }, a.result);
    const games = before.games + 1;
    // the peak counts from the 5th rated puzzle on, so a lucky first puzzle is not a "peak"
    after = { ...g, games, lastAt: now, peak: games >= 5 ? Math.max(before.peak, g.rating) : before.peak };
  }
  const attempt: PuzzleAttempt = {
    puzzleId: a.puzzle.id, at: now, result: a.result, completed: a.completed, hints: a.hints, timeMs: a.timeMs,
    category: a.category, themes: a.puzzle.themes, puzzleRating: a.puzzle.rating,
    ratingBefore: before.rating, ratingAfter: after.rating, rdAfter: after.rd,
  };
  await db().transaction('rw', db().kv, db().puzzleAttempts, db().activity, async () => {
    await db().kv.put({ key: KEY, value: after });
    attempt.id = await db().puzzleAttempts.add(attempt);
    await db().activity.add({
      type: 'puzzle', refId: attempt.id, at: now, durationMs: a.timeMs,
      summary: `🧩 ${a.puzzle.id} (${a.puzzle.rating})`,
      result: a.result === 1 ? '✓' : a.result === 0 ? '✗' : '⤼',
    });
  });
  return { before, after, attempt };
}

export const listAttempts = () => db().puzzleAttempts.orderBy('at').toArray();
export async function attemptedIds(): Promise<Set<string>> {
  return new Set((await db().puzzleAttempts.toArray()).map((a) => a.puzzleId));
}

export interface PuzzleStats {
  rated: number; solved: number; failed: number; skipped: number; successRate: number | null; avgTimeMs: number | null;
  themes: { theme: string; n: number; rate: number }[];
  periods: { key: 'day' | 'week' | 'month'; n: number; solved: number; change: number }[];
  history: { at: number; rating: number }[];
}

export function computeStats(attempts: PuzzleAttempt[], now = Date.now(), themeMin = 5): PuzzleStats {
  const rated = attempts.filter((a) => a.result !== null);
  const solved = rated.filter((a) => a.result === 1).length;
  const timed = attempts.filter((a) => a.result === 1);
  const byTheme = new Map<string, { n: number; ok: number }>();
  for (const a of rated) for (const t of a.themes) {
    if (['short', 'long', 'veryLong', 'oneMove', 'middlegame', 'endgame', 'opening', 'crushing', 'advantage', 'master', 'masterVsMaster', 'superGM'].includes(t)) continue;
    const e = byTheme.get(t) ?? { n: 0, ok: 0 };
    e.n++; if (a.result === 1) e.ok++;
    byTheme.set(t, e);
  }
  const period = (key: 'day' | 'week' | 'month', ms: number) => {
    const xs = rated.filter((a) => a.at >= now - ms);
    return { key, n: xs.length, solved: xs.filter((a) => a.result === 1).length, change: xs.length ? xs[xs.length - 1].ratingAfter - xs[0].ratingBefore : 0 };
  };
  return {
    rated: rated.length, solved, failed: rated.length - solved, skipped: attempts.length - rated.length,
    successRate: rated.length ? solved / rated.length : null,
    avgTimeMs: timed.length ? timed.reduce((s, a) => s + a.timeMs, 0) / timed.length : null,
    themes: [...byTheme.entries()].filter(([, e]) => e.n >= themeMin).map(([theme, e]) => ({ theme, n: e.n, rate: e.ok / e.n })).sort((a, b) => b.rate - a.rate),
    periods: [period('day', DAY), period('week', 7 * DAY), period('month', 30 * DAY)],
    history: rated.map((a) => ({ at: a.at, rating: a.ratingAfter })),
  };
}

/**
 * Next puzzle: from the category, not yet attempted (until the pool runs out), with a rating close to
 * the target. Picks at random among the 25 closest so the order is not predictable.
 */
export function pickPuzzle(pool: Puzzle[], target: number, attempted: Set<string>, rng = Math.random, band?: { min: number; max: number }): Puzzle | null {
  let cands = band ? pool.filter((p) => p.rating >= band.min && p.rating < band.max) : pool;
  if (!cands.length) return null;
  const fresh = cands.filter((p) => !attempted.has(p.id));
  if (fresh.length) cands = fresh;
  const sorted = [...cands].sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target)).slice(0, 25);
  return sorted[Math.floor(rng() * sorted.length)];
}

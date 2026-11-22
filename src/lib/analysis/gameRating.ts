import type { MoveEval } from './analyzer';
import { expectedPoints } from './expected';
import { moveAccuracy } from './classify';
import model from '../../data/game-rating-model.json';

/**
 * Game Rating: an estimate of the playing strength shown in ONE game, from
 * the quality of its moves. A linear model fitted on real rated Lichess games
 * (CC0) analysed with the app's Stockfish build; `mae` is its measured
 * average error on games it was not fitted on. It is not a FIDE or Lichess
 * rating, and one game can differ a lot from a player's real level.
 */
export interface GameRatingModel {
  intercept: number;
  coef: Record<string, number>;
  mean: Record<string, number>;
  std: Record<string, number>;
  mae: number;
  rmse: number;
  /** measurement model: quality score s | rating r ~ N(alpha + beta·r, sigma²) */
  alpha: number;
  beta: number;
  sigma: number;
  popMean: number;
  popSd: number;
  games: number;
  minMoves: number;
  source: string;
}
export const GR: GameRatingModel = model as GameRatingModel;

/** Rating-independent move-quality features (fixed reference curve at 1500). */
export function ratingFeatures(evals: MoveEval[]): Record<string, number> | null {
  const losses = evals.map((e) => {
    const b = expectedPoints(e.bestScore, e.color, 1500);
    const p = expectedPoints(e.playedScore, e.color, 1500);
    return e.uci === e.bestUci || p >= b ? 0 : Math.max(0, b - p);
  });
  const cpv = (s: MoveEval['bestScore'], c: 'w' | 'b') => {
    const sign = c === 'w' ? 1 : -1;
    if (s.mate !== undefined) return s.mate * sign > 0 ? 1000 : -1000;
    return Math.max(-1000, Math.min(1000, (s.cp ?? 0) * sign));
  };
  const cpl = evals.map((e) => Math.max(0, cpv(e.bestScore, e.color) - cpv(e.playedScore, e.color)));
  if (losses.length < GR.minMoves) return null;
  const n = losses.length;
  const acc = losses.map(moveAccuracy);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const harm = n / acc.reduce((s, a) => s + 1 / Math.max(a, 1), 0);
  return {
    accuracy: (mean(acc) + harm) / 2,
    logLoss: Math.log(mean(losses) + 0.005),
    mistakeRate: losses.filter((l) => l > 0.1).length / n,
    blunderRate: losses.filter((l) => l > 0.2).length / n,
    bestRate: evals.filter((e) => e.uci === e.bestUci).length / n,
    logMoves: Math.log(n),
    logAcpl: Math.log(cpl.reduce((a, b) => a + b, 0) / Math.max(cpl.length, 1) + 5),
  };
}

export interface RatingEstimate {
  rating: number;
  /** one standard deviation of the estimate */
  plusMinus: number;
  /** true when a known rating (profile or PGN header) was used as the starting point */
  personal: boolean;
}

/** Linear quality score of the game (higher = stronger play). */
export function qualityScore(evals: MoveEval[]): number | null {
  const f = ratingFeatures(evals);
  if (!f || !GR.games) return null;
  let s = GR.intercept;
  for (const [k, c] of Object.entries(GR.coef)) s += c * ((f[k] - GR.mean[k]) / (GR.std[k] || 1));
  return Number.isFinite(s) ? s : null;
}

/**
 * Bayesian estimate: start from the player's known rating if there is one
 * (like Chess.com, which compares your moves with what is expected at your
 * rating), otherwise from the population of calibration players; then update
 * with the quality of the moves in this game.
 */
export function estimateRating(evals: MoveEval[], prior?: { rating: number; sd?: number } | null): RatingEstimate | null {
  const s = qualityScore(evals);
  if (s === null) return null;
  const pm = prior?.rating ?? GR.popMean;
  const psd = prior ? prior.sd ?? 150 : GR.popSd;
  const prec = 1 / psd ** 2 + GR.beta ** 2 / GR.sigma ** 2;
  const mean = (pm / psd ** 2 + (GR.beta * (s - GR.alpha)) / GR.sigma ** 2) / prec;
  const sd = Math.sqrt(1 / prec);
  return {
    rating: Math.round(Math.max(400, Math.min(2900, mean)) / 10) * 10,
    plusMinus: Math.round(sd / 10) * 10,
    personal: !!prior,
  };
}

export function estimateRatings(
  evals: MoveEval[],
  priors: { w?: number | null; b?: number | null } = {},
): { w: RatingEstimate | null; b: RatingEstimate | null } {
  const p = (r?: number | null) => (r ? { rating: r } : null);
  return {
    w: estimateRating(evals.filter((e) => e.color === 'w'), p(priors.w)),
    b: estimateRating(evals.filter((e) => e.color === 'b'), p(priors.b)),
  };
}

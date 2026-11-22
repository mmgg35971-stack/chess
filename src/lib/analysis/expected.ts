import type { Score } from '../engine/uci';
import model from '../../data/ep-model.json';

/**
 * Expected-points model: the chance (0..1, draws = 0.5) that the side to move
 * scores, given the engine evaluation AND the player's rating. Stronger
 * players convert the same advantage more often, so the curve is steeper for
 * them. Coefficients are fitted on real rated Lichess games (CC0) analysed
 * with the app's own Stockfish build — see scripts/calibration/ and
 * DATA_SOURCES.md.
 */
export interface EpModel {
  /** curve: E = 1 / (1 + exp(-a(r) · sign(cp) · (|cp|/100)^power)), a(r) = a0 + a1·(r − ref)/1000 */
  a0: number;
  a1: number;
  power: number;
  ref: number;
  minRating: number;
  maxRating: number;
  games: number;
  positions: number;
  source: string;
}

export const EP: EpModel = model as EpModel;

export function steepness(rating: number): number {
  const r = Math.max(EP.minRating, Math.min(EP.maxRating, rating));
  return Math.max(0.05, EP.a0 + EP.a1 * ((r - EP.ref) / 1000));
}

/** Expected points for `mover` (0..1). Score is White point of view. */
export function expectedPoints(s: Score, mover: 'w' | 'b', rating: number): number {
  const sign = mover === 'w' ? 1 : -1;
  if (s.mate !== undefined) {
    const m = s.mate * sign;
    if (m > 0) return 1;
    if (m < 0) return 0;
    return mover === 'w' ? 0 : 1;
  }
  const cp = Math.max(-1500, Math.min(1500, (s.cp ?? 0) * sign));
  const x = Math.sign(cp) * Math.pow(Math.abs(cp) / 100, EP.power);
  return 1 / (1 + Math.exp(-steepness(rating) * x));
}

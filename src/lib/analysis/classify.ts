import { winProbability, type Score } from '../engine/uci';

export type MoveLabel =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'missedWin'
  | 'blunder';

export const LABEL_ORDER: MoveLabel[] = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'missedWin', 'blunder',
];

/**
 * Thresholds are expressed as loss of expected score (win probability, 0..1)
 * for the side that moved. They are adjustable (settings → strictness).
 */
export interface Thresholds {
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  /** min share of expected score the best line must keep over the 2nd for "great" */
  onlyMoveGap: number;
  /** "missed win": winning before (>= this) … */
  winningBefore: number;
  /** … and no longer winning after (< this) */
  notWinningAfter: number;
  /** sacrifice must be at least this much material (pawn units) */
  sacrificeMin: number;
}

export const STRICTNESS: Record<'lenient' | 'standard' | 'strict', Thresholds> = {
  lenient: { excellent: 0.03, good: 0.07, inaccuracy: 0.13, mistake: 0.25, onlyMoveGap: 0.2, winningBefore: 0.85, notWinningAfter: 0.6, sacrificeMin: 2 },
  standard: { excellent: 0.02, good: 0.05, inaccuracy: 0.1, mistake: 0.2, onlyMoveGap: 0.15, winningBefore: 0.8, notWinningAfter: 0.6, sacrificeMin: 2 },
  strict: { excellent: 0.01, good: 0.03, inaccuracy: 0.07, mistake: 0.15, onlyMoveGap: 0.12, winningBefore: 0.75, notWinningAfter: 0.6, sacrificeMin: 2 },
};

export interface ClassifyInput {
  mover: 'w' | 'b';
  /** evaluation of the position before the move with best play (White POV) */
  bestScore: Score;
  /** evaluation after the played move (White POV) */
  playedScore: Score;
  /** evaluation of the engine's 2nd choice (White POV), if known */
  secondScore?: Score | null;
  /** the played move is the engine's first choice */
  isBest: boolean;
  /** the mover gives up >= sacrificeMin material in the forcing line after the move */
  sacrificeAmount: number;
  /** recapture on the square the opponent just captured on */
  isRecapture: boolean;
  legalMoves: number;
}

export interface ClassifyResult {
  label: MoveLabel;
  /** loss of expected score for the mover, 0..1 */
  loss: number;
  wpBefore: number;
  wpAfter: number;
  accuracy: number;
}

export function moverWp(s: Score, mover: 'w' | 'b'): number {
  const w = winProbability(s);
  return mover === 'w' ? w : 1 - w;
}

/** Lichess-style per-move accuracy from the loss of win percentage. */
export function moveAccuracy(loss: number): number {
  const pct = Math.max(0, loss) * 100;
  const a = 103.1668 * Math.exp(-0.04354 * pct) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

export function classify(i: ClassifyInput, th: Thresholds = STRICTNESS.standard): ClassifyResult {
  const wpBefore = moverWp(i.bestScore, i.mover);
  const wpAfter = moverWp(i.playedScore, i.mover);
  const loss = i.isBest ? 0 : Math.max(0, wpBefore - wpAfter);
  const accuracy = moveAccuracy(loss);
  let label: MoveLabel;

  if (loss <= th.excellent) {
    label = i.isBest ? 'best' : 'excellent';
    // Brilliant: a real, sound sacrifice — the engine still rates the position
    // well for the mover, and it was not already completely winning.
    const forcesMate = (i.mover === 'w' ? (i.playedScore.mate ?? 0) > 0 : (i.playedScore.mate ?? 0) < 0);
    const secondAlsoMates = !!i.secondScore && (i.mover === 'w' ? (i.secondScore.mate ?? 0) > 0 : (i.secondScore.mate ?? 0) < 0);
    const fasterMate = forcesMate && (!secondAlsoMates || Math.abs(i.playedScore.mate!) < Math.abs(i.secondScore!.mate!));
    const onlyWay = !!i.secondScore && wpBefore - moverWp(i.secondScore, i.mover) >= th.onlyMoveGap;
    if (
      i.sacrificeAmount >= th.sacrificeMin &&
      wpAfter >= 0.5 &&
      !i.isRecapture &&
      // not already decided — unless the sacrifice is the only way / the forced mate
      (wpBefore < 0.95 || onlyWay || fasterMate)
    ) {
      label = 'brilliant';
    } else if (i.isBest && i.secondScore && i.legalMoves > 1 && !i.isRecapture) {
      // Great: proven only good move — the 2nd best line is clearly worse.
      const wpSecond = moverWp(i.secondScore, i.mover);
      if (wpBefore - wpSecond >= th.onlyMoveGap && wpBefore < 0.97) label = 'great';
    }
  } else if (loss <= th.good) {
    label = 'good';
  } else {
    const missed = wpBefore >= th.winningBefore && wpAfter < th.notWinningAfter;
    if (missed && loss > th.inaccuracy) label = 'missedWin';
    else if (loss <= th.inaccuracy) label = 'inaccuracy';
    else if (loss <= th.mistake) label = 'mistake';
    else label = 'blunder';
  }
  return { label, loss, wpBefore, wpAfter, accuracy };
}

export function gameAccuracy(accs: number[]): number | null {
  if (!accs.length) return null;
  const mean = accs.reduce((a, b) => a + b, 0) / accs.length;
  // Blend with the harmonic mean so a few bad moves pull accuracy down (as Lichess does).
  const harm = accs.length / accs.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return Math.round(((mean + harm) / 2) * 10) / 10;
}

import { expectedPoints } from './expected';
import type { Score } from '../engine/uci';

/**
 * Move classification following the rules Chess.com publishes for its
 * Expected Points model (Classification V2):
 *   Best = engine's top move; Excellent ≤ 0.02 expected points lost;
 *   Good ≤ 0.05; Inaccuracy ≤ 0.10; Mistake ≤ 0.20; Blunder > 0.20.
 *   Brilliant = a good piece sacrifice, best or nearly best, not leaving you
 *   worse and not already completely winning; more leeway for newer players.
 *   Great = critical to the result: the only good move, or the move that turns
 *   losing→equal / equal→winning; more generous for newer players.
 *   Miss = failing to take advantage of the opponent's mistake, losing the
 *   chance to reach a winning position.
 *   Book = a known opening move.
 * Chess.com's exact formula and rating curves are not public; ours are fitted
 * on real rated games (see expected.ts). Key 'missedWin' is the "Miss" label.
 */
export type MoveLabel =
  | 'book'
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
  'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'missedWin', 'blunder',
];

export interface Thresholds {
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  /** expected points at or above which a position counts as winning */
  winning: number;
  /** at or below which it counts as losing */
  losing: number;
}

/** "standard" = the published Chess.com ranges. */
export const STRICTNESS: Record<'lenient' | 'standard' | 'strict', Thresholds> = {
  lenient: { excellent: 0.03, good: 0.07, inaccuracy: 0.13, mistake: 0.25, winning: 0.8, losing: 0.2 },
  standard: { excellent: 0.02, good: 0.05, inaccuracy: 0.1, mistake: 0.2, winning: 0.8, losing: 0.2 },
  strict: { excellent: 0.01, good: 0.03, inaccuracy: 0.07, mistake: 0.15, winning: 0.8, losing: 0.2 },
};

export interface ClassifyInput {
  mover: 'w' | 'b';
  /** player's rating used by the expected-points model */
  rating: number;
  /** White-POV evaluation of the position before the move with best play */
  bestScore: Score;
  /** White-POV evaluation after the played move */
  playedScore: Score;
  /** White-POV evaluation of the engine's 2nd choice */
  secondScore?: Score | null;
  isBest: boolean;
  /** material (pawn units) the mover is down after its own next reply in the engine line */
  sacrificeAmount: number;
  /** a piece (not only pawns) is given up */
  pieceSacrifice: boolean;
  isRecapture: boolean;
  legalMoves: number;
  /** the position after the move is a known opening position (and the game was in book so far) */
  inBook: boolean;
  /** expected points the opponent lost with their previous move (null if unknown) */
  opponentPrevLoss: number | null;
  /** mover's expected points before the opponent's previous move */
  epBeforeOpponentMove: number | null;
}

export interface ClassifyResult {
  label: MoveLabel;
  /** expected points lost by the mover, 0..1 */
  loss: number;
  epBefore: number;
  epAfter: number;
  accuracy: number;
}

/** Per-move accuracy from expected points lost (Lichess-style curve on a 0..100 scale). */
export function moveAccuracy(loss: number): number {
  const pct = Math.max(0, loss) * 100;
  const a = 103.1668 * Math.exp(-0.04354 * pct) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

/** How generous the special labels are: 1 for new players → 0 for masters. */
function leeway(rating: number) {
  return Math.max(0, Math.min(1, (2200 - rating) / 1400));
}

export function classify(i: ClassifyInput, th: Thresholds = STRICTNESS.standard): ClassifyResult {
  const ep = (s: Score) => expectedPoints(s, i.mover, i.rating);
  const epBefore = ep(i.bestScore);
  const epAfter = i.isBest ? epBefore : ep(i.playedScore);
  const loss = Math.max(0, epBefore - epAfter);
  const accuracy = moveAccuracy(loss);
  const lw = leeway(i.rating);

  if (i.inBook && loss <= th.good) return { label: 'book', loss, epBefore, epAfter, accuracy };

  let label: MoveLabel;
  if (i.isBest || loss <= th.excellent) {
    label = i.isBest ? 'best' : 'excellent';
    const epSecond = i.secondScore ? ep(i.secondScore) : null;

    // Brilliant: a good piece sacrifice (newer players: any real sacrifice of 2+ points)
    const sacEnough = i.sacrificeAmount >= 2 && (i.pieceSacrifice || lw > 0.6);
    const notBadAfter = epAfter >= 0.45;
    // the sacrifice is the fastest forced mate (the alternatives mate slower or not at all)
    const moverMate = (sc: Score | null | undefined) => (sc?.mate !== undefined ? sc.mate * (i.mover === 'w' ? 1 : -1) : null);
    const pm = moverMate(i.playedScore), sm = moverMate(i.secondScore);
    const fasterMate = pm !== null && pm > 0 && (sm === null || sm <= 0 || pm < sm);
    const alreadyWinning = epBefore >= 0.97 && !(epSecond !== null && epSecond < th.winning) && !fasterMate;
    if (sacEnough && notBadAfter && !alreadyWinning && !i.isRecapture) {
      label = 'brilliant';
    } else if (i.isBest && epSecond !== null && i.legalMoves > 1 && !i.isRecapture) {
      // Great: critical — the alternative changes the outcome category and is far worse
      const gapNeeded = 0.2 - 0.08 * lw; // 0.20 for masters … 0.12 for beginners
      const cat = (e: number) => (e >= th.winning ? 2 : e <= th.losing ? 0 : 1);
      const onlyMove = epBefore - epSecond >= gapNeeded && cat(epSecond) < cat(epBefore);
      // turning the result: before the opponent's last move we were worse off than now
      const turned =
        i.epBeforeOpponentMove !== null &&
        cat(epAfter) > cat(i.epBeforeOpponentMove) &&
        epBefore - epSecond >= gapNeeded * 0.75;
      if ((onlyMove || turned) && epBefore < 0.99) label = 'great';
    }
  } else if (loss <= th.good) {
    label = 'good';
  } else {
    // Miss: the opponent just erred, we could reach a winning position, and we did not
    const opponentErred = (i.opponentPrevLoss ?? 0) >= th.inaccuracy;
    const couldWin = epBefore >= th.winning && (i.epBeforeOpponentMove === null || i.epBeforeOpponentMove < th.winning);
    if (opponentErred && couldWin && epAfter < th.winning) label = 'missedWin';
    else if (loss <= th.inaccuracy) label = 'inaccuracy';
    else if (loss <= th.mistake) label = 'mistake';
    else label = 'blunder';
  }
  return { label, loss, epBefore, epAfter, accuracy };
}

export function gameAccuracy(accs: number[]): number | null {
  if (!accs.length) return null;
  const mean = accs.reduce((a, b) => a + b, 0) / accs.length;
  const harm = accs.length / accs.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return Math.round(((mean + harm) / 2) * 10) / 10;
}

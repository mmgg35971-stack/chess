import { Chess, type Move } from 'chess.js';
import type { EngineClient, SearchLimits } from '../engine/engine';
import { toWhitePov, type InfoLine, type Score } from '../engine/uci';
import { moveToUci, uciToMove } from '../chess/game';
import { classify, gameAccuracy, LABEL_ORDER, STRICTNESS, type MoveLabel, type Thresholds } from './classify';
import { gamePhase, moveFeatures, type MoveFeatures } from './features';

export interface MoveEval {
  ply: number; // 1-based
  san: string;
  uci: string;
  color: 'w' | 'b';
  fenBefore: string;
  bestUci: string | null;
  bestSan: string | null;
  /** White point of view */
  bestScore: Score;
  playedScore: Score;
  secondScore: Score | null;
  bestLineSan: string[];
  replySan: string[];
  label: MoveLabel;
  loss: number;
  accuracy: number;
  phase: 'opening' | 'middlegame' | 'endgame';
  played: MoveFeatures;
  best: MoveFeatures | null;
  depth: number;
}

export function pvToSan(fen: string, pv: string[], max = 6): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try {
      const m = c.move(uciToMove(u));
      if (!m) break;
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

/** Score of the position after a move, from White's POV, handling finished games. */
function afterScore(fenAfter: string, after: InfoLine[]): Score {
  const c = new Chess(fenAfter);
  if (c.isCheckmate()) return { mate: c.turn() === 'w' ? -1 : 1 };
  if (c.isDraw() || c.isStalemate()) return { cp: 0 };
  const top = after[0];
  if (!top) return { cp: 0 };
  return toWhitePov(top.score, c.turn());
}

/**
 * Evaluate one played move from engine lines of the position before it
 * (`before`, MultiPV ≥ 2, side-to-move POV) and of the position after it
 * (`after`, side-to-move POV = opponent).
 */
export function evaluateMove(
  fenBefore: string,
  move: Move,
  prevMove: Move | null,
  before: InfoLine[],
  after: InfoLine[],
  ply: number,
  th: Thresholds = STRICTNESS.standard,
): MoveEval {
  const pos = new Chess(fenBefore);
  const mover = pos.turn();
  const fenAfter = move.after ?? (() => { const c = new Chess(fenBefore); c.move(move.san); return c.fen(); })();
  const top = before[0];
  const bestUci = top?.pv[0] ?? null;
  const uci = moveToUci(move);
  const isBest = bestUci === uci;
  const bestScore = top ? toWhitePov(top.score, mover) : afterScore(fenAfter, after);
  const secondScore = before[1] ? toWhitePov(before[1].score, mover) : null;
  const playedScore = isBest && top ? bestScore : afterScore(fenAfter, after);
  const replyPv = after[0]?.pv ?? [];
  const played = moveFeatures(fenBefore, move, replyPv, prevMove);

  let best: MoveFeatures | null = null;
  let bestSan: string | null = null;
  if (bestUci && !isBest) {
    try {
      const bm = new Chess(fenBefore).move(uciToMove(bestUci));
      if (bm) {
        bestSan = bm.san;
        best = moveFeatures(fenBefore, bm, top.pv.slice(1), prevMove);
      }
    } catch { /* engine line not legal in this position: ignore */ }
  } else if (isBest) bestSan = move.san;

  const res = classify(
    {
      mover,
      bestScore,
      playedScore,
      secondScore,
      isBest,
      sacrificeAmount: played.sacrifice,
      isRecapture: played.recapture,
      legalMoves: pos.moves().length,
    },
    th,
  );
  return {
    ply, san: move.san, uci, color: mover, fenBefore,
    bestUci, bestSan, bestScore, playedScore, secondScore,
    bestLineSan: top ? pvToSan(fenBefore, top.pv) : [],
    replySan: pvToSan(fenAfter, replyPv),
    label: res.label, loss: res.loss, accuracy: res.accuracy,
    phase: gamePhase(pos),
    played, best, depth: top?.depth ?? 0,
  };
}

export interface SideSummary {
  counts: Record<MoveLabel, number>;
  accuracy: number | null;
  moves: number;
  byPhase: Record<'opening' | 'middlegame' | 'endgame', { moves: number; errors: number; loss: number }>;
}

export function summarize(evals: MoveEval[]): Record<'w' | 'b', SideSummary> {
  const mk = (): SideSummary => ({
    counts: Object.fromEntries(LABEL_ORDER.map((l) => [l, 0])) as Record<MoveLabel, number>,
    accuracy: null,
    moves: 0,
    byPhase: { opening: { moves: 0, errors: 0, loss: 0 }, middlegame: { moves: 0, errors: 0, loss: 0 }, endgame: { moves: 0, errors: 0, loss: 0 } },
  });
  const out = { w: mk(), b: mk() };
  for (const c of ['w', 'b'] as const) {
    const mine = evals.filter((e) => e.color === c);
    for (const e of mine) {
      out[c].counts[e.label]++;
      out[c].moves++;
      const ph = out[c].byPhase[e.phase];
      ph.moves++;
      ph.loss += e.loss;
      if (['mistake', 'blunder', 'missedWin'].includes(e.label)) ph.errors++;
    }
    out[c].accuracy = gameAccuracy(mine.map((e) => e.accuracy));
  }
  return out;
}

export interface FullAnalysis {
  evals: MoveEval[];
  /** White-POV score of every position, index 0 = start */
  curve: Score[];
  depth: number;
  engine: string;
  createdAt: number;
}

/** Analyse every position of a game (N+1 searches). Runs in the engine worker; the UI stays free. */
export async function analyzeGame(
  engine: EngineClient,
  pgnOrMoves: { pgn?: string; sans?: string[] },
  limits: SearchLimits,
  onProgress?: (done: number, total: number) => void,
  shouldStop?: () => boolean,
  th: Thresholds = STRICTNESS.standard,
): Promise<FullAnalysis | null> {
  const c = new Chess();
  if (pgnOrMoves.pgn) c.loadPgn(pgnOrMoves.pgn);
  else for (const s of pgnOrMoves.sans ?? []) c.move(s);
  const moves = c.history({ verbose: true });
  const fens = [moves[0]?.before ?? c.fen(), ...moves.map((m) => m.after)];
  const lines: InfoLine[][] = [];
  await engine.setOption('Skill Level', 20);
  for (let i = 0; i < fens.length; i++) {
    if (shouldStop?.()) return null;
    const pos = new Chess(fens[i]);
    if (pos.isGameOver()) lines.push([]);
    else lines.push((await engine.search(fens[i], limits, { multipv: 2 })).lines);
    onProgress?.(i + 1, fens.length);
  }
  const evals = moves.map((m, i) => evaluateMove(fens[i], m, i > 0 ? moves[i - 1] : null, lines[i], lines[i + 1], i + 1, th));
  const curve = fens.map((f, i) => {
    const pos = new Chess(f);
    if (pos.isCheckmate()) return { mate: pos.turn() === 'w' ? -1 : 1 } as Score;
    if (!lines[i][0]) return { cp: 0 };
    return toWhitePov(lines[i][0].score, pos.turn());
  });
  return { evals, curve, depth: limits.depth ?? 0, engine: engine.name, createdAt: Date.now() };
}

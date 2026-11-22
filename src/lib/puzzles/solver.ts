// Puzzle-solving logic, independent of the UI (spec 7.5–7.6).
//
// The stored solution is checked first. Any other move is accepted when it is correct too:
//   - it gives checkmate, or
//   - in a mate puzzle: it keeps a forced mate within the moves that are left, or
//   - otherwise: Stockfish rates it (almost) as good as the stored move and it keeps the same
//     outcome (a winning position stays winning, a saving move still holds).
// After an accepted alternative the stored line no longer applies, so the opponent's replies and the
// checks of later moves come from the engine.
import { Chess, type Move } from 'chess.js';
import type { Puzzle } from './categories';

export interface Eval { cp?: number; mate?: number; pv: string[] }
/** Evaluation from the point of view of the side to move. */
export type Evaluate = (fen: string) => Promise<Eval>;

export const uciOf = (m: Pick<Move, 'from' | 'to' | 'promotion'>) => m.from + m.to + (m.promotion ?? '');
export const playUci = (c: Chess, u: string) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

export function goalOf(p: Puzzle): { kind: 'mate' | 'win' | 'advantage' | 'defend' | 'only' | 'best'; n?: number } {
  const m = p.themes.find((t) => /^mateIn\d$/.test(t));
  if (m) return { kind: 'mate', n: Number(m.slice(6)) };
  if (p.themes.includes('mate')) return { kind: 'mate' };
  if (p.themes.includes('onlyMove')) return { kind: 'only' };
  if (p.themes.includes('equality') || p.themes.includes('defensiveMove')) return { kind: 'defend' };
  if (p.themes.includes('crushing')) return { kind: 'win' };
  if (p.themes.includes('advantage')) return { kind: 'advantage' };
  return { kind: 'best' };
}

/** Score in centipawns for comparisons; mates map to ±(100000 − 100·n) so shorter mates are better. */
export function scoreCp(e: Pick<Eval, 'cp' | 'mate'>): number {
  if (e.mate !== undefined) return e.mate > 0 ? 100000 - 100 * e.mate : -100000 - 100 * e.mate;
  return e.cp ?? 0;
}
const flip = (e: Eval): Eval => ({ cp: e.cp !== undefined ? -e.cp : undefined, mate: e.mate !== undefined ? -e.mate : undefined, pv: e.pv });

export interface Verdict { ok: boolean; reason: 'solution' | 'mate' | 'mateKept' | 'equivalent' | 'worse' | 'illegal'; userEval?: Eval; refEval?: Eval }

/**
 * Is `userUci` (played at `fen`) a correct alternative to `refUci`?
 * `movesLeft` = solver moves still to play INCLUDING this one.
 */
export async function judgeAlternative(fen: string, userUci: string, refUci: string | null, goal: ReturnType<typeof goalOf>, movesLeft: number, evaluate: Evaluate): Promise<Verdict> {
  const c = new Chess(fen);
  let mv: Move;
  try { mv = playUci(c, userUci); } catch { return { ok: false, reason: 'illegal' }; }
  if (refUci && uciOf(mv) === refUci) return { ok: true, reason: 'solution' };
  if (c.isCheckmate()) return { ok: true, reason: 'mate' };
  if (c.isGameOver()) {
    // stalemate / draw: only fine if the goal was to save the game
    return { ok: goal.kind === 'defend', reason: goal.kind === 'defend' ? 'equivalent' : 'worse' };
  }
  const userEval = flip(await evaluate(c.fen())); // solver POV
  if (goal.kind === 'mate') {
    const ok = userEval.mate !== undefined && userEval.mate > 0 && userEval.mate <= movesLeft - 1;
    return { ok, reason: ok ? 'mateKept' : 'worse', userEval };
  }
  let refEval: Eval | undefined;
  if (refUci) {
    const r = new Chess(fen);
    try { playUci(r, refUci); } catch { refUci = null; }
    if (refUci) refEval = r.isCheckmate() ? { mate: 1, pv: [] } : r.isGameOver() ? { cp: 0, pv: [] } : flip(await evaluate(r.fen()));
  }
  if (!refEval) {
    const best = await evaluate(fen);
    refEval = best;
  }
  const ref = scoreCp(refEval), got = scoreCp(userEval);
  if (refEval.mate !== undefined && refEval.mate > 0) {
    // the stored move mates by force: an alternative must also mate (in time) or be crushing
    const ok = (userEval.mate !== undefined && userEval.mate > 0 && userEval.mate <= movesLeft + 1) || got >= 1000;
    return { ok, reason: ok ? 'equivalent' : 'worse', userEval, refEval };
  }
  const tol = Math.max(60, 0.15 * Math.abs(ref));
  let ok = got >= ref - tol;
  // keep the outcome class: winning stays winning, holding stays holding
  if (ref >= 300) ok &&= got >= Math.max(200, 0.6 * ref);
  if (goal.kind === 'win') ok &&= got >= 200;
  if (goal.kind === 'defend') ok &&= got >= ref - 60;
  return { ok, reason: ok ? 'equivalent' : 'worse', userEval, refEval };
}

export interface SolveState {
  puzzle: Puzzle;
  /** the current position */
  fen: string;
  /** moves played on the board after the starting position (UCI), including the opponent's first move */
  played: string[];
  solverColor: 'w' | 'b';
  totalSolverMoves: number;
  solverMovesDone: number;
  /** still following the stored solution? */
  onBook: boolean;
  status: 'playing' | 'solved' | 'failed';
  /** a mistake/hint/solution happened: rating result is a loss even if completed later */
  ratedResult: 0 | 1 | null;
}

export function startPuzzle(p: Puzzle): SolveState {
  const c = new Chess(p.fen);
  playUci(c, p.moves[0]);
  return { puzzle: p, fen: c.fen(), played: [p.moves[0]], solverColor: c.turn(), totalSolverMoves: p.moves.length / 2, solverMovesDone: 0, onBook: true, status: 'playing', ratedResult: null };
}

/** The stored solution move for the current position, or null after an alternative. */
export const expectedMove = (s: SolveState) => (s.onBook ? s.puzzle.moves[s.played.length] ?? null : null);

export interface MoveOutcome { state: SolveState; verdict: Verdict; reply: string | null }

/**
 * Applies the solver's move. Returns the new state and the opponent's reply (already applied) if any.
 * A wrong move leaves the position unchanged and marks the puzzle failed for rating purposes.
 */
export async function playSolverMove(s: SolveState, userUci: string, evaluate: Evaluate): Promise<MoveOutcome> {
  const goal = goalOf(s.puzzle);
  const left = s.totalSolverMoves - s.solverMovesDone;
  let ref = expectedMove(s);
  if (!s.onBook && !ref) {
    const best = await evaluate(s.fen);
    ref = best.pv[0] ?? null;
  }
  const verdict = await judgeAlternative(s.fen, userUci, ref, goal, left, evaluate);
  if (!verdict.ok) {
    return { state: { ...s, status: 'failed', ratedResult: s.ratedResult ?? 0 }, verdict, reply: null };
  }
  const c = new Chess(s.fen);
  const mv = playUci(c, userUci);
  const onBook = s.onBook && verdict.reason === 'solution';
  const done = s.solverMovesDone + 1;
  let next: SolveState = { ...s, fen: c.fen(), played: [...s.played, uciOf(mv)], solverMovesDone: done, onBook, status: 'playing' };
  if (c.isGameOver() || done >= s.totalSolverMoves) {
    return { state: { ...next, status: 'solved', ratedResult: s.ratedResult ?? 1 }, verdict, reply: null };
  }
  // opponent reply: the stored one while on the solution, otherwise the engine's best
  let reply = onBook ? s.puzzle.moves[next.played.length] : null;
  if (!reply) reply = verdict.userEval?.pv[0] ?? (await evaluate(c.fen())).pv[0] ?? null;
  if (!reply) return { state: { ...next, status: 'solved', ratedResult: s.ratedResult ?? 1 }, verdict, reply: null };
  const rm = playUci(c, reply);
  next = { ...next, fen: c.fen(), played: [...next.played, uciOf(rm)] };
  if (c.isGameOver()) return { state: { ...next, status: 'solved', ratedResult: s.ratedResult ?? 1 }, verdict, reply: uciOf(rm) };
  return { state: next, verdict, reply: uciOf(rm) };
}

/** After a failure the user may retry from the same position (unrated: the result stays a loss). */
export const retry = (s: SolveState): SolveState => ({ ...s, status: 'playing' });

/** Marks that a hint was used: the puzzle can be finished but counts as failed for the rating. */
export const withHint = (s: SolveState): SolveState => ({ ...s, ratedResult: s.ratedResult ?? 0 });

/** SAN of the full stored solution (for the explanation screen). */
export function solutionSan(p: Puzzle): string[] {
  const c = new Chess(p.fen);
  playUci(c, p.moves[0]);
  const out: string[] = [];
  for (const u of p.moves.slice(1)) { try { out.push(playUci(c, u).san); } catch { break; } }
  return out;
}

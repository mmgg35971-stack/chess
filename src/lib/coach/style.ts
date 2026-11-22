import { Chess } from 'chess.js';
import type { InfoLine } from '../engine/uci';
import { uciToMove } from '../chess/game';
import { balance, moveFeatures, gamePhase, type MoveFeatures } from '../analysis/features';
import type { CoachProfile } from './coaches';

/**
 * Opening book: the coach's documented repertoire lines (SAN). Returns the
 * next book move for the current game, or null when out of book.
 * The choice between several book moves rotates with `seed` (games played
 * against this coach) so repeated games show the repertoire — never random.
 */
export function bookMove(coach: CoachProfile, history: string[], coachColor: 'w' | 'b', seed: number): string | null {
  if ((history.length % 2 === 0) !== (coachColor === 'w')) return null; // not the coach's turn
  const lines = coachColor === 'w' ? coach.book.white : coach.book.black;
  const counts = new Map<string, number>();
  for (const l of lines) {
    const mv = l.split(' ');
    if (mv.length <= history.length) continue;
    if (history.every((h, i) => mv[i] === h)) {
      const next = mv[history.length];
      counts.set(next, (counts.get(next) ?? 0) + 1);
    }
  }
  if (!counts.size) return null;
  const opts = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((e) => e[0]);
  return opts[seed % opts.length];
}

export type StyleTag = 'mate' | 'sacrifice' | 'attack' | 'check' | 'simplify' | 'center' | 'develop' | 'passed' | 'complexity' | 'best';

export interface CoachChoice {
  uci: string;
  /** side-to-move POV score of the chosen line */
  scoreCp: number;
  /** engine's best score (side-to-move POV) */
  bestCp: number;
  tag: StyleTag;
  features: MoveFeatures;
  pv: string[];
}

export function cpOf(l: InfoLine): number {
  if (l.score.mate !== undefined) return l.score.mate > 0 ? 100000 - l.score.mate * 100 : -100000 - l.score.mate * 100;
  return l.score.cp ?? 0;
}

/**
 * Pick the coach's move among the engine's candidate lines (MultiPV).
 * Only moves within `marginCp` of the engine's best are eligible; among them
 * the coach's style weights decide. Deterministic for a given position.
 */
export function chooseCoachMove(fen: string, lines: InfoLine[], coach: CoachProfile, marginCp: number): CoachChoice | null {
  const valid = lines.filter((l) => l.pv.length > 0);
  if (!valid.length) return null;
  const pos = new Chess(fen);
  const me = pos.turn();
  const bestCp = cpOf(valid[0]);
  const phase = gamePhase(pos);
  const ahead = balance(pos, me) > 0;

  // Forced mate: always play the fastest one.
  if (valid[0].score.mate !== undefined && valid[0].score.mate > 0) {
    const mv = new Chess(fen).move(uciToMove(valid[0].pv[0]));
    return { uci: valid[0].pv[0], scoreCp: bestCp, bestCp, tag: 'mate', features: moveFeatures(fen, mv, valid[0].pv.slice(1)), pv: valid[0].pv };
  }

  const w = coach.weights;
  let pick: CoachChoice | null = null;
  let pickScore = -Infinity;
  for (const l of valid) {
    const cp = cpOf(l);
    if (cp < bestCp - marginCp) continue;
    if (l.score.mate !== undefined && l.score.mate < 0) continue; // never walk into mate
    let mv;
    try { mv = new Chess(fen).move(uciToMove(l.pv[0])); } catch { continue; }
    if (!mv) continue;
    const f = moveFeatures(fen, mv, l.pv.slice(1));
    const after = new Chess(fen); after.move(mv.san);
    const parts: [StyleTag, number][] = [
      ['sacrifice', w.sacrifice * Math.min(f.sacrifice, 9)],
      ['attack', w.kingAttack * Math.max(0, f.kingPressureDelta)],
      ['check', f.isCheck ? w.check : 0],
      ['simplify', (ahead && f.isCapture && Math.abs(f.lineMaterialDelta) < 1 ? w.simplify : 0) + (f.tradesQueens ? w.simplify : 0)],
      ['center', f.centralizes ? w.centralize : 0],
      ['develop', f.develops || f.isCastle ? w.develop : 0],
      ['passed', f.pushesPassedPawn && phase !== 'opening' ? w.passedPawn : 0],
      // tension: captures available to the opponent afterwards (sharp positions have many)
      ['complexity', w.complexity * 3 * after.moves({ verbose: true }).filter((m) => m.captured).length * (phase === 'endgame' ? 0.3 : 1)],
    ];
    const style = parts.reduce((s, p) => s + p[1], 0) + (f.isCapture ? w.capture : 0);
    const total = cp + style;
    if (total > pickScore) {
      pickScore = total;
      const top = parts.filter((p) => p[0] !== 'complexity').sort((a, b) => b[1] - a[1])[0];
      pick = { uci: l.pv[0], scoreCp: cp, bestCp, tag: l === valid[0] && top[1] < 8 ? 'best' : top[1] >= 8 ? top[0] : 'best', features: f, pv: l.pv };
    }
  }
  return pick;
}

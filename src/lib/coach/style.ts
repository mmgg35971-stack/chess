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

// ---------------------------------------------------------------------------
// v2: human-like choice. Every candidate gets a utility (engine score + style
// bonus); the coach picks with probability ∝ exp(utility / T). T comes from the
// difficulty level (calibrated so each level's average centipawn loss matches
// real players of the target rating) — weaker levels make real, plausible
// mistakes, and no two games are the same. Forced mates and "never walk into
// mate" are kept from strong levels upward.
// ---------------------------------------------------------------------------

export interface PlayLevel {
  level: number;
  /** approximate strength the level was calibrated to */
  targetRating: number;
  depth: number;
  /** number of candidate moves considered; 0 = all legal moves */
  multipv: number;
  /** temperature in centipawns */
  temperature: number;
  /** probability of overlooking a forced mate / walking into one (beginner levels) */
  blindness: number;
}

export function styleBonus(fen: string, l: InfoLine, coach: CoachProfile): { bonus: number; tag: StyleTag; features: MoveFeatures } | null {
  const pos = new Chess(fen);
  const me = pos.turn();
  const phase = gamePhase(pos);
  const ahead = balance(pos, me) > 0;
  let mv;
  try { mv = new Chess(fen).move(uciToMove(l.pv[0])); } catch { return null; }
  if (!mv) return null;
  const f = moveFeatures(fen, mv, l.pv.slice(1));
  const w = coach.weights;
  const after = new Chess(fen); after.move(mv.san);
  const parts: [StyleTag, number][] = [
    ['sacrifice', w.sacrifice * Math.min(f.sacrifice, 9)],
    ['attack', w.kingAttack * Math.max(0, f.kingPressureDelta)],
    ['check', f.isCheck ? w.check : 0],
    ['simplify', (ahead && f.isCapture && Math.abs(f.lineMaterialDelta) < 1 ? w.simplify : 0) + (f.tradesQueens ? w.simplify : 0)],
    ['center', f.centralizes ? w.centralize : 0],
    ['develop', f.develops || f.isCastle ? w.develop : 0],
    ['passed', f.pushesPassedPawn && phase !== 'opening' ? w.passedPawn : 0],
    ['complexity', w.complexity * 3 * after.moves({ verbose: true }).filter((m) => m.captured).length * (phase === 'endgame' ? 0.3 : 1)],
  ];
  const bonus = parts.reduce((s, p) => s + p[1], 0) + (f.isCapture ? w.capture : 0);
  const top = parts.filter((p) => p[0] !== 'complexity').sort((a, b) => b[1] - a[1])[0];
  return { bonus, tag: top[1] >= 8 ? top[0] : 'best', features: f };
}

export function chooseHumanLike(
  fen: string,
  lines: InfoLine[],
  coach: CoachProfile,
  lv: PlayLevel,
  rng: () => number = Math.random,
  /** "positionHash|san" of moves the coach played in recent games vs this user — mildly penalised */
  avoid?: Set<string>,
): CoachChoice | null {
  const valid = lines.filter((l) => l.pv.length > 0);
  if (!valid.length) return null;
  const bestCp = cpOf(valid[0]);
  const blind = rng() < lv.blindness;
  // forced mate: strong levels always take it
  if (!blind && valid[0].score.mate !== undefined && valid[0].score.mate > 0) {
    const sb = styleBonus(fen, valid[0], coach);
    return { uci: valid[0].pv[0], scoreCp: bestCp, bestCp, tag: 'mate', features: sb!.features, pv: valid[0].pv };
  }
  const cands: { l: InfoLine; u: number; sb: NonNullable<ReturnType<typeof styleBonus>> }[] = [];
  const hash = avoid?.size ? new Chess(fen).hash() : '';
  for (const l of valid) {
    if (!blind && l.score.mate !== undefined && l.score.mate < 0 && valid.some((x) => !(x.score.mate !== undefined && x.score.mate < 0))) continue;
    const sb = styleBonus(fen, l, coach);
    if (!sb) continue;
    // cap scores so "+9 vs +12" does not dominate the choice in won positions
    const cp = Math.max(-1500, Math.min(1500, cpOf(l)));
    const repeat = avoid?.size && avoid.has(hash + '|' + sb.features.san) ? Math.max(12, 0.6 * lv.temperature) : 0;
    cands.push({ l, u: cp + sb.bonus - repeat, sb });
  }
  if (!cands.length) return null;
  const maxU = Math.max(...cands.map((c) => c.u));
  const T = Math.max(1, lv.temperature);
  const ws = cands.map((c) => Math.exp((c.u - maxU) / T));
  const total = ws.reduce((a, b) => a + b, 0);
  let x = rng() * total;
  let pick = cands[cands.length - 1];
  for (let i = 0; i < cands.length; i++) { x -= ws[i]; if (x <= 0) { pick = cands[i]; break; } }
  return { uci: pick.l.pv[0], scoreCp: cpOf(pick.l), bestCp, tag: pick.l === valid[0] && pick.sb.tag === 'best' ? 'best' : pick.sb.tag, features: pick.sb.features, pv: pick.l.pv };
}

/** Weighted choice among the coach's real opening moves in this position (from its analysed games). */
export function realBookMove(
  tree: Record<string, [string, number][]> | undefined,
  fen: string,
  rng: () => number = Math.random,
  avoid?: Set<string>,
): string | null {
  if (!tree) return null;
  const key = new Chess(fen).hash();
  const opts = tree[key];
  if (!opts?.length) return null;
  // moves repeated from the last games keep a quarter of their weight, so a repeated opening
  // usually (not always) gets a different reply when the coach has one in its games
  const w = opts.map(([san, n]) => (avoid?.has(key + '|' + san) ? n * 0.25 : n));
  const total = w.reduce((s, o) => s + o, 0);
  let x = rng() * total;
  for (let i = 0; i < opts.length; i++) { x -= w[i]; if (x <= 0) return opts[i][0]; }
  return opts[0][0];
}

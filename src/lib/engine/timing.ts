/**
 * How long the engine "thinks" before playing, so games feel like a game and
 * the clock means something. Deterministic: depends only on the position and
 * the clock, never on random numbers.
 *
 * - Forced move (one legal reply): almost instant.
 * - Obvious move (best line far ahead of the second, e.g. a recapture): quick.
 * - Close choice between top lines: longer.
 * - First moves of the game: quicker, like playing known theory.
 * - With a clock: a share of remaining time + increment, never more than
 *   ~15% of what is left, so the engine does not lose on time.
 */
export interface ThinkInput {
  legalMoves: number;
  /** centipawn gap between the best and second-best line; null if unknown */
  gapCp: number | null;
  /** half-moves played so far */
  ply: number;
  /** engine's remaining clock in ms, or null when there is no clock */
  clockMs: number | null;
  incMs: number;
}

export function engineThinkMs(i: ThinkInput): number {
  if (i.legalMoves <= 1) return 400;

  let factor = 1;
  if (i.gapCp !== null) {
    if (i.gapCp >= 200) factor = 0.45;
    else if (i.gapCp >= 80) factor = 0.75;
    else if (i.gapCp <= 25) factor = 1.35;
  }
  if (i.ply < 8) factor *= 0.25;
  else if (i.ply < 16) factor *= 0.6;

  if (i.clockMs === null) {
    return Math.round(clamp(2200 * factor, 800, 3500));
  }
  const budget = i.clockMs / 40 + i.incMs * 0.8;
  const ceiling = Math.max(300, i.clockMs * 0.15);
  return Math.round(clamp(budget * factor, Math.min(600, ceiling), Math.min(12000, ceiling)));
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

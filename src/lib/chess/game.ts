import { Chess, type Move, type Square } from 'chess.js';

export type Color = 'w' | 'b';
export type ResultCode = '1-0' | '0-1' | '1/2-1/2' | '*';
export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold'
  | 'fifty-move'
  | 'insufficient'
  | 'resign'
  | 'timeout'
  | 'timeout-vs-insufficient';

export interface GameOutcome {
  result: ResultCode;
  reason: EndReason;
}

/** Outcome from the board alone (no clocks / resignation). */
export function boardOutcome(chess: Chess): GameOutcome | null {
  if (chess.isCheckmate()) {
    return { result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  }
  if (chess.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'threefold' };
  if (chess.isDrawByFiftyMoves()) return { result: '1/2-1/2', reason: 'fifty-move' };
  return null;
}

/**
 * Can `color` ever deliver mate with its material?  Used when the opponent
 * runs out of time: per FIDE rules a flag only loses if the other side can
 * still mate by any legal sequence. This is the common conservative check
 * (lone king, or king + single minor piece cannot mate).
 */
export function canMate(chess: Chess, color: Color): boolean {
  const pieces = chess
    .board()
    .flat()
    .filter((p): p is NonNullable<typeof p> => !!p && p.color === color && p.type !== 'k');
  if (pieces.length === 0) return false;
  if (pieces.length === 1 && (pieces[0].type === 'n' || pieces[0].type === 'b')) return false;
  return true;
}

export function timeoutOutcome(chess: Chess, flagged: Color): GameOutcome {
  const other: Color = flagged === 'w' ? 'b' : 'w';
  if (!canMate(chess, other)) return { result: '1/2-1/2', reason: 'timeout-vs-insufficient' };
  return { result: other === 'w' ? '1-0' : '0-1', reason: 'timeout' };
}

export function resignOutcome(resigning: Color): GameOutcome {
  return { result: resigning === 'w' ? '0-1' : '1-0', reason: 'resign' };
}

/** Parse "e2e4" / "e7e8q" (UCI) into a chess.js move object. */
export function uciToMove(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

export function moveToUci(m: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return m.from + m.to + (m.promotion ?? '');
}

/** Squares a piece on `from` may legally move to. */
export function legalTargets(chess: Chess, from: Square): Square[] {
  return chess.moves({ square: from, verbose: true }).map((m) => m.to as Square);
}

export function isPromotion(chess: Chess, from: Square, to: Square): boolean {
  return chess
    .moves({ square: from, verbose: true })
    .some((m) => m.to === to && !!m.promotion);
}

/** Try a move; returns the move or null if illegal (never throws). */
export function tryMove(
  chess: Chess,
  mv: { from: string; to: string; promotion?: string },
): Move | null {
  try {
    return chess.move(mv);
  } catch {
    return null;
  }
}

/** Find the king square of the side to move if it is in check. */
export function checkedKingSquare(chess: Chess): Square | null {
  if (!chess.inCheck()) return null;
  const turn = chess.turn();
  const rows = chess.board();
  for (const row of rows) {
    for (const p of row) {
      if (p && p.type === 'k' && p.color === turn) return p.square;
    }
  }
  return null;
}

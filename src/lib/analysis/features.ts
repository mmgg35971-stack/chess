import { Chess, type Move, type Square, type PieceSymbol, type Color } from 'chess.js';
import { uciToMove } from '../chess/game';

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const CENTER: Square[] = ['d4', 'e4', 'd5', 'e5'];
const FILES = 'abcdefgh';

export function material(chess: Chess, color: Color): number {
  let m = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.color === color) m += VALUE[p.type];
  return m;
}

/** material balance from `color`'s point of view */
export function balance(chess: Chess, color: Color): number {
  return material(chess, color) - material(chess, color === 'w' ? 'b' : 'w');
}

export function kingZone(chess: Chess, color: Color): Square[] {
  const k = chess.findPiece({ type: 'k', color })[0];
  if (!k) return [];
  const f = FILES.indexOf(k[0]), r = Number(k[1]);
  const out: Square[] = [];
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) out.push((FILES[nf] + nr) as Square);
    }
  return out;
}

function zonePressure(chess: Chess, attacker: Color): number {
  const victim: Color = attacker === 'w' ? 'b' : 'w';
  return kingZone(chess, victim).reduce((n, sq) => n + chess.attackers(sq, attacker).length, 0);
}

export interface MoveFeatures {
  san: string;
  piece: PieceSymbol;
  to: Square;
  captured?: PieceSymbol;
  isCheck: boolean;
  isMate: boolean;
  isCapture: boolean;
  capturedValue: number;
  isCastle: boolean;
  isPromotion: boolean;
  /** minor piece leaves its back rank during the opening */
  develops: boolean;
  /** lands on or newly attacks a central square */
  centralizes: boolean;
  /** queen moved in the first 10 plies (not a capture) */
  earlyQueen: boolean;
  /** same piece moved again in the opening without capturing */
  repeatsPieceInOpening: boolean;
  /** the moved piece is left attacked and not defended (value >= 3) */
  hangs: boolean;
  /** change in attacks on the enemy king zone */
  kingPressureDelta: number;
  /** pawn move in front of own castled king */
  weakensKing: boolean;
  /** pushed a pawn that has no enemy pawns ahead on its own/adjacent files */
  pushesPassedPawn: boolean;
  /** material the mover is down at worst in the forcing line, vs. before the move (pawn units) */
  sacrifice: number;
  /** the sacrifice gives up a piece (knight or more), not only pawns */
  pieceSacrifice: boolean;
  /** captures that remove queens from both sides within the line */
  tradesQueens: boolean;
  /** material swing for the mover over the line (positive = wins material) */
  lineMaterialDelta: number;
  /** what the line's first opponent reply captures (if anything) */
  opponentWins?: { piece: PieceSymbol; square: Square };
  recapture: boolean;
}

function isPassed(chess: Chess, sq: Square, color: Color): boolean {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]);
  for (const row of chess.board())
    for (const p of row) {
      if (!p || p.type !== 'p' || p.color === color) continue;
      const pf = FILES.indexOf(p.square[0]), pr = Number(p.square[1]);
      if (Math.abs(pf - f) <= 1 && (color === 'w' ? pr > r : pr < r)) return false;
    }
  return true;
}

/**
 * Board features of a move, plus what happens in the engine's principal
 * variation after it (`replyPv`: UCI moves starting with the opponent's reply).
 */
export function moveFeatures(fenBefore: string, move: Move, replyPv: string[] = [], prevMove?: Move | null): MoveFeatures {
  const before = new Chess(fenBefore);
  const mover = move.color;
  const opp: Color = mover === 'w' ? 'b' : 'w';
  const ply = (before.moveNumber() - 1) * 2 + (mover === 'b' ? 1 : 0);
  const balBefore = balance(before, mover);
  const pressureBefore = zonePressure(before, mover);

  const after = new Chess(fenBefore);
  after.move({ from: move.from, to: move.to, promotion: move.promotion });

  const centralizes =
    CENTER.includes(move.to as Square) ||
    CENTER.some((sq) => after.attackers(sq, mover).includes(move.to as Square) && !before.attackers(sq, mover).includes(move.from as Square));

  const backRank = mover === 'w' ? '1' : '8';
  const develops = ply < 20 && (move.piece === 'n' || move.piece === 'b') && move.from[1] === backRank;
  const castled = (c: Chess, col: Color) => {
    const k = c.findPiece({ type: 'k', color: col })[0];
    return !!k && (k[0] === 'g' || k[0] === 'c' || k[0] === 'b') && k[1] === (col === 'w' ? '1' : '8');
  };
  const kingSq = before.findPiece({ type: 'k', color: mover })[0];
  const weakensKing =
    move.piece === 'p' && castled(before, mover) && !!kingSq &&
    Math.abs(FILES.indexOf(move.from[0]) - FILES.indexOf(kingSq[0])) <= 1 && !move.captured;

  const history = before.history({ verbose: true });
  void history;
  const repeatsPieceInOpening = !!prevMove && ply < 16 && !move.captured && prevMove.to === move.from && move.piece !== 'p';

  const attacked = after.attackers(move.to as Square, opp).length > 0;
  const defended = after.attackers(move.to as Square, mover).length > 0;
  const hangs = VALUE[move.piece] >= 3 && attacked && !defended && !after.isCheckmate();

  // Follow the engine line. Material is sampled only after the mover's own
  // replies, so an ordinary exchange (they take, we take back) is not counted
  // as a sacrifice.
  const line = new Chess(after.fen());
  let opponentWins: MoveFeatures['opponentWins'];
  let queensGone = false;
  let afterOwnReply: number | null = null;
  const pv = replyPv.slice(0, 4);
  for (let i = 0; i < pv.length; i++) {
    let m: Move | null = null;
    try { m = line.move(uciToMove(pv[i])); } catch { break; }
    if (!m) break;
    if (i === 0 && m.captured) opponentWins = { piece: m.captured, square: m.to as Square };
    if (i === 1) afterOwnReply = balance(line, mover) - balBefore;
    if (line.findPiece({ type: 'q', color: 'w' }).length === 0 && line.findPiece({ type: 'q', color: 'b' }).length === 0) queensGone = true;
  }
  const worst = afterOwnReply ?? 0;
  const lineMaterialDelta = balance(line, mover) - balBefore;
  const hadQueens = before.findPiece({ type: 'q', color: 'w' }).length > 0 && before.findPiece({ type: 'q', color: 'b' }).length > 0;

  return {
    san: move.san,
    piece: move.piece,
    to: move.to as Square,
    captured: move.captured,
    isCheck: after.inCheck(),
    isMate: after.isCheckmate(),
    isCapture: !!move.captured,
    capturedValue: move.captured ? VALUE[move.captured] : 0,
    isCastle: move.san.startsWith('O-O'),
    isPromotion: !!move.promotion,
    develops,
    centralizes,
    earlyQueen: ply < 10 && move.piece === 'q' && !move.captured,
    repeatsPieceInOpening,
    hangs,
    kingPressureDelta: zonePressure(after, mover) - pressureBefore,
    weakensKing,
    pushesPassedPawn: move.piece === 'p' && isPassed(after, move.to as Square, mover),
    sacrifice: Math.max(0, -worst),
    pieceSacrifice: -worst >= 2 && (
      (!!opponentWins && opponentWins.piece !== 'p') ||
      (VALUE[move.piece] >= 3 && attacked && !move.captured)
    ),
    tradesQueens: hadQueens && queensGone,
    lineMaterialDelta,
    opponentWins,
    recapture: !!prevMove?.captured && prevMove.to === move.to && !!move.captured,
  };
}

/** Phase of the game for the side-to-move position (used for summaries and style). */
export function gamePhase(chess: Chess): 'opening' | 'middlegame' | 'endgame' {
  const ply = (chess.moveNumber() - 1) * 2 + (chess.turn() === 'b' ? 1 : 0);
  const nonPawn = (c: Color) =>
    chess.board().flat().filter((p) => p && p.color === c && p.type !== 'p' && p.type !== 'k')
      .reduce((s, p) => s + VALUE[p!.type], 0);
  if (nonPawn('w') + nonPawn('b') <= 26) return 'endgame';
  if (ply < 20) return 'opening';
  return 'middlegame';
}

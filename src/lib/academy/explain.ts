// Explains an opening move in plain words (spec 8.4.4–8.4.5). The reasons are computed from the
// position (development, centre control, pins, threats, prevention, gambits, castling, …), so every
// sentence is true of the board shown; curated notes for the main lines are added on top, and the
// Stockfish check says how the move compares with the engine's choice (spec 8.7).
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { Lang } from '../settings';

type Bi = { ar: string; en: string };
const PIECE: Record<PieceSymbol, Bi> = {
  p: { ar: 'البيدق', en: 'pawn' }, n: { ar: 'الحصان', en: 'knight' }, b: { ar: 'الفيل', en: 'bishop' },
  r: { ar: 'القلعة', en: 'rook' }, q: { ar: 'الوزير', en: 'queen' }, k: { ar: 'الملك', en: 'king' },
};
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const CENTER: Square[] = ['d4', 'e4', 'd5', 'e5'];
const WIDE_CENTER: Square[] = ['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5'];
const FILES = 'abcdefgh';
const join = (L: Lang, xs: string[]) => (xs.length <= 1 ? xs.join('') : L === 'ar' ? xs.slice(0, -1).join('، ') + ' و' + xs[xs.length - 1] : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

export interface EngineNote { loss: number; best: string }

function attacksFrom(c: Chess, sq: Square, color: Color): Square[] {
  const out: Square[] = [];
  for (let f = 0; f < 8; f++) for (let r = 1; r <= 8; r++) {
    const t = (FILES[f] + r) as Square;
    if (t !== sq && c.attackers(t, color).includes(sq)) out.push(t);
  }
  return out;
}

/** first enemy piece on a ray from `from`, and the piece behind it (for pins/skewers) */
function pinOf(c: Chess, from: Square, piece: PieceSymbol, color: Color): { pinned: Square; behind: Square } | null {
  const dirs = piece === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : piece === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : piece === 'q' ? [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]] : [];
  const f0 = FILES.indexOf(from[0]), r0 = Number(from[1]);
  for (const [df, dr] of dirs) {
    let first: Square | null = null;
    for (let k = 1; k < 8; k++) {
      const f = f0 + df * k, r = r0 + dr * k;
      if (f < 0 || f > 7 || r < 1 || r > 8) break;
      const s = (FILES[f] + r) as Square;
      const p = c.get(s);
      if (!p) continue;
      if (p.color === color) break;
      if (!first) { first = s; continue; }
      const fp = c.get(first)!;
      // a real pin: the piece behind is the king, queen or a rook worth more than the pinned piece
      if (['k', 'q', 'r'].includes(p.type) && VALUE[p.type] > VALUE[fp.type] && fp.type !== 'k') return { pinned: first, behind: s };
      break;
    }
  }
  return null;
}

// chess notation inside Arabic text must stay left-to-right (otherwise "3.Bc4" shows as "Bc4.3")
const SAN_RE = /(?:\d+\.(?:\.\.)?\s?)?(?:\.\.\.|…)?(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?/g;
export const isolateSan = (s: string) => s.replace(SAN_RE, (m) => '\u2066' + m + '\u2069');

export function explainOpeningMove(fenBefore: string, san: string, L: Lang, opts: { engine?: EngineNote | null; note?: Bi | null; newName?: string | null } = {}): string[] {
  const out = explainRaw(fenBefore, san, L, opts);
  return L === 'ar' ? out.map(isolateSan) : out;
}

function explainRaw(fenBefore: string, san: string, L: Lang, opts: { engine?: EngineNote | null; note?: Bi | null; newName?: string | null }): string[] {
  const before = new Chess(fenBefore);
  const me = before.turn();
  const opp: Color = me === 'w' ? 'b' : 'w';
  let mv: Move;
  try { mv = new Chess(fenBefore).move(san); } catch { return []; }
  const after = new Chess(mv.after);
  const out: string[] = [];
  const P = (p: PieceSymbol) => PIECE[p][L];
  const t = (ar: string, en: string) => out.push(L === 'ar' ? ar : en);

  if (opts.note) out.push(opts.note[L]);

  // castling
  if (mv.isKingsideCastle() || mv.isQueensideCastle()) {
    t('تبييت: الملك في أمان خلف البيادق، والقلعة تدخل اللعب نحو الوسط.', 'Castles: the king is safe behind its pawns and the rook comes towards the centre.');
  }
  // captures
  if (mv.captured) {
    const defended = after.attackers(mv.to as Square, opp).length > 0;
    if (!defended) t(`يأخذ ${P(mv.captured)} على ${mv.to}.`, `Takes the ${P(mv.captured)} on ${mv.to}.`);
    else if (VALUE[mv.captured] === VALUE[mv.piece]) t(`تبادل: يأخذ ${P(mv.captured)} على ${mv.to}، والخصم يستطيع الاسترداد.`, `An exchange: takes the ${P(mv.captured)} on ${mv.to}; the opponent can take back.`);
    else t(`يأخذ ${P(mv.captured)} على ${mv.to}.`, `Takes the ${P(mv.captured)} on ${mv.to}.`);
  }
  // pawn moves
  if (mv.piece === 'p') {
    const ctrl = attacksFrom(after, mv.to as Square, me).filter((s) => CENTER.includes(s));
    if (WIDE_CENTER.includes(mv.to as Square) || ctrl.length) {
      t(`يحتل مساحة في الوسط${ctrl.length ? ' ويسيطر على ' + join(L, ctrl) : ''}.`, `Takes space in the centre${ctrl.length ? ' and controls ' + join(L, ctrl) : ''}.`);
    }
    const challenged = attacksFrom(after, mv.to as Square, me).filter((s) => after.get(s)?.color === opp && after.get(s)?.type === 'p');
    if (challenged.length) t(`يتحدى البيدق على ${join(L, challenged)}.`, `Challenges the pawn on ${join(L, challenged)}.`);
    // fianchetto preparation
    const fi = me === 'w' ? { g3: 'f1', b3: 'c1' } : { g6: 'f8', b6: 'c8' };
    const bsq = (fi as unknown as Record<string, string>)[mv.to];
    if (bsq && before.get(bsq as Square)?.type === 'b' && before.get(bsq as Square)?.color === me) {
      const target = { g3: 'g2', b3: 'b2', g6: 'g7', b6: 'b7' }[mv.to as 'g3']!;
      t(`يجهّز «فيانكيتو»: الفيل سيخرج إلى ${target} على القطر الطويل.`, `Prepares a fianchetto: the bishop will go to ${target} on the long diagonal.`);
    }
    // opens a diagonal for a bishop
    const opened = (['c1', 'f1', 'c8', 'f8'] as Square[]).filter((s) => after.get(s)?.type === 'b' && after.get(s)?.color === me
      && attacksFrom(after, s, me).length > attacksFrom(before, s, me).length + 1);
    if (opened.length) t(`يفتح الطريق للفيل على ${opened[0]}.`, `Opens the diagonal for the bishop on ${opened[0]}.`);
    // supports a central pawn advance
    if (['c3', 'e3', 'c6', 'e6'].includes(mv.to) && !mv.captured) {
      const d = me === 'w' ? 'd4' : 'd5';
      if (after.attackers(d as Square, me).includes(mv.to as Square)) t(`يدعم البيدق على ${d} (أو تقدّمه).`, `Supports the pawn on ${d} (or its advance).`);
    }
    // prevention: squares the pawn now controls that an enemy minor piece could use
    const preventing: string[] = [];
    const asOpp = new Chess(fenBefore.replace(/ [wb] /, ` ${opp} `).replace(/ \S+ \d+ \d+$/, ' - 0 1'));
    let oppMoves: Move[] = [];
    try { oppMoves = asOpp.moves({ verbose: true }); } catch { oppMoves = []; }
    for (const s of attacksFrom(after, mv.to as Square, me)) {
      const m = oppMoves.find((x) => x.to === s && (x.piece === 'b' || x.piece === 'n') && !x.captured);
      if (m) preventing.push((opp === 'b' ? '…' : '') + m.san);
    }
    if (preventing.length && !mv.captured) t(`يمنع ${join(L, preventing.slice(0, 2))}.`, `Prevents ${join(L, preventing.slice(0, 2))}.`);
    // gambit: the pawn can be taken for free
    if (after.attackers(mv.to as Square, opp).length > 0 && after.attackers(mv.to as Square, me).length === 0 && !mv.captured) {
      t('يقدّم البيدق (غامبيت): يضحي به مقابل التطوير السريع والسيطرة على الوسط.', 'Offers the pawn (a gambit): material for quick development and the centre.');
    }
  }
  // piece development / activity
  if (mv.piece === 'n' || mv.piece === 'b') {
    const backRank = me === 'w' ? '1' : '8';
    const ctrl = attacksFrom(after, mv.to as Square, me).filter((s) => CENTER.includes(s));
    if (mv.from[1] === backRank) t(`يطوّر ${P(mv.piece)} إلى ${mv.to}${ctrl.length ? '، فيسيطر على ' + join(L, ctrl) : ''}.`, `Develops the ${P(mv.piece)} to ${mv.to}${ctrl.length ? ', controlling ' + join(L, ctrl) : ''}.`);
    else if (before.attackers(mv.from as Square, opp).length) t(`يبعد ${P(mv.piece)} عن الهجوم ويبقيه نشيطًا.`, `Moves the ${P(mv.piece)} out of attack while keeping it active.`);
    else if (!mv.captured) t(`ينقل ${P(mv.piece)} إلى مربع أفضل (${mv.to}).`, `Re-routes the ${P(mv.piece)} to a better square (${mv.to}).`);
    if (mv.piece === 'b' && ['g2', 'b2', 'g7', 'b7'].includes(mv.to)) t('الفيل على القطر الطويل يضغط على الوسط والجناح المقابل.', 'On the long diagonal the bishop presses on the centre and the far wing.');
  }
  if (mv.piece === 'r' && !mv.captured && !mv.isKingsideCastle() && !mv.isQueensideCastle()) {
    const file = mv.to[0];
    let own = 0, enemy = 0;
    for (let r = 1; r <= 8; r++) { const p = after.get((file + r) as Square); if (p?.type === 'p') p.color === me ? own++ : enemy++; }
    if (own === 0) t(enemy === 0 ? `يضع القلعة على العمود المفتوح ${file}.` : `يضع القلعة على العمود نصف المفتوح ${file}.`, enemy === 0 ? `Puts the rook on the open ${file}-file.` : `Puts the rook on the half-open ${file}-file.`);
    else t(`يضع القلعة على العمود ${file} استعدادًا لفتحه أو لدعم تقدم البيادق.`, `Puts the rook on the ${file}-file, ready for it to open or to back a pawn advance.`);
  }
  if (mv.piece === 'q' && !mv.captured) t(`يطوّر الوزير إلى ${mv.to}، ويربط القلعتين.`, `Develops the queen to ${mv.to}, connecting the rooks.`);
  // tactics after the move
  if (after.inCheck()) t('كش للملك.', 'Gives check.');
  if (mv.piece === 'b' || mv.piece === 'r' || mv.piece === 'q') {
    const pin = pinOf(after, mv.to as Square, mv.piece, me);
    if (pin) {
      const a = after.get(pin.pinned)!, b = after.get(pin.behind)!;
      t(`يثبّت ${P(a.type)} على ${pin.pinned} أمام ${P(b.type)}.`, `Pins the ${P(a.type)} on ${pin.pinned} to the ${P(b.type)}.`);
    }
  }
  const threats = attacksFrom(after, mv.to as Square, me).filter((s) => {
    const p = after.get(s);
    return p && p.color === opp && p.type !== 'k' && (VALUE[p.type] > VALUE[mv.piece] || after.attackers(s, opp).length === 0) && p.type !== 'p';
  });
  if (threats.length && !after.inCheck()) {
    const p = after.get(threats[0])!;
    t(`يهاجم ${P(p.type)} على ${threats[0]}.`, `Attacks the ${P(p.type)} on ${threats[0]}.`);
  }
  if (opts.newName) t(`وصلنا إلى: ${opts.newName}.`, `This is now: ${opts.newName}.`);
  if (out.length === 0 || (out.length === 1 && opts.newName)) t('نقلة نظرية معروفة في هذه الوضعية (قائمة افتتاحيات Lichess).', 'A known theory move in this position (Lichess openings list).');

  if (opts.engine) {
    const e = opts.engine;
    if (e.loss <= 15 && e.best === mv.san) t('تحقق Stockfish: هذه أفضل نقلة عنده هنا.', "Stockfish check: this is the engine's top choice here.");
    else if (e.loss <= 15) t(`تحقق Stockfish: جيدة بقدر اختياره (${e.best}).`, `Stockfish check: as good as its own choice (${e.best}).`);
    else if (e.loss <= 50) t(`تحقق Stockfish: نقلة نظرية مقبولة؛ المحرك يفضّل ${e.best} قليلًا.`, `Stockfish check: accepted theory; the engine slightly prefers ${e.best}.`);
    else t(`تحقق Stockfish: ممكنة لكنها أكثر خطورة؛ المحرك يفضّل ${e.best} (بفارق نحو ${(e.loss / 100).toFixed(1)} بيدق).`, `Stockfish check: playable but riskier; the engine prefers ${e.best} (by about ${(e.loss / 100).toFixed(1)} pawns).`);
  }
  return out;
}

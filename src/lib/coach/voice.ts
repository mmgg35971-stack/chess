import { Chess, type PieceSymbol } from 'chess.js';
import type { Lang } from '../settings';
import type { StyleTag } from './style';
import type { MoveFeatures } from '../analysis/features';

/**
 * What the coach says about its own move and what it suggests to the user.
 * Wording is the app's; it describes the simulated style, never quotes the
 * real player.
 */
const PIECE: Record<Lang, Record<PieceSymbol, string>> = {
  ar: { p: 'بيدقاً', n: 'حصاناً', b: 'فيلاً', r: 'قلعة', q: 'الوزير', k: 'الملك' },
  en: { p: 'a pawn', n: 'a knight', b: 'a bishop', r: 'a rook', q: 'the queen', k: 'the king' },
};

const TAG: Record<Lang, Record<StyleTag | 'book', (san: string, f: MoveFeatures) => string>> = {
  ar: {
    book: (s) => `لعبت ${s}: نقلة من الذخيرة الافتتاحية لهذا المدرب.`,
    mate: (s) => `${s}! وجدت طريقاً إجبارياً إلى الكش مات.`,
    sacrifice: (s, f) => `لعبت ${s} وضحّيت بمادة (حوالي ${Math.round(f.sacrifice)} نقاط) لأفتح الطريق إلى ملكك.`,
    attack: (s) => `لعبت ${s} لأزيد الضغط على ملكك.`,
    check: (s) => `${s} كش، لأجبرك على الرد وأحتفظ بالمبادرة.`,
    simplify: (s) => `لعبت ${s}: أبسّط الوضعية بالتبادل، فالنهاية تناسبني أكثر.`,
    center: (s) => `لعبت ${s} لأسيطر على المركز.`,
    develop: (s, f) => (f.isCastle ? `بيّتت (${s}) لأؤمّن ملكي.` : `لعبت ${s} لأطوّر قطعة جديدة.`),
    passed: (s) => `لعبت ${s}: أدفع البيدق الحر نحو الترقية.`,
    complexity: (s) => `لعبت ${s} لأُبقي الوضعية معقدة ومليئة بالخيارات.`,
    best: (s) => `لعبت ${s}، وهي أقوى نقلة وجدتها في هذه الوضعية.`,
  },
  en: {
    book: (s) => `I played ${s}: a move from this coach's opening repertoire.`,
    mate: (s) => `${s}! I found a forced way to checkmate.`,
    sacrifice: (s, f) => `I played ${s}, giving up material (about ${Math.round(f.sacrifice)} points) to open the way to your king.`,
    attack: (s) => `I played ${s} to increase the pressure on your king.`,
    check: (s) => `${s} is check: it forces your reply and keeps the initiative.`,
    simplify: (s) => `I played ${s}: simplifying with trades, the endgame suits me.`,
    center: (s) => `I played ${s} to take control of the centre.`,
    develop: (s, f) => (f.isCastle ? `I castled (${s}) to make my king safe.` : `I played ${s} to develop another piece.`),
    passed: (s) => `I played ${s}: pushing the passed pawn towards promotion.`,
    complexity: (s) => `I played ${s} to keep the position complex and full of options.`,
    best: (s) => `I played ${s}, the strongest move I found here.`,
  },
};

const BIG: PieceSymbol[] = ['n', 'b', 'r', 'q'];

export function coachMoveComment(lang: Lang, san: string, tag: StyleTag | 'book', f: MoveFeatures, threatSan?: string | null): string[] {
  // Winning a piece is the headline, whatever the style tag.
  const bigCapture = !!f.captured && BIG.includes(f.captured) && f.lineMaterialDelta >= 2 && tag !== 'mate' && tag !== 'sacrifice';
  const out = bigCapture
    ? [lang === 'ar' ? `لعبت ${san} وأخذت ${PIECE.ar[f.captured!]}.` : `I played ${san} and won ${PIECE.en[f.captured!]}.`]
    : [TAG[lang][tag](san, f)];
  if (!bigCapture && f.captured && tag !== 'sacrifice' && tag !== 'simplify') out.push(lang === 'ar' ? `وأخذت ${PIECE.ar[f.captured]}.` : `It captures ${PIECE.en[f.captured]}.`);
  if (threatSan) out.push(lang === 'ar' ? `انتبه: أخطط بعدها لـ ${threatSan}.` : `Watch out: next I am planning ${threatSan}.`);
  return out;
}

/** One short, concrete suggestion for the user's next move, from the board. */
export function planAdvice(lang: Lang, fen: string, userColor: 'w' | 'b'): string | null {
  const c = new Chess(fen);
  const ply = (c.moveNumber() - 1) * 2 + (c.turn() === 'b' ? 1 : 0);
  const back = userColor === 'w' ? '1' : '8';
  const undeveloped = c.board().flat().filter((p) => p && p.color === userColor && (p.type === 'n' || p.type === 'b') && p.square[1] === back).length;
  const king = c.findPiece({ type: 'k', color: userColor })[0];
  const castled = king && (king[0] === 'g' || king[0] === 'c') && king[1] === back;
  if (c.inCheck()) return lang === 'ar' ? 'ملكك في كش: اختر رداً يحافظ على قطعك.' : 'You are in check: choose a reply that keeps your pieces safe.';
  if (ply < 24 && undeveloped >= 2) return lang === 'ar' ? `ما زالت ${undeveloped} من قطعك الصغيرة في مكانها: طوّرها قبل الهجوم.` : `${undeveloped} of your minor pieces are still at home: develop them before attacking.`;
  if (ply >= 16 && ply < 40 && !castled && c.moves({ verbose: true }).some((m) => m.san.startsWith('O-O')))
    return lang === 'ar' ? 'فكّر في التبييت لتأمين ملكك.' : 'Consider castling to secure your king.';
  return null;
}

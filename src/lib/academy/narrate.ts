// Spoken-style explanation of one move of a repertoire line (spec 8.4.4–8.4.5): why the move is
// played, how often masters play it, what Stockfish thinks, and — for the opponent's moves — what
// he is aiming for next, which other replies exist, and how you answer.
import { Chess, type PieceSymbol } from 'chess.js';
import type { Lang } from '../settings';
import { explainOpeningMove, isolateSan } from './explain';
import { isLearnerPly } from './stages';

export interface PlyMeta { g?: number; s?: number; pop?: string; best?: string; loss?: number; idea?: string; alts?: [string, number][]; src: 'm' | 'e' | 'c' }
export interface RepLine { name: string; sans: string[]; eng: (null | { loss: number; best: string })[]; meta?: PlyMeta[]; source: string }

const PIECE: Record<PieceSymbol, [string, string]> = { p: ['بيدق', 'pawn'], n: ['الحصان', 'knight'], b: ['الفيل', 'bishop'], r: ['القلعة', 'rook'], q: ['الوزير', 'queen'], k: ['الملك', 'king'] };
const fenAt = (sans: string[], n: number) => { const c = new Chess(); for (const s of sans.slice(0, n)) c.move(s); return c; };

/** what the opponent's planned move would do (from the null-move position) */
function describeIdea(fenAfter: string, idea: string, L: Lang): string {
  const parts = fenAfter.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-';
  try {
    const m = new Chess(parts.join(' ')).move(idea);
    const after = new Chess(m.after);
    const p = (x: PieceSymbol) => PIECE[x][L === 'ar' ? 0 : 1];
    if (after.isCheckmate()) return L === 'ar' ? `يهدد بكش مات بـ ${idea}` : `threatens mate with ${idea}`;
    if (m.captured) return L === 'ar' ? `يهدد بأخذ ${p(m.captured)} على ${m.to} بـ ${idea}` : `threatens to take the ${p(m.captured)} on ${m.to} with ${idea}`;
    if (after.inCheck()) return L === 'ar' ? `يريد الكش بـ ${idea}` : `wants to check with ${idea}`;
    return L === 'ar' ? `يخطط بعدها لـ ${idea}` : `plans ${idea} next`;
  } catch { return L === 'ar' ? `يخطط لـ ${idea}` : `plans ${idea}`; }
}

export interface Narration { title: string; lines: string[] }

export function narrate(line: RepLine, i: number, side: 'w' | 'b', L: Lang, opts: { note?: { ar: string; en: string } | null; newName?: string | null } = {}): Narration {
  const ar = L === 'ar';
  const san = line.sans[i];
  const meta = line.meta?.[i];
  const before = fenAt(line.sans, i);
  const moveNo = '\u2066' + `${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '...'}${san}` + '\u2069';
  const out: string[] = [];
  const learner = isLearnerPly(i, side);
  const reasons = explainOpeningMove(before.fen(), san, L, { engine: learner ? line.eng[i] : null, note: opts.note ?? null, newName: opts.newName ?? null });
  if (learner) {
    if (meta?.src === 'm' && meta.g) {
      out.push(ar ? `لعبها الأساتذة في ${meta.s ?? 0}% من ${meta.g} مباراة وصلت إلى هذه الوضعية.` : `Masters played it in ${meta.s ?? 0}% of ${meta.g} games that reached this position.`);
      if (meta.pop && meta.pop !== san) out.push(ar ? `الأكثر لعبًا هنا ${meta.pop}، لكن هذه النقلة أنسب لنظامك أو أدق عند المحرك.` : `The most played move here is ${meta.pop}, but this one fits your system or is more accurate for the engine.`);
    } else if (meta?.src === 'e') {
      out.push(ar ? 'مباريات الأساتذة في قاعدة البيانات لا تصل إلى هنا كثيرًا؛ هذه نقلة Stockfish الأفضل.' : 'Few master games reach this position; this is Stockfish’s best move.');
    }
    out.push(...reasons);
    // what to expect next
    const reply = line.sans[i + 1];
    if (reply) out.push(ar ? `الرد المتوقع من الخصم: ${reply}.` : `Expected reply: ${reply}.`);
    return { title: (ar ? 'نقلتك: ' : 'Your move: ') + moveNo, lines: out.map((x) => (ar && !x.includes('\u2066') ? isolateSan(x) : x)) };
  }
  // the opponent's move
  if (meta?.src === 'm' && meta.g) out.push(ar ? `الخصم يلعب ${san} — لعبها الأساتذة في ${meta.s ?? 0}% من ${meta.g} مباراة.` : `The opponent plays ${san} — masters chose it in ${meta.s ?? 0}% of ${meta.g} games.`);
  else if (meta?.src === 'e') out.push(ar ? `الخصم يلعب ${san} (أفضل رد عند Stockfish هنا).` : `The opponent plays ${san} (Stockfish’s best reply here).`);
  out.push(...reasons.map((r) => (ar ? 'لماذا: ' : 'Why: ') + r));
  if (meta?.idea) out.push((ar ? 'فكرته: ' : 'His idea: ') + describeIdea(fenAt(line.sans, i + 1).fen(), meta.idea, L) + (ar ? ' (تحليل Stockfish).' : ' (Stockfish).'));
  if (meta?.alts?.length) out.push(ar ? `ردود أخرى شائعة هنا: ${meta.alts.map(([m, p]) => `${m} (${p}%)`).join('، ')} — لكل منها مرحلة خاصة.` : `Other common replies here: ${meta.alts.map(([m, p]) => `${m} (${p}%)`).join(', ')} — each has its own stage.`);
  const answer = line.sans[i + 1];
  if (answer) out.push(ar ? `ردّك: ${answer} — السبب في الخطوة التالية.` : `Your answer: ${answer} — the reason comes next.`);
  return { title: (ar ? 'الخصم: ' : 'Opponent: ') + moveNo, lines: out.map((x) => (ar && !x.includes('\u2066') ? isolateSan(x) : x)) };
}

// The coach's replies are plain text with small tags the app turns into boards, lines and puzzle cards:
//   [[board fen="…" arrows="e2e4 g1f3" caption="…"]]   [[line fen="start" moves="e4 e5 Nf3" caption="…"]]
//   [[puzzles theme="fork" n="3"]]   [[lesson id="philidor"]]   [[topic id="eg-rook"]]   [[opening id="london"]]
import { Chess } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'board'; fen: string; arrows: [string, string][]; caption: string; flip: boolean }
  | { kind: 'line'; fen: string; sans: string[]; fens: string[]; caption: string; bad?: string }
  | { kind: 'puzzles'; theme: string; n: number }
  | { kind: 'link'; type: 'lesson' | 'topic' | 'opening'; id: string }
  | { kind: 'invalid'; tag: string; reason: string };

const TAG = /\[\[\s*(board|line|puzzles|lesson|topic|opening)\b([^\]]*)\]\]/g;
const ATTR = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|“([^”]*)”)/g;

export function attrs(s: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const m of s.matchAll(ATTR)) o[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
  return o;
}

/** Accepts full FENs, piece placement only (side to move defaults to white), or "start". */
export function normalizeFen(f: string | undefined): string | null {
  if (!f || f === 'start' || f === 'startpos') return START_FEN;
  let parts = f.trim().split(/\s+/);
  if (parts.length === 1) parts = [parts[0], 'w', '-', '-', '0', '1'];
  while (parts.length < 6) parts.push(['w', '-', '-', '0', '1'][parts.length - 1]);
  parts[2] = fixCastling(parts[0], parts[2]);
  const fen = parts.slice(0, 6).join(' ');
  try { new Chess(fen); return fen; } catch {
    try { const g = [parts[0], parts[1], parts[2], '-', parts[4], parts[5]].join(' '); new Chess(g); return g; } catch { return null; }
  }
}

/** Keeps only the castling rights the king and rook placement allow (models often write KQkq by habit). */
function fixCastling(placement: string, rights: string): string {
  const rows = placement.split('/');
  if (rows.length !== 8) return rights;
  const at = (row: string, file: number) => {
    let f = 0;
    for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { if (f === file) return ch; f++; } }
    return '';
  };
  const ok: Record<string, boolean> = {
    K: at(rows[7], 4) === 'K' && at(rows[7], 7) === 'R', Q: at(rows[7], 4) === 'K' && at(rows[7], 0) === 'R',
    k: at(rows[0], 4) === 'k' && at(rows[0], 7) === 'r', q: at(rows[0], 4) === 'k' && at(rows[0], 0) === 'r',
  };
  const r = [...(rights === '-' ? '' : rights)].filter((c) => ok[c]).join('');
  return r || '-';
}

const SQ = /^[a-h][1-8]$/;
function arrowsOf(s: string | undefined): [string, string][] {
  if (!s) return [];
  return s.split(/[\s,;]+/).map((a) => a.replace(/[-x>]/g, '')).filter((a) => a.length === 4 && SQ.test(a.slice(0, 2)) && SQ.test(a.slice(2)))
    .map((a) => [a.slice(0, 2), a.slice(2)] as [string, string]).slice(0, 6);
}

/** SAN tokens of a move list, without move numbers, results or annotations. */
export function sanTokens(s: string): string[] {
  return s.replace(/\{[^}]*\}/g, ' ').split(/\s+/).map((t) => t.replace(/^\d+\.(\.\.)?/, '').replace(/[!?]+$/, ''))
    .filter((t) => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*|\.\.\.)$/.test(t));
}

export function parseReply(text: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  const pushText = (t: string) => { const s = t.replace(/\n{3,}/g, '\n\n'); if (s.trim()) out.push({ kind: 'text', text: s.trim() }); };
  for (const m of text.matchAll(TAG)) {
    pushText(text.slice(at, m.index));
    at = m.index! + m[0].length;
    const a = attrs(m[2]);
    const kind = m[1];
    if (kind === 'board') {
      const fen = normalizeFen(a.fen);
      if (!fen) { out.push({ kind: 'invalid', tag: 'board', reason: a.fen ?? '' }); continue; }
      out.push({ kind: 'board', fen, arrows: arrowsOf(a.arrows), caption: a.caption ?? '', flip: a.flip === 'b' || a.orientation === 'black' });
    } else if (kind === 'line') {
      const fen = normalizeFen(a.fen);
      if (!fen) { out.push({ kind: 'invalid', tag: 'line', reason: a.fen ?? '' }); continue; }
      const g = new Chess(fen);
      const sans: string[] = [], fens: string[] = [fen];
      let bad: string | undefined;
      for (const t of sanTokens(a.moves ?? '')) {
        try { const mv = g.move(t); sans.push(mv.san); fens.push(g.fen()); } catch { bad = t; break; }
      }
      if (!sans.length) { out.push({ kind: 'invalid', tag: 'line', reason: bad ?? '' }); continue; }
      out.push({ kind: 'line', fen, sans, fens, caption: a.caption ?? '', bad });
    } else if (kind === 'puzzles') {
      out.push({ kind: 'puzzles', theme: a.theme || a.cat || 'c_tactics', n: Math.min(6, Math.max(1, parseInt(a.n || '3', 10) || 3)) });
    } else {
      if (a.id) out.push({ kind: 'link', type: kind as 'lesson' | 'topic' | 'opening', id: a.id });
    }
  }
  pushText(text.slice(at));
  return out;
}

// The coach's replies are plain text with small tags the app turns into boards, lines and puzzle cards:
//   [[board fen="…" arrows="e2e4 g1f3" caption="…"]]   [[line fen="start" moves="e4 e5 Nf3" caption="…"]]
//   [[puzzles theme="fork" n="3"]]   [[lesson id="philidor"]]   [[topic id="eg-rook"]]   [[opening id="london"]]
import { Chess } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface ArrowSpec { from: string; to: string; color: string }
export interface MarkSpec { sq: string; color: string }
/** colour prefixes the model can use: g: green (plan), r: red (threat), b: blue (alternative), y: yellow */
export const COLORS: Record<string, string> = { g: 'rgba(21,140,60,0.85)', r: 'rgba(210,40,40,0.85)', b: 'rgba(40,110,220,0.85)', y: 'rgba(230,170,20,0.9)' };
export const MARK_COLORS: Record<string, string> = { g: 'rgba(21,140,60,0.45)', r: 'rgba(210,40,40,0.45)', b: 'rgba(40,110,220,0.45)', y: 'rgba(240,200,40,0.5)' };

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'board'; fen: string; arrows: ArrowSpec[]; marks: MarkSpec[]; caption: string; flip: boolean }
  | { kind: 'line'; fen: string; sans: string[]; fens: string[]; caption: string; bad?: string; notes: string[]; flip: boolean; arrows: ArrowSpec[]; marks: MarkSpec[] }
  | { kind: 'quiz'; fen: string; prompt: string; answers: string[]; goal: 'best' | 'win' | 'draw' | 'mate'; hint: string; explain: string; flip: boolean }
  | { kind: 'puzzles'; theme: string; n: number }
  | { kind: 'link'; type: 'lesson' | 'topic' | 'opening'; id: string }
  | { kind: 'ask'; q: string }
  | { kind: 'invalid'; tag: string; reason: string };

const TAG = /\[\[\s*(board|line|puzzles|lesson|topic|opening|ask|quiz)\b([^\]]*)\]\]/g;
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
function arrowsOf(s: string | undefined): ArrowSpec[] {
  if (!s) return [];
  const out: ArrowSpec[] = [];
  for (const raw of s.split(/[\s,;]+/)) {
    const m = /^(?:([grby]):)?([a-h][1-8])[-x>]?([a-h][1-8])$/.exec(raw.trim());
    if (m) out.push({ from: m[2], to: m[3], color: COLORS[m[1] ?? 'g'] });
  }
  return out.slice(0, 8);
}
function marksOf(s: string | undefined): MarkSpec[] {
  if (!s) return [];
  const out: MarkSpec[] = [];
  for (const raw of s.split(/[\s,;]+/)) {
    const m = /^(?:([grby]):)?([a-h][1-8])$/.exec(raw.trim());
    if (m && SQ.test(m[2])) out.push({ sq: m[2], color: MARK_COLORS[m[1] ?? 'y'] });
  }
  return out.slice(0, 16);
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
      out.push({ kind: 'board', fen, arrows: arrowsOf(a.arrows), marks: marksOf(a.marks ?? a.highlights), caption: a.caption ?? '', flip: a.flip === 'b' || a.orientation === 'black' });
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
      out.push({ kind: 'line', fen, sans, fens, caption: a.caption ?? '', bad, notes: (a.notes ?? '').split('|').map((x) => x.trim()), flip: a.flip === 'b', arrows: arrowsOf(a.arrows), marks: marksOf(a.marks ?? a.highlights) });
    } else if (kind === 'puzzles') {
      out.push({ kind: 'puzzles', theme: a.theme || a.cat || 'c_tactics', n: Math.min(6, Math.max(1, parseInt(a.n || '3', 10) || 3)) });
    } else if (kind === 'quiz') {
      const fen = normalizeFen(a.fen);
      if (!fen || new Chess(fen).isGameOver()) { out.push({ kind: 'invalid', tag: 'quiz', reason: a.fen ?? '' }); continue; }
      const g = new Chess(fen);
      const legal = new Set(g.moves());
      const strip = (x: string) => x.replace(/[+#!?]/g, '');
      const answers = (a.answer ?? '').split(/[\/,|\s]+/).filter(Boolean).filter((x) => [...legal].some((l) => strip(l) === strip(x)));
      const goal = (['win', 'draw', 'mate', 'best'].includes(a.goal) ? a.goal : 'best') as 'best' | 'win' | 'draw' | 'mate';
      out.push({ kind: 'quiz', fen, prompt: a.prompt ?? '', answers, goal, hint: a.hint ?? '', explain: a.explain ?? '', flip: a.flip === 'b' || (a.flip === undefined && g.turn() === 'b') });
    } else if (kind === 'ask') {
      if (a.q) out.push({ kind: 'ask', q: a.q });
    } else {
      if (a.id) out.push({ kind: 'link', type: kind as 'lesson' | 'topic' | 'opening', id: a.id });
    }
  }
  pushText(text.slice(at));
  return out;
}

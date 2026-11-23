// One coach-chat turn: persona prompt + conversation + tools (book search, Stockfish check) until the
// model gives its final answer.
import { Chess } from 'chess.js';
import type { CoachProfile, CoachGameStats } from '../coach/coaches';
import type { Lang } from '../settings';
import { TOPICS, LESSONS } from '../lessons/lessons';
import { OPENINGS } from '../academy/defs';
import { THEMES } from '../puzzles/explain';
import { INDEXED_CATEGORIES } from '../puzzles/categories';
import type { BookIndex, BookMeta } from './books';
import type { KnowledgeIndex, KRef } from './knowledge';
import { chat, type AiConfig, type Http, type Msg, type ToolDef } from './client';
import { normalizeFen, sanTokens } from './tags';

export interface AnalyseResult { eval: string; best: string[][]; sideToMove: 'w' | 'b' }
export interface AgentTools {
  books: () => Promise<BookIndex>;
  knowledge: () => Promise<KnowledgeIndex>;
  /** Stockfish on the device; null when the engine is unavailable */
  analyse?: (fen: string) => Promise<AnalyseResult | null>;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'search_knowledge',
    description: 'Search the coach knowledge network: ~150 chess concepts (openings, strategy, tactics, attack/defence, calculation, endgames, coach styles), each summarising the ideas of the reference books it comes from (≈220 classic and modern chess books, listed as sources), with related concepts, Stockfish-checked example positions and a puzzle theme. Query in ENGLISH keywords, or pass id to open a concept (e.g. a related one).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'English keywords, e.g. "isolated queen pawn plan" or "Lucena bridge"' },
        id: { type: 'string', description: 'concept id to open directly (from "related")' },
        area: { type: 'string', enum: ['opening', 'strategy', 'tactics', 'attack', 'defence', 'calculation', 'endgame', 'psychology', 'training', 'style'], description: 'optional area filter' },
      },
    },
  },
  {
    name: 'search_books',
    description: 'Search the app library of public-domain classic chess books (full text). Returns the best-matching passages with book, author, year and chapter. Write the query in ENGLISH keywords (the books are English; old ones use descriptive notation like P-K4, Kt-KB3).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'English keywords, e.g. "opposition king pawn ending" or "rook seventh rank"' },
        focus: { type: 'string', enum: ['opening', 'middlegame', 'endgame', 'strategy', 'games', 'history'], description: 'optional subject filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'analyse_position',
    description: 'Check a position with Stockfish on the user\'s device before you show it or claim what is best/winning. Returns the evaluation (White\'s point of view, pawns; #N = mate) and the 3 best lines in SAN.',
    parameters: {
      type: 'object',
      properties: {
        fen: { type: 'string', description: 'FEN, or "start"' },
        moves: { type: 'string', description: 'optional SAN moves played from the FEN first, e.g. "e4 e5 Nf3"' },
      },
      required: ['fen'],
    },
  },
];

const L = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);

export interface PromptInput {
  coach: CoachProfile;
  stats: CoachGameStats | null;
  lang: Lang;
  userName?: string;
  userRating?: number | null;
  puzzleRating?: number | null;
  books: BookMeta[];
  /** size of the knowledge network and the reference works by or about this coach */
  network?: { concepts: number; refs: number; coachRefs: KRef[] };
}

export function buildSystemPrompt(p: PromptInput): string {
  const c = p.coach, s = p.stats;
  const name = c.name.en;
  const repertoire = [...c.book.white.slice(0, 4).map((x) => 'White: ' + x), ...c.book.black.slice(0, 4).map((x) => 'Black: ' + x)].join('\n');
  const statLine = s
    ? `From ${s.games} of ${name}'s real classical games analysed by the app (${s.from ?? '?'}–${s.to ?? '?'}): wins ${s.score.win}, draws ${s.score.draw}, losses ${s.score.loss}; average centipawn loss ${s.acpl}; sacrifices per 100 games ${s.sacrificePer100}; queen trades ${(s.queenTradeRate * 100).toFixed(0)}% of games; most played openings: ${s.topOpenings.slice(0, 5).map((o) => `${o.name} (${o.n})`).join(', ')}.`
    : '';
  const lang = p.lang === 'ar'
    ? 'Reply in Arabic (Modern Standard Arabic, but relaxed and friendly — between formal and casual, like a good coach talking to a student; light touches are fine, no heavy slang). Keep chess moves in standard algebraic notation (Nf3, exd5, O-O) — they are written left-to-right.'
    : 'Reply in English, relaxed and friendly — between formal and casual, like a good coach talking to a student.';
  const bookList = p.books.map((b) => `- ${b.author}, "${b.title}" (${b.year}) — ${b.focus.join('/')}`).join('\n');
  const topics = TOPICS.map((t) => `${t.id} (${t.title.en})`).join(', ');
  const lessons = LESSONS.map((l) => `${l.id} (${l.title.en})`).join(', ');
  const openings = OPENINGS.map((o) => `${o.id} (${o.name.en}, for ${o.side === 'w' ? 'White' : 'Black'})`).join(', ');
  const themes = Object.keys(THEMES).join(', ');
  const cats = INDEXED_CATEGORIES.map((x) => x.id).join(', ');

  return `You are a chess coach inside the mobile app "Chess Grandmaster Academy". You coach in the manner of ${name} (${c.fullName}): ${c.style.en} Strengths: ${c.strengths.map((x) => x.en).join(', ')}.
You are an AI coach modelled on ${name}'s known style — you are NOT ${name}. Never invent quotes, memories or private opinions of the real person; you may mention facts from their public career and real games.
Public facts: ${c.bio.en} Achievements: ${c.achievements.map((x) => x.en).join('; ')}. Rating ${c.rating.value} (${c.rating.kind === 'current' ? 'current' : 'last'}, ${c.rating.asOf}); peak ${c.peak.value}.
${statLine}
Typical repertoire (from the app's coach profile):
${repertoire}

THE STUDENT: ${p.userName ? `name ${p.userName}; ` : ''}${p.userRating ? `rating about ${p.userRating}; ` : ''}${p.puzzleRating ? `puzzle rating ${p.puzzleRating}. ` : ''}Pitch explanations at their level.

STYLE: ${lang} This is a phone chat: short paragraphs, usually under 180 words unless the student asks for depth. Explain the WHY (plans, ideas, what the opponent wants and how to stop it), give one concrete example when it helps, and end with a small practical tip or question when natural. Stay on chess; steer other topics back politely.

KNOWLEDGE — your two sources, and honesty about them:
1. The knowledge network (search_knowledge): ${p.network ? `${p.network.concepts} concepts built from the ideas of ${p.network.refs} reference books` : 'concepts built from the ideas of about 220 reference books'} (Nimzowitsch, Capablanca, Dvoretsky, Silman, Kotov, Aagaard, Shereshevsky, Vuković, Nunn, Müller & Lamprecht, de la Villa, opening monographs, game collections…). Each concept is a summary in the app's own words of what those books teach, with the books named as sources. For any question about ideas, plans, structures, openings, tactics, endgames, thinking or training, call search_knowledge FIRST, open related concepts (by id) when useful, and build your answer on it. Name the source books naturally ("this is Nimzowitsch's blockade idea from My System", "Dvoretsky lists the Lucena as must-know").
2. Full text of public-domain classics (search_books) — for exact explanations or historical games from:
${bookList}
   Old books use descriptive notation (P-K4 = e4 for White, Kt = knight, ranks counted from each player's side) — convert to algebraic. Quote at most one short sentence.
- The network summarises the books' ideas; it does not contain their text. If the student asks, say so plainly: the app's knowledge was compiled from the ideas these books are known for, and the full texts in the app are only the public-domain classics. Never quote or reproduce modern books, never invent page numbers, chapters or quotes.
- If neither source covers something, answer from general chess knowledge and say it is general theory.${p.network?.coachRefs.length ? `
- Books by or about ${name} in the network: ${p.network.coachRefs.map((r) => `${r.author}, "${r.title}" (${r.year})`).join('; ')}.` : ''}
- Before you state what is best or winning in a concrete position, check it with analyse_position. If the check disagrees with you, trust Stockfish and say so.

SHOWING THINGS (the app renders these tags; put each on its own line):
- A position: [[board fen="FEN" arrows="e2e4 g1f3" caption="short caption"]]  (fen="start" for the initial position; arrows are from-to squares; add flip="b" to show it from Black's side). FENs must be legal; book passages give diagrams as [diagram FEN ...] which you can reuse (assume the side to move from the text).
- A sequence of moves the student can step through: [[line fen="start" moves="e4 e5 Nf3 Nc6 Bb5" caption="Ruy Lopez"]]  (SAN only, no move numbers).
- Puzzles to practise the idea you discussed: [[puzzles theme="fork" n="3"]]. theme = a Lichess theme (${themes}) or an app category (${cats}). The app picks puzzles near the student's rating. Offer puzzles whenever practice would help.
- Links to the app's own lessons: [[topic id="..."]] for topic pages: ${topics}. [[lesson id="..."]] for guided lessons: ${lessons}. [[opening id="..."]] for the openings course: ${openings}.
Use at most 3 boards/lines per reply. Do not use Markdown tables or headings; bold with **…** is fine.`;
}

const STATUS_AR: Record<string, string> = { search_knowledge: 'يراجع شبكة المعرفة…', search_books: 'يبحث في الكتب…', analyse_position: 'يتحقق بـ Stockfish…' };
const STATUS_EN: Record<string, string> = { search_knowledge: 'Checking the knowledge network…', search_books: 'Searching the books…', analyse_position: 'Checking with Stockfish…' };
export const toolStatus = (name: string, lang: Lang) => (lang === 'ar' ? STATUS_AR : STATUS_EN)[name] ?? L(lang, 'يفكر…', 'Thinking…');

export async function runTool(name: string, args: Record<string, unknown>, tools: AgentTools): Promise<string> {
  if (name === 'search_knowledge') {
    const kx = await tools.knowledge();
    if (typeof args.id === 'string' && args.id) {
      const c = kx.byId.get(args.id);
      return JSON.stringify(c ? { concepts: [kx.view(c)] } : { error: `No concept "${args.id}".` });
    }
    const q = String(args.query ?? '').slice(0, 200);
    const area = typeof args.area === 'string' ? args.area : undefined;
    let res = kx.search(q, 3, area);
    if (!res.length && area) res = kx.search(q, 3);
    const refs = kx.searchRefs(q, 3).map((r) => ({ book: `${r.author}, ${r.title} (${r.year})`, ideas: r.ideas }));
    if (!res.length && !refs.length) return JSON.stringify({ concepts: [], note: 'Nothing matched. Try other English keywords or search_books.' });
    return JSON.stringify({ concepts: res.map((c) => kx.view(c)), matchingBooks: refs });
  }
  if (name === 'search_books') {
    const ix = await tools.books();
    const q = String(args.query ?? '').slice(0, 200);
    const focus = typeof args.focus === 'string' ? args.focus : undefined;
    let res = ix.search(q, 4, focus);
    if (!res.length && focus) res = ix.search(q, 4);
    if (!res.length) return JSON.stringify({ results: [], note: 'No passage matched. Try other English keywords, or answer from general knowledge and say so.' });
    return JSON.stringify({
      results: res.map((r) => ({ book: r.book.title, author: r.book.author, year: r.book.year, chapter: r.heading || undefined, text: r.text.slice(0, 1500) })),
    });
  }
  if (name === 'analyse_position') {
    let fen = normalizeFen(String(args.fen ?? 'start'));
    if (!fen) return JSON.stringify({ error: 'Illegal or malformed FEN. Fix it before showing this position.' });
    if (args.moves) {
      const g = new Chess(fen);
      for (const t of sanTokens(String(args.moves))) {
        try { g.move(t); } catch { return JSON.stringify({ error: `Illegal move "${t}" in this position.`, fen: g.fen(), legal: g.moves().slice(0, 40) }); }
      }
      fen = g.fen();
    }
    const g = new Chess(fen);
    if (g.isGameOver()) return JSON.stringify({ fen, result: g.isCheckmate() ? 'checkmate' : 'draw (game over)' });
    if (!tools.analyse) return JSON.stringify({ fen, error: 'Engine unavailable right now; do not claim concrete evaluations.' });
    const r = await tools.analyse(fen);
    if (!r) return JSON.stringify({ fen, error: 'Engine unavailable right now; do not claim concrete evaluations.' });
    return JSON.stringify({ fen, sideToMove: r.sideToMove === 'w' ? 'White' : 'Black', eval: r.eval, bestLines: r.best.map((l) => l.join(' ')) });
  }
  return JSON.stringify({ error: 'unknown tool ' + name });
}

export interface TurnOptions {
  cfg: AiConfig;
  http: Http;
  system: string;
  history: Msg[];
  tools: AgentTools;
  onStatus?: (s: string) => void;
  lang: Lang;
  maxRounds?: number;
}

/** Runs the model until it answers in text (tool calls are executed locally in between). */
export async function runTurn(o: TurnOptions): Promise<string> {
  const msgs: Msg[] = [...o.history];
  const max = o.maxRounds ?? 4;
  for (let round = 0; round <= max; round++) {
    const last = round === max;
    const r = await chat(o.cfg, o.http, o.system, msgs, last ? [] : TOOL_DEFS);
    if (!r.toolCalls.length || last) {
      const text = r.text.trim();
      if (text) return text;
      break;
    }
    msgs.push({ role: 'assistant', content: r.text, toolCalls: r.toolCalls });
    for (const c of r.toolCalls) {
      o.onStatus?.(toolStatus(c.name, o.lang));
      let out: string;
      try { out = await runTool(c.name, c.args, o.tools); } catch (e) { out = JSON.stringify({ error: String((e as Error)?.message ?? e) }); }
      msgs.push({ role: 'tool', id: c.id, name: c.name, content: out });
    }
    o.onStatus?.(L(o.lang, 'يكتب الرد…', 'Writing…'));
  }
  return L(o.lang, 'لم أستطع إكمال الرد هذه المرة، جرّب إعادة صياغة السؤال.', 'I could not finish that answer — try asking again.');
}

const THEME_ALIASES: Record<string, string> = {
  opposition: 'p_pawnEnd', 'pawn endgame': 'p_pawnEnd', 'pawn ending': 'p_pawnEnd', 'rook endgame': 'p_rookEnd', 'rook ending': 'p_rookEnd',
  'queen endgame': 'p_queenEnd', 'minor piece endgame': 'p_minorEnd', endgame: 'c_endgame', ending: 'c_endgame', mate: 'c_mate', checkmate: 'c_mate',
  tactics: 'c_tactics', tactic: 'c_tactics', attack: 'c_attack', 'king attack': 'p_kingAttack', defence: 'p_defense', defense: 'c_defense',
  calculation: 'p_calc', middlegame: 'c_middlegame', 'quiet move': 'p_quiet', random: 'c_random',
};

/** What a [[puzzles theme=…]] tag means for the puzzle store: a category, optionally narrowed to Lichess themes. */
export function puzzleQuery(theme: string): { cat: string; themes?: string[] } {
  const t = theme.trim();
  if (INDEXED_CATEGORIES.some((c) => c.id === t)) return { cat: t };
  // Lichess marks every puzzle with its game phase; "opening" puzzles come from the first moves
  if (/^opening$/i.test(t)) return { cat: 'c_random', themes: ['opening'] };
  const key = Object.keys(THEMES).find((k) => k.toLowerCase() === t.toLowerCase().replace(/[\s_-]+/g, ''));
  if (key) return { cat: 'c_random', themes: [key] };
  const alias = THEME_ALIASES[t.toLowerCase().replace(/[_-]+/g, ' ')];
  if (alias) return { cat: alias };
  return { cat: 'c_tactics' };
}

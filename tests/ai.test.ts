import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Chess } from 'chess.js';
import { BookIndex, tokens, type BookFile } from '../src/lib/ai/books';
import { parseReply, normalizeFen, sanTokens, START_FEN } from '../src/lib/ai/tags';
import { chat, AiError, type AiConfig, type Http } from '../src/lib/ai/client';
import { buildSystemPrompt, runTurn, runTool, puzzleQuery } from '../src/lib/ai/agent';
import { COACHES, coachGameStats } from '../src/lib/coach/coaches';
import { PuzzleStore } from '../src/lib/puzzles/store';
import { KnowledgeIndex, type KnowledgeFile } from '../src/lib/ai/knowledge';
import { localReply, matchConcepts, normAr } from '../src/lib/ai/local-coach';
import { loadAiConfig, DEFAULT_AI } from '../src/lib/ai/client';

const library = JSON.parse(gunzipSync(readFileSync('public/data/books/books.pz')).toString()) as BookFile;
const index = new BookIndex(library);
const network = JSON.parse(gunzipSync(readFileSync('public/data/books/knowledge.pz')).toString()) as KnowledgeFile;
const kindex = new KnowledgeIndex(network);

describe('book library', () => {
  it('ships the public-domain books with their sources', () => {
    expect(library.books.length).toBeGreaterThanOrEqual(7);
    for (const b of library.books) {
      expect(b.source).toMatch(/github\.com\/GITenberg\/.+ @ [0-9a-f]{12} \(Project Gutenberg #\d+\)/);
      expect(b.year).toBeLessThan(1929); // public domain in the US
    }
    expect(library.chunks.length).toBeGreaterThan(1500);
    // the Project Gutenberg licence/boilerplate is stripped and the checkers half of Lasker's book is dropped
    expect(library.chunks.some((c) => /Project Gutenberg/i.test(c[2]))).toBe(false);
    expect(library.chunks.filter((c) => /\bcheckers\b/i.test(c[2])).length).toBeLessThan(10);
  });

  it('turns the ASCII diagrams into legal positions', () => {
    const fens = library.chunks.flatMap((c) => [...c[2].matchAll(/\[diagram FEN ([^\]]+)\]/g)].map((m) => m[1]));
    expect(fens.length).toBeGreaterThan(200);
    for (const f of fens) expect(() => new Chess(f + ' w - - 0 1')).not.toThrow();
  });

  it('stems words and finds the right chapter', () => {
    expect(tokens('Attacking the pawns')).toEqual(['attack', 'pawn']);
    const hole = index.search('knight outpost hole weak square', 3);
    expect(hole[0].book.id).toBe('capablanca-fundamentals');
    expect(hole[0].heading).toMatch(/HOLE/);
    const opp = index.search('opposition of the kings pawn ending', 3);
    expect(opp.some((p) => /opposition/i.test(p.text))).toBe(true);
    expect(index.search('Morphy Paris Duke Brunswick', 2, 'history')[0].book.id).toBe('edge-morphy');
  });
});

describe('knowledge network', () => {
  it('links every concept to known references and related concepts', () => {
    expect(network.refs.length).toBeGreaterThanOrEqual(200);
    expect(network.concepts.length).toBeGreaterThanOrEqual(150);
    const refIds = new Set(network.refs.map((r) => r.id));
    const ids = new Set(network.concepts.map((c) => c.id));
    for (const c of network.concepts) {
      expect(c.refs.length, c.id).toBeGreaterThan(0);
      for (const r of c.refs) expect(refIds.has(r), `${c.id} → ${r}`).toBe(true);
      for (const r of c.rel) expect(ids.has(r), `${c.id} ~ ${r}`).toBe(true);
      expect(c.summary.length, c.id).toBeGreaterThan(60);
    }
    // every reference is used by at least one concept
    for (const r of network.refs) expect(network.concepts.some((c) => c.refs.includes(r.id)), r.id).toBe(true);
  });

  it('has only legal example positions', () => {
    for (const c of network.concepts) for (const e of c.examples) expect(() => new Chess(e.fen!), c.id).not.toThrow();
    expect(network.concepts.flatMap((c) => c.examples).filter((e) => e.claim).length).toBeGreaterThan(20);
  });

  it('finds the right concept for a question', () => {
    expect(kindex.search('Lucena bridge rook ending', 1)[0].id).toBe('lucena');
    expect(kindex.search('isolated queen pawn plans', 1)[0].id).toBe('isolated-pawn');
    expect(kindex.search('bishop sacrifice h7 knight g5', 2).map((c) => c.id)).toContain('greek-gift');
    expect(kindex.search('candidate moves tree of analysis Kotov', 2).map((c) => c.id)).toContain('candidate-moves');
    expect(kindex.search('King\'s Indian Mar del Plata f5 attack', 2).map((c) => c.id)).toContain('kid-ideas');
    expect(kindex.searchRefs('Nimzowitsch blockade', 2).map((r) => r.id)).toContain('nimzowitsch-blockade');
  });

  it('gives the model the idea, its sources and its links', async () => {
    const out = JSON.parse(await runTool('search_knowledge', { query: 'opposition king pawn' }, tools));
    const c = out.concepts[0];
    expect(c.id).toBe('opposition');
    expect(c.sources.some((s: string) => /Dvoretsky/.test(s))).toBe(true);
    expect(c.related.map((r: any) => r.id)).toContain('key-squares');
    expect(c.examples[0].verified).toMatch(/Stockfish-checked/);
    const byId = JSON.parse(await runTool('search_knowledge', { id: 'key-squares' }, tools));
    expect(byId.concepts[0].title).toBe('Key squares');
    expect(JSON.parse(await runTool('search_knowledge', { id: 'nope' }, tools)).error).toBeTruthy();
  });
});

describe('offline coach (no key, no internet)', () => {
  const carlsen = COACHES.find((c) => c.id === 'carlsen')!;
  const tal = COACHES.find((c) => c.id === 'tal')!;
  const base = { lang: 'ar' as const, coach: carlsen, stats: coachGameStats('carlsen'), kx: kindex };

  it('is the default and needs no key', () => {
    expect(DEFAULT_AI.provider).toBe('local');
    expect(loadAiConfig().provider).toBe('local'); // nothing stored
  });

  it('has Arabic text for every concept', () => {
    for (const c of network.concepts) {
      expect(c.ar?.summary, c.id).toBeTruthy();
      expect(c.ar!.aka.length, c.id).toBeGreaterThan(0);
      expect(c.ar!.notes.length, c.id).toBe(c.examples.length);
    }
  });

  it('understands Arabic questions', () => {
    const top = (q: string) => matchConcepts(q, kindex)[0]?.c.id;
    expect(normAr('الأُسْتاذ إلى')).toBe('الاستاذ الي');
    expect(top('اشرح لي المعارضة في نهايات البيادق بمثال')).toBe('opposition');
    expect(top('شنو البيدق المعزول؟')).toBe('isolated-pawn');
    expect(top('وضعية لوسينا')).toBe('lucena');
    expect(top('متى أضحي بالفيل على h7')).toBe('greek-gift');
    expect(top('أعطني ألغازًا عن الشوكة')).toBe('fork');
    expect(top('الهندي الملكي')).toBe('kid-ideas');
    expect(top('كيف أخطط في وسط اللعب؟')).toBe('plan-making');
    expect(top('متى أبادل القطع')).toBe('exchanges');
    expect(top('Lucena position')).toBe('lucena');
    expect(matchConcepts('شرايك بالطقس اليوم', kindex)).toHaveLength(0);
  });

  it('explains a concept with a board, sources, puzzles, a lesson link and follow-ups', async () => {
    const r = await localReply({ ...base, question: 'اشرح لي المعارضة' });
    expect(r.topic).toBe('opposition');
    const segs = parseReply(r.text);
    const kinds = segs.map((x) => x.kind);
    expect(kinds).toContain('board');
    expect(kinds).toContain('puzzles');
    expect(kinds).toContain('ask');
    expect(segs.find((x) => x.kind === 'link')).toMatchObject({ type: 'lesson', id: 'opposition-1' });
    expect(r.text).toMatch(/Dvoretsky|Capablanca/);
    expect(r.text).toMatch(/المعارضة/);
    expect(segs.every((x) => x.kind !== 'invalid')).toBe(true);
  });

  it('continues the same topic on "tell me more"', async () => {
    const r = await localReply({ ...base, question: 'اشرح أكثر', lastTopic: 'lucena' });
    expect(r.topic).toBe('lucena');
    expect(r.text).toMatch(/نكمل/);
  });

  it('adds the coach\'s flavour and own repertoire', async () => {
    const t = await localReply({ ...base, coach: tal, stats: coachGameStats('tal'), question: 'متى أضحي بالفيل على h7' });
    expect(t.text).toMatch(/تال/);
    const rep = await localReply({ ...base, question: 'ما الافتتاح الذي تنصحني به بالأسود؟' });
    expect(rep.topic).toBe('repertoire');
    expect(parseReply(rep.text).filter((x) => x.kind === 'line').length).toBeGreaterThanOrEqual(1);
  });

  it('analyses a pasted FEN with the engine', async () => {
    const r = await localReply({ ...base, question: 'حلل هذه الوضعية 6k1/5ppp/8/8/8/8/q4PPP/4R1K1 w - - 0 1', analyse: async () => ({ eval: '#1', best: [['Re8#']], sideToMove: 'w' }) });
    expect(r.text).toMatch(/Stockfish/);
    expect(r.text).toMatch(/كش مات بالقوة/);
    expect(parseReply(r.text).map((x) => x.kind)).toEqual(expect.arrayContaining(['board', 'line']));
    const bad = await localReply({ ...base, question: '8/8/8/8/8/8/8/8 w - - 0 1' });
    expect(bad.text).toMatch(/غير صالحة/);
  });

  it('greets, talks about the coach, and offers topics when it does not understand', async () => {
    expect((await localReply({ ...base, question: 'من انت؟' })).text).toMatch(/كارلسن/);
    const hi = await localReply({ ...base, question: 'مرحبا' });
    expect(parseReply(hi.text).filter((x) => x.kind === 'ask').length).toBeGreaterThanOrEqual(3);
    expect((await localReply({ ...base, question: 'شرايك بالطقس' })).text).toMatch(/ما فهمت/);
  });
});

describe('reply tags', () => {
  it('turns tags into boards, lines, puzzles and links', () => {
    const segs = parseReply('Look:\n[[board fen="8/8/8/4k3/8/4K3/4P3/8 w - - 0 1" arrows="e3d3, e3f3" caption="Opposition"]]\nThen [[line fen="start" moves="1. e4 e5 2. Nf3 Nc6 3. Bb5" caption="Ruy"]]\n[[puzzles theme="fork" n="9"]] [[topic id="eg-opposition"]]');
    expect(segs.map((s) => s.kind)).toEqual(['text', 'board', 'text', 'line', 'puzzles', 'link']);
    const b = segs[1] as Extract<typeof segs[number], { kind: 'board' }>;
    expect(b.arrows).toEqual([['e3', 'd3'], ['e3', 'f3']]);
    const l = segs[3] as Extract<typeof segs[number], { kind: 'line' }>;
    expect(l.sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(l.fens).toHaveLength(6);
    expect((segs[4] as { n: number }).n).toBe(6); // capped
  });

  it('never shows an illegal position and stops a line at an illegal move', () => {
    const segs = parseReply('[[board fen="8/8/8/8/8/8/8/8 w - - 0 1"]] [[line fen="start" moves="e4 e5 Ke3 Nf6"]]');
    expect(segs[0].kind).toBe('invalid');
    const l = segs[1] as Extract<typeof segs[number], { kind: 'line' }>;
    expect(l.sans).toEqual(['e4', 'e5']);
    expect(l.bad).toBe('Ke3');
  });

  it('accepts placement-only FENs and repairs impossible castling rights', () => {
    expect(normalizeFen('start')).toBe(START_FEN);
    expect(normalizeFen('8/8/8/4k3/8/4K3/4P3/8')).toBe('8/8/8/4k3/8/4K3/4P3/8 w - - 0 1');
    expect(normalizeFen('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1')).toBe('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(normalizeFen('r3k3/8/8/8/8/8/8/4K2R w KQkq - 0 1')).toBe('r3k3/8/8/8/8/8/8/4K2R w Kq - 0 1');
    expect(sanTokens('1. e4 e5 2. Nf3! Nc6?! 3... a6 1-0')).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'a6']);
  });

  it('maps puzzle themes to the library', () => {
    expect(puzzleQuery('fork')).toEqual({ cat: 'c_random', themes: ['fork'] });
    expect(puzzleQuery('back rank mate')).toEqual({ cat: 'c_random', themes: ['backRankMate'] });
    expect(puzzleQuery('p_rookEnd')).toEqual({ cat: 'p_rookEnd' });
    expect(puzzleQuery('opposition')).toEqual({ cat: 'p_pawnEnd' });
    expect(puzzleQuery('something odd')).toEqual({ cat: 'c_tactics' });
  });
});

describe('coach persona prompt', () => {
  it('is honest about where the knowledge comes from', () => {
    const tal = COACHES.find((c) => c.id === 'tal')!;
    const p = buildSystemPrompt({ coach: tal, stats: coachGameStats('tal'), lang: 'ar', userRating: 1500, books: library.books });
    expect(p).toContain('you are NOT Mikhail Tal');
    expect(p).toContain('Capablanca');
    expect(p).toMatch(/call search_knowledge FIRST/);
    expect(p).toMatch(/does not contain their text/);
    expect(p).toMatch(/never invent page numbers/);
    expect(p).toMatch(/Reply in Arabic/);
    expect(p).toMatch(/between formal and casual/);
    expect(p).toContain('[[puzzles theme=');
  });
});

// ---------- model calls with a scripted fake provider ----------
type Req = { url: string; headers: Record<string, string>; body: any };
function fakeHttp(replies: unknown[], reqs: Req[] = []): Http {
  return async (url, init) => {
    reqs.push({ url, headers: init.headers, body: init.body });
    const r = replies.shift();
    if (r && typeof r === 'object' && 'status' in (r as object)) return r as { status: number; data: unknown };
    return { status: 200, data: r };
  };
}
const gemini: AiConfig = { provider: 'gemini', apiKey: 'k', model: 'gemini-flash-latest', baseUrl: '' };
const claude: AiConfig = { provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-5-5', baseUrl: '' };
const tools = { books: async () => index, knowledge: async () => kindex, analyse: async () => ({ eval: '+0.30', best: [['Nf3', 'Nc6']], sideToMove: 'w' as const }) };

describe('chat clients', () => {
  it('runs a tool round-trip on the OpenAI-compatible (Gemini) API and returns the final text', async () => {
    const reqs: Req[] = [];
    const http = fakeHttp([
      { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_books', arguments: '{"query":"hole outpost"}' }, extra_content: { google: { thought_signature: 'sig' } } }] } }] },
      { choices: [{ message: { content: 'A hole is a square… (Capablanca, Chess Fundamentals, 1921)\n[[puzzles theme="fork" n="2"]]' } }] },
    ], reqs);
    const statuses: string[] = [];
    const out = await runTurn({ cfg: gemini, http, system: 'sys', history: [{ role: 'user', content: 'what is a hole?' }], tools, lang: 'en', onStatus: (s) => statuses.push(s) });
    expect(out).toMatch(/Capablanca/);
    expect(reqs[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(reqs[0].headers.authorization).toBe('Bearer k');
    expect(reqs[0].body.tools.map((t: any) => t.function.name)).toEqual(['search_knowledge', 'search_books', 'analyse_position']);
    const second = reqs[1].body.messages;
    expect(second[0]).toEqual({ role: 'system', content: 'sys' });
    // the provider's tool call goes back unchanged (Gemini needs its thought signature)
    expect(second[2].tool_calls[0].extra_content.google.thought_signature).toBe('sig');
    expect(second[3].role).toBe('tool');
    expect(second[3].tool_call_id).toBe('c1');
    expect(JSON.parse(second[3].content).results[0].book).toBe('Chess Fundamentals');
    expect(statuses[0]).toMatch(/books/i);
  });

  it('speaks the Anthropic Messages format, grouping tool results into one user turn', async () => {
    const reqs: Req[] = [];
    const http = fakeHttp([
      { content: [{ type: 'text', text: 'Let me check.' }, { type: 'tool_use', id: 't1', name: 'analyse_position', input: { fen: 'start', moves: 'e4 e5' } }, { type: 'tool_use', id: 't2', name: 'search_books', input: { query: 'king pawn opening' } }] },
      { content: [{ type: 'text', text: 'Nf3 is natural.' }] },
    ], reqs);
    const out = await runTurn({ cfg: claude, http, system: 'sys', history: [{ role: 'user', content: 'after 1.e4 e5?' }], tools, lang: 'en' });
    expect(out).toBe('Nf3 is natural.');
    expect(reqs[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(reqs[0].headers['x-api-key']).toBe('k');
    expect(reqs[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(reqs[0].body.system).toBe('sys');
    const m = reqs[1].body.messages;
    expect(m.map((x: any) => x.role)).toEqual(['user', 'assistant', 'user']);
    expect(m[1].content.map((b: any) => b.type)).toEqual(['text', 'tool_use', 'tool_use']);
    expect(m[2].content.map((b: any) => b.tool_use_id)).toEqual(['t1', 't2']);
    expect(JSON.parse(m[2].content[0].content).eval).toBe('+0.30');
  });

  it('maps provider errors to messages the user can act on', async () => {
    await expect(chat(gemini, fakeHttp([{ status: 401, data: { error: { message: 'API key not valid' } } }]), 's', [], [])).rejects.toMatchObject({ kind: 'auth' });
    await expect(chat(gemini, fakeHttp([{ status: 429, data: { error: { message: 'quota' } } }]), 's', [], [])).rejects.toMatchObject({ kind: 'quota' });
    await expect(chat({ ...gemini, apiKey: '' }, fakeHttp([]), 's', [], [])).rejects.toBeInstanceOf(AiError);
    const down: Http = async () => { throw new Error('offline'); };
    await expect(chat(gemini, down, 's', [], [])).rejects.toMatchObject({ kind: 'network' });
  });

  it('stops after a bounded number of tool rounds', async () => {
    const loop = { choices: [{ message: { content: '', tool_calls: [{ id: 'x', function: { name: 'search_books', arguments: '{"query":"pawn"}' } }] } }] };
    const reqs: Req[] = [];
    const http = fakeHttp([loop, loop, { choices: [{ message: { content: 'done' } }] }], reqs);
    expect(await runTurn({ cfg: gemini, http, system: 's', history: [{ role: 'user', content: 'q' }], tools, lang: 'en', maxRounds: 2 })).toBe('done');
    expect(reqs[2].body.tools).toBeUndefined(); // last round must answer in text
  });
});

describe('local tools', () => {
  it('validates positions before the engine sees them', async () => {
    expect(JSON.parse(await runTool('analyse_position', { fen: 'nonsense' }, tools)).error).toMatch(/Illegal/);
    const bad = JSON.parse(await runTool('analyse_position', { fen: 'start', moves: 'e4 e4' }, tools));
    expect(bad.error).toMatch(/Illegal move "e4"/);
    const ok = JSON.parse(await runTool('analyse_position', { fen: 'start', moves: 'e4 e5' }, tools));
    expect(ok.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(ok.bestLines).toEqual(['Nf3 Nc6']);
    const mate = JSON.parse(await runTool('analyse_position', { fen: 'start', moves: 'f3 e5 g4 Qh4#' }, tools));
    expect(mate.result).toBe('checkmate');
  });

  it('picks themed puzzles near the rating from the library', async () => {
    const { existsSync } = await import('node:fs');
    if (!existsSync('public/data/puzzles/index.json')) return; // built in CI before the tests
    const bytes = (path: string) => { const b = readFileSync('public/data/puzzles/' + path); return new Uint8Array(path.endsWith('.pz') ? gunzipSync(b) : b); };
    const store = new PuzzleStore(async (p) => bytes(p));
    const res = await store.pickMany('c_random', 1500, 3, { themes: ['fork'], rng: () => 0.3 });
    expect(res).toHaveLength(3);
    for (const r of res) {
      expect(r.puzzle.themes).toContain('fork');
      expect(Math.abs(r.puzzle.rating - 1500)).toBeLessThan(150);
      expect((await store.get(r.row)).id).toBe(r.puzzle.id);
    }
  }, 30000);
});

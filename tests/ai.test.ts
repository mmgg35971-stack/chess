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

const library = JSON.parse(gunzipSync(readFileSync('public/data/books/books.pz')).toString()) as BookFile;
const index = new BookIndex(library);

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
    expect(p).toMatch(/NOT analysed 200 books/);
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
const tools = { books: async () => index, analyse: async () => ({ eval: '+0.30', best: [['Nf3', 'Nc6']], sideToMove: 'w' as const }) };

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
    expect(reqs[0].body.tools.map((t: any) => t.function.name)).toEqual(['search_books', 'analyse_position']);
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

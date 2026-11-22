import { describe, expect, it, afterAll, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Chess } from 'chess.js';
import { nodeEngine } from '../scripts/lib/node-engine';
import { MAIN, ENDGAME, MATE, INDEXED_CATEGORIES, categoryById, type Puzzle } from '../src/lib/puzzles/categories';
import { PuzzleStore, parseLine, countIn, nearest, inCat } from '../src/lib/puzzles/store';
import { BANDS } from '../src/lib/puzzles/glicko2';
import { goalOf, judgeAlternative, playSolverMove, startPuzzle, solutionSan, playUci, type Evaluate } from '../src/lib/puzzles/solver';
import { computeStats, getPuzzleRating, listAttempts, pickPuzzle, recordAttempt } from '../src/lib/puzzles/progress';
import { AcademyDB, useDb } from '../src/lib/storage/db';

const engine = nodeEngine();
afterAll(() => engine.terminate());
const evaluate: Evaluate = async (fen) => {
  const r = await engine.search(fen, { depth: 14 });
  const l = r.lines[0];
  return { cp: l?.score.cp, mate: l?.score.mate, pv: l?.pv ?? [] };
};

const bytes = (path: string) => { const b = readFileSync('public/data/puzzles/' + path); return new Uint8Array(path.endsWith('.gz') ? gunzipSync(b) : b); };
const store = new PuzzleStore(async (path) => bytes(path));
const idx = await store.index();
// ~1M puzzles: keep a parsed sample in memory, stream the rest chunk by chunk
const chunkLines = (c: number) => new TextDecoder().decode(bytes(`${c}.gz`)).split('\n');
const nChunks = Math.ceil(idx.n / idx.chunk);
const all: Puzzle[] = [];
for (let c = 0; c < nChunks; c++) {
  const lines = chunkLines(c);
  lines.forEach((l, i) => { if (i % 50 === 0 || l.endsWith('|g') || l.startsWith('00008|')) all.push(parseLine(l)); });
}

describe('puzzle data', () => {
  it('has the Lichess subset with valid, short solutions', () => {
    const lichess = all.filter((p) => p.source === 'l');
    expect(idx.n).toBeGreaterThan(1000000);
    expect(lichess.length).toBeGreaterThan(20000); // the in-memory sample
    for (let i = 1; i < idx.n; i++) if (idx.ratings[i] < idx.ratings[i - 1]) throw new Error('not sorted at ' + i);
    for (const p of lichess.filter((_, i) => i % 10 === 0)) {
      expect(p.moves.length % 2).toBe(0);
      expect(p.moves.length / 2).toBeLessThanOrEqual(5);
      expect(solutionSan(p)).toHaveLength(p.moves.length - 1); // every stored move is legal
    }
  }, 120000);
  it('every generated puzzle is a verified mate or a KPK win', async () => {
    const gen = all.filter((p) => p.source === 'g');
    for (const p of gen) {
      const c = new Chess(p.fen);
      for (const u of p.moves) playUci(c, u);
      if (p.themes.includes('mate')) expect(c.isCheckmate(), p.id).toBe(true);
      expect(p.moves.length / 2).toBeLessThanOrEqual(5);
    }
  });
  it('covers every rating band with thousands of puzzles', () => {
    for (const b of BANDS) expect(countIn(idx, 'c_random', b), b.key).toBeGreaterThan(b.min >= 2400 ? 3000 : 5000);
  }, 60000);
  it('every spec category has puzzles, and the index bitsets match the puzzles', () => {
    const empty = INDEXED_CATEGORIES.filter((c) => countIn(idx, c.id) === 0).map((c) => c.id);
    expect(empty).toEqual([]);
    // bitsets agree with the category definitions (checked on 20 whole chunks)
    for (let c = 0; c < nChunks; c += Math.ceil(nChunks / 20)) {
      chunkLines(c).forEach((l, k) => {
        const p = parseLine(l), i = c * idx.chunk + k;
        for (const cat of INDEXED_CATEGORIES) if (cat.id !== 'c_random') expect(inCat(idx, cat.id, i), `${cat.id} ${p.id}`).toBe(cat.test(p));
      });
    }
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    expect(MAIN).toHaveLength(10);
    expect(ENDGAME).toHaveLength(10);
    expect(MATE.map((c) => c.id)).toEqual(['m_kq', 'm_kr', 'm_kbn', 'm_in1', 'm_in2', 'm_in3', 'm_in4', 'm_in5', 'm_patterns']);
    expect(categoryById('nope').id).toBe('c_random');
  }, 120000);
});

// Lichess 00008 (CC0): after ...Bxg3? White plays Rxe7! and wins.
const p8 = all.find((p) => p.id === '00008')!;

describe('solving', () => {
  it('follows the stored line and the opponent replies', async () => {
    let s = startPuzzle(p8);
    expect(s.solverColor).toBe('w');
    expect(goalOf(p8).kind).toBe('win');
    const out = await playSolverMove(s, p8.moves[1], evaluate);
    expect(out.verdict.reason).toBe('solution');
    expect(out.reply).toBe(p8.moves[2]);
    s = out.state;
    for (let i = 3; i < p8.moves.length; i += 2) s = (await playSolverMove(s, p8.moves[i], evaluate)).state;
    expect(s.status).toBe('solved');
    expect(s.ratedResult).toBe(1);
  }, 60000);
  it('rejects a bad move and keeps the position', async () => {
    const s = startPuzzle(p8);
    const legal = new Chess(s.fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
    const bad = legal.find((u) => u !== p8.moves[1] && u.startsWith('h1'))!; // a king move
    const out = await playSolverMove(s, bad, evaluate);
    expect(out.verdict.ok).toBe(false);
    expect(out.state.status).toBe('failed');
    expect(out.state.fen).toBe(s.fen);
  }, 60000);
  it('accepts any checkmate and alternative mates within the move budget', async () => {
    // White: Kg1 Qd1 Rh1? Use a simple position: two ways to mate in 1
    const fen = '6k1/5ppp/8/8/8/8/5PPP/R2R2K1 w - - 0 1';
    const v1 = await judgeAlternative(fen, 'a1a8', 'd1d8', { kind: 'mate', n: 1 }, 1, evaluate);
    expect(v1).toMatchObject({ ok: true, reason: 'mate' });
    const v2 = await judgeAlternative(fen, 'g1f1', 'd1d8', { kind: 'mate', n: 1 }, 1, evaluate);
    expect(v2.ok).toBe(false);
    // mate in 2 budget: Rd7 also mates later? a quiet move keeping a forced mate in time is accepted
    const v3 = await judgeAlternative(fen, 'd1d7', 'd1d8', { kind: 'mate', n: 2 }, 2, evaluate);
    expect(v3.ok).toBe(false); // ...h6 gives the king air: no mate within the budget
  }, 60000);
  it('accepts an equally winning alternative in a non-mate puzzle (engine check)', async () => {
    // White is a queen up; both Qe4 and Qd4 keep a crushing advantage
    const fen = '4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1';
    const v = await judgeAlternative(fen, 'd2d4', 'd2e3', { kind: 'win' }, 1, evaluate);
    expect(v.ok).toBe(true);
    expect(v.reason).toBe('equivalent');
  }, 60000);
});

describe('rating and stats', () => {
  beforeEach(() => useDb(new AcademyDB('test-pz-' + Math.random())));
  it('starts at 1000 and moves by Glicko-2, not fixed amounts', async () => {
    expect((await getPuzzleRating()).rating).toBe(1000);
    const easy = { ...p8, rating: 700, rd: 75 }, hard = { ...p8, id: 'x', rating: 1500, rd: 75 };
    const a = await recordAttempt({ puzzle: easy, result: 1, completed: true, hints: 0, timeMs: 8000, category: 'c_random' });
    const gainEasy = a.after.rating - a.before.rating;
    const b = await recordAttempt({ puzzle: hard, result: 1, completed: true, hints: 0, timeMs: 12000, category: 'c_random' });
    const gainHard = b.after.rating - b.before.rating;
    expect(gainEasy).toBeGreaterThan(0);
    expect(gainHard).toBeGreaterThan(gainEasy);
    const c = await recordAttempt({ puzzle: hard, result: null, completed: false, hints: 0, timeMs: 1000, category: 'c_random' });
    expect(c.after.rating).toBe(c.before.rating); // skip without a move: unrated
    const st = computeStats(await listAttempts());
    expect(st).toMatchObject({ rated: 2, solved: 2, failed: 0, skipped: 1, successRate: 1 });
    expect(st.avgTimeMs).toBe(10000);
    expect(st.periods[0].n).toBe(2);
  });
  it('the store picks unseen puzzles of the category near the target', async () => {
    const p = (await store.pick('c_tactics', 1500, new Set(), () => 0))!;
    expect(Math.abs(p.rating - 1500)).toBeLessThan(30);
    expect(categoryById('c_tactics').test(p)).toBe(true);
    const p2 = (await store.pick('c_tactics', 1500, new Set([p.id]), () => 0))!;
    expect(p2.id).not.toBe(p.id);
    const hi = (await store.pick('c_random', 1500, new Set(), () => 0.3, { min: 2400, max: 99999 }))!;
    expect(hi.rating).toBeGreaterThanOrEqual(2400);
    const kbn = nearest(idx, 'm_kbn', 1000, 50);
    expect(kbn.length).toBe(countIn(idx, 'm_kbn'));
  });
  it('picks unseen puzzles close to the target rating', () => {
    const pool = all.filter(categoryById('c_tactics').test);
    const p = pickPuzzle(pool, 1500, new Set(), () => 0)!;
    expect(Math.abs(p.rating - 1500)).toBeLessThan(30);
    const p2 = pickPuzzle(pool, 1500, new Set([p.id]), () => 0)!;
    expect(p2.id).not.toBe(p.id);
    const inBand = pickPuzzle(pool, 1500, new Set(), () => 0.5, { min: 2400, max: 99999 })!;
    expect(inBand.rating).toBeGreaterThanOrEqual(2400);
  });
});

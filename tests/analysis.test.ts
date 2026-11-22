import { describe, expect, it, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';
import { EngineClient, type Transport } from '../src/lib/engine/engine';
import { classify, gameAccuracy, moveAccuracy } from '../src/lib/analysis/classify';
import { evaluateMove, analyzeGame, summarize } from '../src/lib/analysis/analyzer';
import { explain } from '../src/lib/analysis/explain';

function nodeTransport(): Transport {
  const p = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-19-lite-single.js'], { stdio: 'pipe' });
  let buf = ''; let cb: (l: string) => void = () => {};
  p.stdout.on('data', (d: Buffer) => { buf += d.toString(); const parts = buf.split('\n'); buf = parts.pop()!; for (const l of parts) cb(l); });
  return { send: (c) => p.stdin.write(c + '\n'), onLine: (f) => { cb = f; }, terminate: () => p.kill() };
}
const engine = new EngineClient(nodeTransport());
afterAll(() => engine.terminate());

async function evalPlayed(fen: string, san: string, depth = 12) {
  const pos = new Chess(fen);
  const before = (await engine.search(fen, { depth }, { multipv: 2 })).lines;
  const mv = pos.move(san);
  const after = pos.isGameOver() ? [] : (await engine.search(pos.fen(), { depth }, { multipv: 2 })).lines;
  return evaluateMove(fen, mv, null, before, after, 1);
}

describe('classification rules (pure)', () => {
  const base = { mover: 'w' as const, secondScore: null, isBest: false, sacrificeAmount: 0, isRecapture: false, legalMoves: 20 };
  it('labels by loss of win probability', () => {
    expect(classify({ ...base, isBest: true, bestScore: { cp: 30 }, playedScore: { cp: 30 } }).label).toBe('best');
    expect(classify({ ...base, bestScore: { cp: 30 }, playedScore: { cp: 20 } }).label).toBe('excellent');
    expect(classify({ ...base, bestScore: { cp: 30 }, playedScore: { cp: -120 } }).label).toBe('mistake');
    expect(classify({ ...base, bestScore: { cp: 30 }, playedScore: { cp: -700 } }).label).toBe('blunder');
  });
  it('missed win when a winning position is thrown away', () => {
    expect(classify({ ...base, bestScore: { cp: 450 }, playedScore: { cp: 20 } }).label).toBe('missedWin');
  });
  it('black mover point of view is respected', () => {
    expect(classify({ ...base, mover: 'b', bestScore: { cp: -30 }, playedScore: { cp: 700 } }).label).toBe('blunder');
  });
  it('a sacrifice alone is not brilliant: it must keep a good evaluation', () => {
    const bad = classify({ ...base, sacrificeAmount: 3, bestScore: { cp: 20 }, playedScore: { cp: -400 } });
    expect(bad.label).not.toBe('brilliant');
    const good = classify({ ...base, isBest: true, sacrificeAmount: 3, bestScore: { cp: 80 }, playedScore: { cp: 80 } });
    expect(good.label).toBe('brilliant');
  });
  it('great only when the second-best move is clearly worse', () => {
    const only = classify({ ...base, isBest: true, bestScore: { cp: 0 }, playedScore: { cp: 0 }, secondScore: { cp: -350 } });
    expect(only.label).toBe('great');
    const many = classify({ ...base, isBest: true, bestScore: { cp: 0 }, playedScore: { cp: 0 }, secondScore: { cp: -10 } });
    expect(many.label).toBe('best');
  });
  it('accuracy formula', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
    expect(moveAccuracy(0.3)).toBeLessThan(30);
    expect(gameAccuracy([100, 100, 10])!).toBeLessThan(70);
  });
});

describe('analysis with the real engine', () => {
  it('hanging the queen is a blunder and the explanation says why', async () => {
    const e = await evalPlayed('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', 'Qg4');
    expect(e.label).toBe('blunder');
    expect(e.replySan[0]).toBe('Bxg4');
    const ar = explain({ lang: 'ar', label: e.label, played: e.played, best: e.best, bestSan: e.bestSan, before: e.bestScore, after: e.playedScore, replySan: e.replySan, phase: e.phase });
    expect(ar.reasons.join(' ')).toContain('الوزير');
    expect(ar.better).toContain('الأفضل كان');
    const en = explain({ lang: 'en', label: e.label, played: e.played, best: e.best, bestSan: e.bestSan, before: e.bestScore, after: e.playedScore, replySan: e.replySan, phase: e.phase });
    expect(en.reasons.join(' ')).toMatch(/queen/);
  }, 60000);

  it('the smothered-mate queen sacrifice is brilliant', async () => {
    const e = await evalPlayed('3r3k/6pp/7N/8/2Q5/8/6PP/7K w - - 0 1', 'Qg8+');
    expect(e.played.sacrifice).toBeGreaterThanOrEqual(8);
    expect(e.label).toBe('brilliant');
  }, 60000);

  it('an ordinary exchange is not a sacrifice', async () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Bxc6 — the Exchange Ruy Lopez
    const e = await evalPlayed('r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4', 'Bxc6');
    expect(e.played.sacrifice).toBe(0);
    expect(['best', 'excellent', 'good', 'inaccuracy']).toContain(e.label);
  }, 60000);

  it('full-game analysis gives every move a label and per-side accuracy', async () => {
    const res = await analyzeGame(engine, { sans: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'] }, { depth: 10 });
    expect(res!.evals).toHaveLength(7);
    expect(res!.evals[5].label).toBe('blunder'); // ...Nf6?? allows mate
    expect(res!.evals[6].label).toBe('best');
    const s = summarize(res!.evals);
    expect(s.w.accuracy!).toBeGreaterThan(s.b.accuracy!);
    expect(res!.curve).toHaveLength(8);
  }, 120000);
});

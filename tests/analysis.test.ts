import { describe, expect, it, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';
import { EngineClient, type Transport } from '../src/lib/engine/engine';
import { classify, gameAccuracy, moveAccuracy } from '../src/lib/analysis/classify';
import { expectedPoints } from '../src/lib/analysis/expected';
import { openingName, bookPlies } from '../src/lib/analysis/book';
import { estimateRatings } from '../src/lib/analysis/gameRating';
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

describe('expected points model', () => {
  it('stronger players convert the same advantage more often', () => {
    expect(expectedPoints({ cp: 300 }, 'w', 2200)).toBeGreaterThan(expectedPoints({ cp: 300 }, 'w', 1000));
    expect(expectedPoints({ cp: 0 }, 'w', 1500)).toBeCloseTo(0.5);
    expect(expectedPoints({ cp: 300 }, 'b', 1500)).toBeCloseTo(1 - expectedPoints({ cp: 300 }, 'w', 1500));
    expect(expectedPoints({ mate: 3 }, 'w', 1500)).toBe(1);
    expect(expectedPoints({ mate: 3 }, 'b', 1500)).toBe(0);
  });
});

describe('classification rules (pure, Chess.com published ranges)', () => {
  const base = { mover: 'w' as const, rating: 1500, secondScore: null, isBest: false, sacrificeAmount: 0, pieceSacrifice: false, isRecapture: false, legalMoves: 20, inBook: false, opponentPrevLoss: null, epBeforeOpponentMove: null };
  // find the White-POV score that loses exactly `loss` expected points from equality
  const scoreForLoss = (loss: number) => { let cp = 0; while (expectedPoints({ cp }, 'w', 1500) > 0.5 - loss && cp > -1500) cp -= 1; return { cp }; };
  it('labels by expected points lost', () => {
    expect(classify({ ...base, isBest: true, bestScore: { cp: 0 }, playedScore: { cp: 0 } }).label).toBe('best');
    expect(classify({ ...base, bestScore: { cp: 0 }, playedScore: scoreForLoss(0.015) }).label).toBe('excellent');
    expect(classify({ ...base, bestScore: { cp: 0 }, playedScore: scoreForLoss(0.04) }).label).toBe('good');
    expect(classify({ ...base, bestScore: { cp: 0 }, playedScore: scoreForLoss(0.08) }).label).toBe('inaccuracy');
    expect(classify({ ...base, bestScore: { cp: 0 }, playedScore: scoreForLoss(0.15) }).label).toBe('mistake');
    expect(classify({ ...base, bestScore: { cp: 0 }, playedScore: scoreForLoss(0.3) }).label).toBe('blunder');
  });
  it('book moves are labelled Book', () => {
    expect(classify({ ...base, inBook: true, isBest: false, bestScore: { cp: 20 }, playedScore: { cp: 15 } }).label).toBe('book');
  });
  it('Miss = not punishing the opponent’s mistake', () => {
    const r = classify({ ...base, opponentPrevLoss: 0.3, epBeforeOpponentMove: 0.5, bestScore: { cp: 900 }, playedScore: { cp: 0 } });
    expect(r.label).toBe('missedWin');
    // without an opponent mistake the same drop is a plain blunder
    expect(classify({ ...base, bestScore: { cp: 900 }, playedScore: { cp: 0 } }).label).toBe('blunder');
  });
  it('black mover point of view is respected', () => {
    expect(classify({ ...base, mover: 'b', bestScore: { cp: 0 }, playedScore: { cp: 900 } }).label).toBe('blunder');
  });
  it('a sacrifice alone is not brilliant: it must be (nearly) best and keep a good position', () => {
    expect(classify({ ...base, sacrificeAmount: 3, pieceSacrifice: true, bestScore: { cp: 20 }, playedScore: { cp: -600 } }).label).not.toBe('brilliant');
    expect(classify({ ...base, isBest: true, sacrificeAmount: 3, pieceSacrifice: true, bestScore: { cp: 80 }, playedScore: { cp: 80 } }).label).toBe('brilliant');
    // a pawn gambit is not brilliant for an experienced player
    expect(classify({ ...base, rating: 2100, isBest: true, sacrificeAmount: 2, pieceSacrifice: false, bestScore: { cp: 80 }, playedScore: { cp: 80 } }).label).toBe('best');
  });
  it('great only when the alternative changes the outcome', () => {
    expect(classify({ ...base, isBest: true, bestScore: { cp: 0 }, playedScore: { cp: 0 }, secondScore: { cp: -900 } }).label).toBe('great');
    expect(classify({ ...base, isBest: true, bestScore: { cp: 0 }, playedScore: { cp: 0 }, secondScore: { cp: -10 } }).label).toBe('best');
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
    expect(res!.evals[0].label).toBe('book'); // 1.e4
    expect(res!.evals[5].label).toBe('blunder'); // ...Nf6?? allows mate
    expect(res!.evals[6].label).toBe('best');
    const s = summarize(res!.evals);
    expect(s.w.accuracy!).toBeGreaterThan(s.b.accuracy!);
    expect(res!.curve).toHaveLength(8);
  }, 120000);

  it('opening names and book detection come from the Lichess openings database', () => {
    const sans = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    expect(openingName(sans)!.name).toMatch(/Najdorf/);
    expect(bookPlies(sans).every(Boolean)).toBe(true);
    expect(bookPlies(['e4', 'e5', 'Ke2', 'Ke7', 'Kd3']).slice(-1)[0]).toBe(false);
  });

  it('game rating: a clean game rates higher than a game full of blunders', async () => {
    const clean = await analyzeGame(engine, { sans: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6', 'Bh4', 'b6', 'cxd5', 'Nxd5', 'Bxe7', 'Qxe7', 'Nxd5', 'exd5', 'Rc1', 'Be6', 'Qa4', 'c5', 'Qa3', 'Rc8'] }, { depth: 10 });
    // White plays the first legal move in alphabetical order (aimless), Black plays the engine's move
    const g = new Chess();
    for (let i = 0; i < 30 && !g.isGameOver(); i++) {
      if (g.turn() === 'w') g.move([...g.moves()].sort()[0]);
      else { const bm = (await engine.search(g.fen(), { depth: 6 })).bestmove!; g.move({ from: bm.slice(0, 2), to: bm.slice(2, 4), promotion: bm[4] }); }
    }
    const sloppy = await analyzeGame(engine, { sans: g.history() }, { depth: 10 });
    const a = estimateRatings(clean!.evals), b = estimateRatings(sloppy!.evals);
    process.stderr.write('GR ' + JSON.stringify({ clean: a, sloppy: b }) + '\n');
    expect(a.w!.rating).toBeGreaterThan(b.w!.rating);
    expect(a.w!.plusMinus).toBeGreaterThan(50);
  }, 180000);
});

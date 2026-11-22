import { describe, expect, it, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { EngineClient, type Transport } from '../src/lib/engine/engine';

// Runs the Stockfish.js build shipped in the app, under Node. The npm copy is
// spawned (CommonJS package); the test first proves it is byte-identical.
const SHIPPED = 'public/engine/stockfish-19-lite-single';
const NPM = 'node_modules/stockfish/bin/stockfish-19-lite-single';
function nodeTransport(): Transport {
  const p = spawn(process.execPath, [NPM + '.js'], { stdio: 'pipe' });
  let buf = '';
  let cb: (l: string) => void = () => {};
  p.stdout.on('data', (d: Buffer) => {
    buf += d.toString();
    const parts = buf.split('\n');
    buf = parts.pop()!;
    for (const l of parts) cb(l);
  });
  return { send: (c) => p.stdin.write(c + '\n'), onLine: (f) => { cb = f; }, terminate: () => p.kill() };
}

const engine = new EngineClient(nodeTransport());
afterAll(() => engine.terminate());

describe('stockfish (shipped build)', () => {
  it('shipped files are identical to the tested engine', () => {
    for (const ext of ['.js', '.wasm']) expect(readFileSync(SHIPPED + ext).equals(readFileSync(NPM + ext))).toBe(true);
  });

  it('boots and identifies itself', async () => {
    await engine.whenReady();
    expect(engine.name).toMatch(/Stockfish/);
  }, 30000);

  it('finds mate in one and returns a legal move', async () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    const r = await engine.search(fen, { depth: 8 });
    expect(r.bestmove).toBe('d1d8');
    expect(r.lines[0].score.mate).toBe(1);
  }, 30000);

  it('MultiPV returns several distinct legal lines', async () => {
    const fen = new Chess().fen();
    const r = await engine.search(fen, { depth: 8 }, { multipv: 3 });
    expect(r.lines).toHaveLength(3);
    const firsts = r.lines.map((l) => l.pv[0]);
    expect(new Set(firsts).size).toBe(3);
    const c = new Chess();
    for (const m of firsts) expect(() => new Chess(fen).move({ from: m.slice(0, 2), to: m.slice(2, 4) })).not.toThrow();
    expect(c.fen()).toBe(fen);
  }, 30000);

  it('weak skill level still plays legal moves for a whole game', async () => {
    await engine.setOption('Skill Level', 0);
    const c = new Chess();
    for (let i = 0; i < 40 && !c.isGameOver(); i++) {
      const r = await engine.search(c.fen(), { depth: 1 });
      expect(r.bestmove).toBeTruthy();
      c.move({ from: r.bestmove!.slice(0, 2), to: r.bestmove!.slice(2, 4), promotion: r.bestmove![4] });
    }
    expect(c.history().length).toBeGreaterThan(10);
  }, 60000);
});

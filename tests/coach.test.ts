import { describe, expect, it, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';
import { EngineClient, type Transport } from '../src/lib/engine/engine';
import { COACHES, coachById } from '../src/lib/coach/coaches';
import { bookMove, chooseCoachMove } from '../src/lib/coach/style';
import type { InfoLine } from '../src/lib/engine/uci';

function nodeTransport(): Transport {
  const p = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-19-lite-single.js'], { stdio: 'pipe' });
  let buf = ''; let cb: (l: string) => void = () => {};
  p.stdout.on('data', (d: Buffer) => { buf += d.toString(); const parts = buf.split('\n'); buf = parts.pop()!; for (const l of parts) cb(l); });
  return { send: (c) => p.stdin.write(c + '\n'), onLine: (f) => { cb = f; }, terminate: () => p.kill() };
}
const engine = new EngineClient(nodeTransport());
afterAll(() => engine.terminate());

describe('coach data', () => {
  it('seven coaches with complete, dated data', () => {
    expect(COACHES.map((c) => c.id)).toEqual(['carlsen', 'nakamura', 'caruana', 'firouzja', 'tal', 'fischer', 'kasparov']);
    for (const c of COACHES) {
      expect(c.rating.value).toBeGreaterThan(2400);
      expect(c.peak.value).toBeGreaterThanOrEqual(c.rating.value);
      expect(c.rating.asOf).toBeTruthy();
      expect(c.sources.length).toBeGreaterThan(0);
      expect(c.bio.ar && c.bio.en && c.style.ar && c.style.en).toBeTruthy();
    }
    expect(coachById('tal')!.died).toBeTruthy();
    expect(coachById('carlsen')!.died).toBeUndefined();
  });

  it('every opening-book line is legal and leaves a playable position (engine check)', async () => {
    const checked = new Set<string>();
    for (const c of COACHES) {
      for (const line of [...c.book.white, ...c.book.black]) {
        const g = new Chess();
        for (const san of line.split(' ')) expect(() => g.move(san), `${c.id}: ${line} @ ${san}`).not.toThrow();
        if (checked.has(g.fen())) continue;
        checked.add(g.fen());
        const r = await engine.search(g.fen(), { depth: 10 });
        const cp = r.lines[0].score.cp ?? (r.lines[0].score.mate! > 0 ? 9999 : -9999);
        expect(Math.abs(cp), `${c.id}: ${line} evaluates to ${cp}`).toBeLessThan(150);
      }
    }
  }, 300000);
});

describe('book moves', () => {
  it('follows the repertoire and leaves book when the user deviates', () => {
    const fischer = coachById('fischer')!;
    expect(bookMove(fischer, [], 'w', 0)).toBe('e4');
    expect(bookMove(fischer, ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], 'w', 0)).toBe('Bc4');
    expect(bookMove(fischer, ['e4', 'c5'], 'b', 0)).toBeNull(); // not black's turn in that line
    expect(bookMove(fischer, ['d4', 'Nf6', 'c4'], 'b', 0)).toBe('g6');
    expect(bookMove(fischer, ['a3'], 'b', 0)).toBeNull();
  });
  it('rotates between repertoire options with the seed, deterministically', () => {
    const carlsen = coachById('carlsen')!;
    const a = bookMove(carlsen, [], 'w', 0), b = bookMove(carlsen, [], 'w', 1);
    expect(a).toBe(bookMove(carlsen, [], 'w', 0));
    expect(new Set([a, b]).size).toBe(2);
  });
});

describe('style choice', () => {
  // 1.d4 Nf6 2.Nf3 e6 3.e3 Be7 4.Bd3 O-O 5.O-O d5 — White may play Bxh7+ (sacrifice) or a quiet Nbd2
  const g = new Chess();
  for (const m of ['d4', 'Nf6', 'Nf3', 'e6', 'e3', 'Be7', 'Bd3', 'O-O', 'O-O', 'd5']) g.move(m);
  const fen = g.fen();
  const lines: InfoLine[] = [
    { depth: 12, multipv: 1, score: { cp: 60 }, pv: ['b1d2', 'c7c5', 'c2c3'] },
    { depth: 12, multipv: 2, score: { cp: 40 }, pv: ['d3h7', 'f6h7', 'f3g5', 'e7g5'] },
  ];
  it('Tal chooses the sacrifice when it is within his margin', () => {
    const tal = coachById('tal')!;
    const c = chooseCoachMove(fen, lines, tal, tal.styleMarginCp)!;
    expect(c.uci).toBe('d3h7');
    expect(c.tag).toBe('sacrifice');
  });
  it('Carlsen keeps the quiet, better move', () => {
    const mc = coachById('carlsen')!;
    expect(chooseCoachMove(fen, lines, mc, mc.styleMarginCp)!.uci).toBe('b1d2');
  });
  it('nobody plays a move outside the margin', () => {
    const tal = coachById('tal')!;
    const far: InfoLine[] = [lines[0], { ...lines[1], score: { cp: -300 } }];
    expect(chooseCoachMove(fen, far, tal, tal.styleMarginCp)!.uci).toBe('b1d2');
  });
  it('always plays a forced mate', () => {
    const tal = coachById('tal')!;
    const mateFen = '3r3k/6pp/7N/8/2Q5/8/6PP/7K w - - 0 1';
    const ls: InfoLine[] = [{ depth: 10, multipv: 1, score: { mate: 2 }, pv: ['c4g8', 'd8g8', 'h6f7'] }, { depth: 10, multipv: 2, score: { cp: 900 }, pv: ['c4c8', 'd8c8'] }];
    expect(chooseCoachMove(mateFen, ls, tal, 500)!.tag).toBe('mate');
  });
});

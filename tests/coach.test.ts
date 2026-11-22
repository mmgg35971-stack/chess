import { describe, expect, it, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';
import { EngineClient, type Transport } from '../src/lib/engine/engine';
import { COACHES, COACH_LEVELS, coachById, coachGameStats, coachLevel, coachTree } from '../src/lib/coach/coaches';
import { bookMove, chooseCoachMove, chooseHumanLike, realBookMove } from '../src/lib/coach/style';
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

describe('human-like levels (v2)', () => {
  const g0 = new Chess();
  for (const m of ['d4', 'Nf6', 'Nf3', 'e6', 'e3', 'Be7', 'Bd3', 'O-O', 'O-O', 'd5']) g0.move(m);
  const fen = g0.fen();
  const lines: InfoLine[] = [
    { depth: 8, multipv: 1, score: { cp: 60 }, pv: ['b1d2', 'c7c5'] },
    { depth: 8, multipv: 2, score: { cp: 45 }, pv: ['c2c4', 'c7c5'] },
    { depth: 8, multipv: 3, score: { cp: -250 }, pv: ['f3e5', 'e7d6'] },
  ];
  const carlsen = coachById('carlsen')!;
  let seed = 7; const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const freq = (lv: number, n = 150) => {
    const L = coachLevel(lv); let bad = 0;
    for (let i = 0; i < n; i++) if (chooseHumanLike(fen, lines, carlsen, L, rng)!.uci === 'f3e5') bad++;
    return bad / n;
  };
  it('levels get stronger monotonically and the top level never blunders here', () => {
    expect(COACH_LEVELS).toHaveLength(7);
    for (let i = 1; i < COACH_LEVELS.length; i++) {
      expect(COACH_LEVELS[i].depth).toBeGreaterThanOrEqual(COACH_LEVELS[i - 1].depth);
      expect(COACH_LEVELS[i].temperature).toBeLessThan(COACH_LEVELS[i - 1].temperature);
    }
    const f1 = freq(1), f4 = freq(4), f7 = freq(7);
    expect(f1).toBeGreaterThan(f4);
    expect(f1).toBeGreaterThan(0.05); // a beginner sometimes plays the -250 move
    expect(f7).toBe(0);
  }, 60000);
  it('always takes a forced mate unless "blind"', () => {
    const mateLines: InfoLine[] = [{ depth: 8, multipv: 1, score: { mate: 1 }, pv: ['b1d2'] }, { depth: 8, multipv: 2, score: { cp: 0 }, pv: ['c2c4'] }];
    for (let i = 0; i < 50; i++) expect(chooseHumanLike(fen, mateLines, carlsen, coachLevel(6), rng)!.uci).toBe('b1d2');
  }, 30000);
  it('penalises moves repeated from recent games', () => {
    const even: InfoLine[] = [
      { depth: 8, multipv: 1, score: { cp: 30 }, pv: ['b1d2'] },
      { depth: 8, multipv: 2, score: { cp: 30 }, pv: ['c2c4'] },
    ];
    const avoid = new Set([new Chess(fen).hash() + '|Nbd2']);
    let rep = 0;
    for (let i = 0; i < 300; i++) if (chooseHumanLike(fen, even, carlsen, coachLevel(5), rng, avoid)!.uci === 'b1d2') rep++;
    expect(rep / 300).toBeLessThan(0.4);
  }, 60000);
});

describe('real repertoire from analysed games', () => {
  it('every coach has an opening tree built from its games, with legal moves', async () => {
    for (const c of COACHES) {
      const st = coachGameStats(c.id)!;
      expect(st, c.id).toBeTruthy();
      expect(st.games).toBeGreaterThanOrEqual(c.id === 'firouzja' ? 40 : 100);
      const tree = (await coachTree(c.id))!;
      expect(Object.keys(tree).length, c.id).toBeGreaterThan(50);
    }
    const tree = (await coachTree('fischer'))!;
    const start = new Chess();
    const opts = tree[start.hash()];
    expect(opts[0][0]).toBe('e4'); // Fischer: "1.e4 — best by test"
    for (const [san] of opts) expect(() => new Chess().move(san)).not.toThrow();
  });
  it('samples the real moves by frequency and down-weights recent repeats', async () => {
    const tree = (await coachTree('carlsen'))!;
    const start = new Chess();
    const seen = new Map<string, number>();
    let s = 1; const rng = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 300; i++) { const m = realBookMove(tree, start.fen(), rng)!; seen.set(m, (seen.get(m) ?? 0) + 1); }
    expect(seen.size).toBeGreaterThan(1); // Carlsen opened with more than one move in these games
    const top = [...seen.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const avoid = new Set([start.hash() + '|' + top]);
    let again = 0;
    for (let i = 0; i < 300; i++) if (realBookMove(tree, start.fen(), rng, avoid) === top) again++;
    expect(again).toBeLessThan(seen.get(top)!);
    expect(realBookMove(tree, '8/8/8/8/8/8/k7/K7 w - - 0 1', rng)).toBeNull();
  });
});

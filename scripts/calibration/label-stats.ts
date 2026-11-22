// Run the app's classifier over the calibration games and report label rates by rating band.
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { evaluateAll } from '../../src/lib/analysis/analyzer';
import { STRICTNESS, LABEL_ORDER } from '../../src/lib/analysis/classify';
import { estimateRatings } from '../../src/lib/analysis/gameRating';
import type { InfoLine } from '../../src/lib/engine/uci';

const files = process.argv.slice(2);
const bands = [[800, 1300], [1300, 1600], [1600, 1900], [1900, 2600]];
const tally = bands.map(() => ({ n: 0, moves: 0, c: Object.fromEntries(LABEL_ORDER.map((l) => [l, 0])) as Record<string, number> }));
let err = 0, errP = 0, cnt = 0;
for (const f of files) for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
  const g = JSON.parse(line);
  const c = new Chess();
  for (const s of g.sans) c.move(s);
  const moves = c.history({ verbose: true }).slice(0, g.evals.length - 1);
  const fens = [moves[0].before, ...moves.map((m) => m.after)];
  const lines: InfoLine[][] = g.evals.map((e: any, i: number) => {
    if (!e) return [];
    const turn = fens[i].split(' ')[1];
    const back = (s: any) => ({ cp: s.cp !== undefined ? (turn === 'w' ? s.cp : -s.cp) : undefined, mate: s.mate !== undefined ? (turn === 'w' ? s.mate : -s.mate) : undefined });
    return [e.a, e.b].filter(Boolean).map((s: any, k: number) => ({ depth: 12, multipv: k + 1, score: back(s), pv: [s.pv] }));
  });
  const evals = evaluateAll(moves, fens, lines, STRICTNESS.standard, { w: g.h.WhiteElo, b: g.h.BlackElo });
  for (const side of ['w', 'b'] as const) {
    const r = side === 'w' ? g.h.WhiteElo : g.h.BlackElo;
    const bi = bands.findIndex(([lo, hi]) => r >= lo && r < hi);
    if (bi < 0) continue;
    const mine = evals.filter((e) => e.color === side);
    tally[bi].n++; tally[bi].moves += mine.length;
    for (const e of mine) tally[bi].c[e.label]++;
  }
  // game rating error with and without a (noisy) personal prior
  const est = estimateRatings(evals);
  const noisy = (x: number) => x + Math.round((Math.random() - 0.5) * 2 * 150);
  const estP = estimateRatings(evals, { w: noisy(g.h.WhiteElo), b: noisy(g.h.BlackElo) });
  for (const side of ['w', 'b'] as const) {
    const r = side === 'w' ? g.h.WhiteElo : g.h.BlackElo;
    if (est[side]) { err += Math.abs(est[side]!.rating - r); errP += Math.abs(estP[side]!.rating - r); cnt++; }
  }
}
console.log('band        players  ' + LABEL_ORDER.map((l) => l.slice(0, 6).padStart(7)).join(''));
tally.forEach((t, i) => console.log(`${bands[i][0]}-${bands[i][1]}`.padEnd(12) + String(t.n).padStart(7) + '  ' + LABEL_ORDER.map((l) => ((100 * t.c[l]) / t.moves).toFixed(1).padStart(7)).join('')));
console.log(`game rating MAE (in-sample, app code): no prior ${Math.round(err / cnt)}, with ±150 personal prior ${Math.round(errP / cnt)}`);

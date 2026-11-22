// Typical game accuracy and blunder rate by rating band (real Lichess games), using the app's own code.
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { evaluateAll, summarize } from '../../src/lib/analysis/analyzer';
import { STRICTNESS } from '../../src/lib/analysis/classify';
import type { InfoLine } from '../../src/lib/engine/uci';
const bands = [[800, 1100], [1100, 1400], [1400, 1700], [1700, 2000], [2000, 2600]];
const acc: number[][] = bands.map(() => []), bl: number[][] = bands.map(() => []);
for (const f of process.argv.slice(2)) for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
  const g = JSON.parse(line);
  const c = new Chess(); for (const s of g.sans) c.move(s);
  const moves = c.history({ verbose: true }).slice(0, g.evals.length - 1);
  const fens = [moves[0].before, ...moves.map((m) => m.after)];
  const lines: InfoLine[][] = g.evals.map((e: any, i: number) => {
    if (!e) return [];
    const turn = fens[i].split(' ')[1];
    const back = (s: any) => ({ cp: s.cp !== undefined ? (turn === 'w' ? s.cp : -s.cp) : undefined, mate: s.mate !== undefined ? (turn === 'w' ? s.mate : -s.mate) : undefined });
    return [e.a, e.b].filter(Boolean).map((s: any, k: number) => ({ depth: 12, multipv: k + 1, score: back(s), pv: [s.pv.split(' ')[0]] }));
  });
  const ev = evaluateAll(moves, fens, lines, STRICTNESS.standard, { w: g.h.WhiteElo, b: g.h.BlackElo });
  const s = summarize(ev);
  for (const side of ['w', 'b'] as const) {
    const r = side === 'w' ? g.h.WhiteElo : g.h.BlackElo;
    const i = bands.findIndex(([lo, hi]) => r >= lo && r < hi);
    if (i < 0 || !s[side].accuracy) continue;
    acc[i].push(s[side].accuracy!); bl[i].push(s[side].counts.blunder / Math.max(1, s[side].moves));
  }
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
bands.forEach(([lo, hi], i) => console.log(`${lo}-${hi}: n=${acc[i].length} median accuracy ${med(acc[i]).toFixed(1)} mean ${mean(acc[i]).toFixed(1)} blunders/move ${(100 * mean(bl[i])).toFixed(1)}%`));

// Builds public/data/puzzles.json from the Lichess puzzle CSV (CC0) and the engine-verified
// generated endgame puzzles (scripts/puzzles/generated-*.json, see generate-endgames.ts).
//
// Lichess format: FEN is the position BEFORE the opponent's move; Moves[0] is that opponent move,
// then the solver's moves alternate with forced replies. We keep puzzles with at most 5 solver moves.
//
// Output row: [id, fen, moves, rating, rd, popularity, plays, themes, material, source]
//   material = material signature of the solving position, e.g. "KRPPvKR" (solver first)
//   source   = 'l' (Lichess) | 'g' (generated here, engine-verified)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Chess } = require('chess.js');

const here = new URL('.', import.meta.url).pathname;
const csv = readFileSync(here + 'lichess-puzzles-10000.csv', 'utf8').trim().split('\n');
const head = csv.shift().split(',');
const col = (n) => head.indexOf(n);

const ORDER = 'kqrbnp';
function signature(c) {
  const me = c.turn();
  const pieces = { w: [], b: [] };
  for (const row of c.board()) for (const p of row) if (p) pieces[p.color].push(p.type);
  const s = (arr) => arr.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('').toUpperCase();
  return s(pieces[me]) + 'v' + s(pieces[me === 'w' ? 'b' : 'w']);
}

const rows = [];
let dropped = 0;
for (const line of csv) {
  const f = line.split(',');
  const moves = f[col('Moves')].split(' ');
  if (moves.length / 2 > 5) { dropped++; continue; }
  const c = new Chess(f[col('FEN')]);
  const m0 = moves[0];
  c.move({ from: m0.slice(0, 2), to: m0.slice(2, 4), promotion: m0[4] });
  rows.push([f[col('PuzzleId')], f[col('FEN')], f[col('Moves')], +f[col('Rating')], +f[col('RatingDeviation')],
    +f[col('Popularity')], +f[col('NbPlays')], f[col('Themes')], signature(c), 'l']);
}
let gen = 0;
for (const file of readdirSync(here).filter((f) => /^generated-.*\.json$/.test(f)).sort()) {
  for (const g of JSON.parse(readFileSync(here + file, 'utf8'))) {
    const c = new Chess(g.fen);
    const m0 = g.moves.split(' ')[0];
    c.move({ from: m0.slice(0, 2), to: m0.slice(2, 4), promotion: m0[4] });
    rows.push([g.id, g.fen, g.moves, g.rating, g.rd, 0, 0, g.themes, signature(c), 'g']);
    gen++;
  }
}
writeFileSync(here + '../../public/data/puzzles.json', JSON.stringify({
  source: 'Lichess puzzle database (CC0, database.lichess.org) — 10,000-puzzle subset; plus endgame/mate positions generated and verified with Stockfish',
  columns: ['id', 'fen', 'moves', 'rating', 'rd', 'popularity', 'plays', 'themes', 'material', 'source'],
  rows,
}));
console.log(`lichess ${rows.length - gen} (dropped ${dropped} with >5 solver moves), generated ${gen}`);

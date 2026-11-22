// Builds the offline puzzle library: public/data/puzzles/index.json + public/data/puzzles/<k>.txt
//
// Sources (all CC0 except the generated ones, which are part of this project):
//   lichess-puzzles-10000.csv   10,000 Lichess puzzles with full columns (RatingDeviation, NbPlays…)
//   lichess-puzzles-92k.csv.gz  ~92,000 Lichess puzzles spread over all ratings (select-lichess-100k.py);
//                               this repackaging has no RatingDeviation/NbPlays → we use the median
//                               deviation of the 10k file (Lichess puzzle ratings are well settled)
//   generated-*.json            endgame/mate positions generated and verified here (generate-endgames.ts)
//
// Lichess format: FEN is the position BEFORE the opponent's move; Moves[0] is that move, then the
// solver's moves alternate with forced replies. Puzzles with more than 5 solver moves are left out (spec 7.5).
//
// Output: rows sorted by rating, 1000 per text file: id|fen|moves|rating|rd|plays|themes|material|source
// index.json: ratings (delta-coded) and, for every category, a bitset of the rows in it (base64).
//
// usage: npx tsx scripts/puzzles/build-puzzles.ts
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Chess } from 'chess.js';
import { ALL_CATEGORIES, type Puzzle } from '../../src/lib/puzzles/categories';

const here = new URL('.', import.meta.url).pathname;
const outDir = here + '../../public/data/puzzles/';
const CHUNK = 1000;

const ORDER = 'kqrbnp';
function signature(c: Chess) {
  const me = c.turn();
  const pieces: Record<string, string[]> = { w: [], b: [] };
  for (const row of c.board()) for (const p of row) if (p) pieces[p.color].push(p.type);
  const s = (arr: string[]) => arr.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('').toUpperCase();
  return s(pieces[me]) + 'v' + s(pieces[me === 'w' ? 'b' : 'w']);
}
function csvRows(text: string) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines.shift()!.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [head[i], v])));
}

const byId = new Map<string, Puzzle>();
let dropped = 0;
function add(id: string, fen: string, moves: string, rating: number, rd: number, plays: number, themes: string, source: 'l' | 'g') {
  if (byId.has(id)) return;
  const mv = moves.split(' ');
  if (mv.length % 2 !== 0 || mv.length / 2 > 5) { dropped++; return; }
  const c = new Chess(fen);
  c.move({ from: mv[0].slice(0, 2), to: mv[0].slice(2, 4), promotion: mv[0][4] });
  byId.set(id, { id, fen, moves: mv, rating, rd, popularity: 0, plays, themes: themes.split(' ').filter(Boolean), material: signature(c), source });
}

const full = csvRows(readFileSync(here + 'lichess-puzzles-10000.csv', 'utf8'));
for (const r of full) add(r.PuzzleId, r.FEN, r.Moves, +r.Rating, +r.RatingDeviation, +r.NbPlays, r.Themes, 'l');
const rds = full.map((r) => +r.RatingDeviation).sort((a, b) => a - b);
const medianRd = rds[Math.floor(rds.length / 2)];
const extra = csvRows(gunzipSync(readFileSync(here + 'lichess-puzzles-92k.csv.gz')).toString('utf8'));
for (const r of extra) add(r.PuzzleId, r.FEN, r.Moves, +r.Rating, medianRd, 0, r.Themes, 'l');
let gen = 0;
for (const file of readdirSync(here).filter((f) => /^generated-.*\.json$/.test(f)).sort()) {
  for (const g of JSON.parse(readFileSync(here + file, 'utf8'))) { add(g.id, g.fen, g.moves, g.rating, g.rd, 0, g.themes, 'g'); gen++; }
}

const all = [...byId.values()].sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (let k = 0; k * CHUNK < all.length; k++) {
  const lines = all.slice(k * CHUNK, (k + 1) * CHUNK).map((p) =>
    [p.id, p.fen, p.moves.join(' '), p.rating, p.rd, p.plays, p.themes.join(' '), p.material, p.source].join('|'));
  writeFileSync(`${outDir}${k}.txt`, lines.join('\n'));
}
const cats: Record<string, string> = {};
for (const c of ALL_CATEGORIES) {
  if (c.id === 'c_random') continue;
  const bits = new Uint8Array(Math.ceil(all.length / 8));
  all.forEach((p, i) => { if (c.test(p)) bits[i >> 3] |= 1 << (i & 7); });
  cats[c.id] = Buffer.from(bits).toString('base64');
}
const deltas = all.map((p, i) => (i ? p.rating - all[i - 1].rating : p.rating));
writeFileSync(outDir + 'index.json', JSON.stringify({
  source: 'Lichess puzzle database (CC0, database.lichess.org): 10,000-puzzle subset + ~92,000 puzzles spread over all ratings from the 2026-11-01 file; plus endgame/mate positions generated and verified with Stockfish',
  n: all.length, chunk: CHUNK, ratingDeltas: deltas.join(','), cats,
}));
console.log(`puzzles ${all.length} (lichess ${all.length - gen}, generated ${gen}), dropped ${dropped} with >5 solver moves; median RD used ${medianRd}`);

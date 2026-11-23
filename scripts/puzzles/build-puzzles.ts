// Builds the offline puzzle library (≈3 million puzzles) into public/data/puzzles/:
//   index.json   meta: n, chunk size, category ids and counts per rating band
//   ratings.pz   Uint16 rating of every row (rows sorted by rating)
//   cats.pz      one bitset per category (in index.json order), ceil(n/8) bytes each
//   <k>.pz       1000 rows per file: id|fen|moves|rating|rd|plays|themes|material|source
// All .pz files are gzip data. They must NOT end in .gz: the Android build silently unpacks .gz
// assets and drops the extension, which broke loading in the app.
//
// Sources (all CC0 except the generated ones, which are part of this project):
//   lichess-puzzles-10000.csv      10,000 Lichess puzzles with full columns (RatingDeviation, NbPlays…)
//   lichess-puzzles-2m-1/2.csv.gz  2,000,000 more Lichess puzzles from the same database (select-lichess-2m.py)
//   lichess-puzzles-1m.csv.gz      ≈1,040,000 Lichess puzzles spread over all ratings (select-lichess-1m.py,
//                                  from the 2026-11-01 database); this repackaging has no RatingDeviation/
//                                  NbPlays → the median deviation of the 10k file is used
//   generated-*.json               endgame/mate positions generated and verified here (generate-endgames.ts)
//
// Puzzles with more than 5 solver moves are left out (spec 7.5).
// usage: NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/puzzles/build-puzzles.ts
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Chess } from 'chess.js';
import { INDEXED_CATEGORIES, type Puzzle } from '../../src/lib/puzzles/categories';
import { BANDS } from '../../src/lib/puzzles/glicko2';

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
function* csvRows(text: string) {
  let start = text.indexOf('\n') + 1;
  const head = text.slice(0, start).trim().split(',');
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const l = text.slice(start, end).replace(/\r$/, '');
    start = end + 1;
    if (!l) continue;
    const v = l.split(',');
    yield Object.fromEntries(head.map((h, i) => [h, v[i]])) as Record<string, string>;
  }
}

interface Row { line: string; rating: number; id: string; cats: Uint8Array }
const rows: Row[] = [];
const ids = new Set<string>();
let dropped = 0;
function add(id: string, fen: string, moves: string, rating: number, rd: number, plays: number, themes: string, source: 'l' | 'g') {
  if (ids.has(id)) return;
  const mv = moves.split(' ');
  if (mv.length % 2 !== 0 || mv.length / 2 > 5) { dropped++; return; }
  const c = new Chess(fen);
  c.move({ from: mv[0].slice(0, 2), to: mv[0].slice(2, 4), promotion: mv[0][4] });
  const material = signature(c);
  const p: Puzzle = { id, fen, moves: mv, rating, rd, popularity: 0, plays, themes: themes.split(' ').filter(Boolean), material, source };
  const cats = new Uint8Array(INDEXED_CATEGORIES.length);
  INDEXED_CATEGORIES.forEach((cat, k) => { if (cat.id !== 'c_random' && cat.test(p)) cats[k] = 1; });
  ids.add(id);
  rows.push({ id, rating, cats, line: [id, fen, moves, rating, rd, plays, themes, material, source].join('|') });
}

const full = [...csvRows(readFileSync(here + 'lichess-puzzles-10000.csv', 'utf8'))];
for (const r of full) add(r.PuzzleId, r.FEN, r.Moves, +r.Rating, +r.RatingDeviation, +r.NbPlays, r.Themes, 'l');
const rds = full.map((r) => +r.RatingDeviation).sort((a, b) => a - b);
const medianRd = rds[Math.floor(rds.length / 2)];
let n = 0;
// lichess-puzzles-1m.csv.gz (first selection) + lichess-puzzles-2m-1/2.csv.gz (2,000,000 more, select-lichess-2m.py)
for (const file of readdirSync(here).filter((f) => /^lichess-puzzles-(1m|2m-\d)\.csv\.gz$/.test(f)).sort()) {
  for (const r of csvRows(gunzipSync(readFileSync(here + file)).toString('utf8'))) {
    add(r.PuzzleId, r.FEN, r.Moves, +r.Rating, medianRd, 0, r.Themes, 'l');
    if (++n % 500000 === 0) console.log('…', n);
  }
}
let gen = 0;
for (const file of readdirSync(here).filter((f) => /^generated-.*\.json$/.test(f)).sort()) {
  for (const g of JSON.parse(readFileSync(here + file, 'utf8'))) { add(g.id, g.fen, g.moves, g.rating, g.rd, 0, g.themes, 'g'); gen++; }
}
rows.sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (let k = 0; k * CHUNK < rows.length; k++) {
  writeFileSync(`${outDir}${k}.pz`, gzipSync(rows.slice(k * CHUNK, (k + 1) * CHUNK).map((r) => r.line).join('\n'), { level: 9 }));
}
const N = rows.length, B = Math.ceil(N / 8);
const ratings = new Uint16Array(N);
rows.forEach((r, i) => { ratings[i] = r.rating; });
writeFileSync(outDir + 'ratings.pz', gzipSync(Buffer.from(ratings.buffer), { level: 9 }));
const bits = new Uint8Array(B * INDEXED_CATEGORIES.length);
const counts: Record<string, number[]> = {};
INDEXED_CATEGORIES.forEach((cat, k) => {
  const perBand = BANDS.map(() => 0);
  rows.forEach((r, i) => {
    if (cat.id !== 'c_random' && !r.cats[k]) return;
    if (cat.id !== 'c_random') bits[k * B + (i >> 3)] |= 1 << (i & 7);
    perBand[BANDS.findIndex((b) => r.rating >= b.min && r.rating < b.max)]++;
  });
  counts[cat.id] = perBand;
});
writeFileSync(outDir + 'cats.pz', gzipSync(Buffer.from(bits), { level: 9 }));
writeFileSync(outDir + 'index.json', JSON.stringify({
  source: 'Lichess puzzle database (CC0, database.lichess.org; file of 2026-11-01): ~3,040,000 puzzles spread over all ratings (selections of 1,040,000 + 2,000,000) + the 10,000-puzzle subset; plus endgame/mate positions generated and verified with Stockfish',
  n: N, chunk: CHUNK, cats: INDEXED_CATEGORIES.map((c) => c.id), bands: BANDS.map((b) => b.key), counts,
}));
console.log(`puzzles ${N} (lichess ${N - gen}, generated ${gen}), dropped ${dropped} with >5 solver moves; median RD used ${medianRd}`);

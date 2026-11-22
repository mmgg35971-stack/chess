// Builds src/data/coach-profiles.json from the coaches' real games.
//
// Input: JSONL produced by scripts/coach-data/analyze-coach-games.mjs: one line per game with
//   {coach, idx, color, h (headers), sans, evals[i] = {a: best, b: second} (White POV, depth 10, PV of 4 plies)}.
// Source PGNs: kinairi/chess-data (GPL-3.0), data/players/*.pgn — see docs/DATA_SOURCES.md.
//
// Output per coach:
//   - tree:  opening repertoire actually played by the coach, keyed by chess.js position hash
//            (positions with the coach to move, first 24 plies) → [[san, count], ...]
//   - stats: measured style numbers (ACPL, best-move rate, captures, checks, sound sacrifices, …)
//   - styleFactor: multipliers for the hand-written style weights, derived from those numbers
//                  relative to the average of all coaches (clamped to 0.6–1.6).
//
// usage: npx tsx scripts/coach-data/build-coach-profiles.ts <outDir> <in1.jsonl> [in2.jsonl ...]
//   writes <outDir>/coach-stats.json (small, shown on coach cards) and <outDir>/coach-trees.json (loaded lazily in games)
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { moveFeatures, balance } from '../../src/lib/analysis/features';
import { openingName } from '../../src/lib/analysis/book';

interface Ev { cp?: number; mate?: number; pv: string }
interface G { coach: string; idx: number; color: 'w' | 'b'; h: Record<string, string | number>; sans: string[]; evals: ({ a: Ev; b?: Ev } | null)[] }

const [out, ...ins] = process.argv.slice(2);
const games: G[] = [];
for (const f of ins) for (const line of readFileSync(f, 'utf8').split('\n')) if (line.trim()) games.push(JSON.parse(line));

const TREE_PLIES = 24;
const cpW = (e: Ev | undefined) => !e ? 0 : e.mate !== undefined ? (e.mate > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, e.cp ?? 0));

interface Acc {
  games: number; moves: number; loss: number; best: number; captures: number; checks: number;
  sacrifices: number; soundSacrifices: number; kingPressure: number; queenTrades: number; plies: number;
  w: number; d: number; l: number; dates: string[]; openings: Map<string, number>;
  tree: Map<string, Map<string, number>>;
}
const acc = new Map<string, Acc>();
const get = (c: string) => {
  if (!acc.has(c)) acc.set(c, { games: 0, moves: 0, loss: 0, best: 0, captures: 0, checks: 0, sacrifices: 0, soundSacrifices: 0, kingPressure: 0, queenTrades: 0, plies: 0, w: 0, d: 0, l: 0, dates: [], openings: new Map(), tree: new Map() });
  return acc.get(c)!;
};

for (const g of games) {
  const a = get(g.coach);
  a.games++;
  a.plies += g.sans.length;
  const res = String(g.h.Result);
  if (res === '1/2-1/2') a.d++;
  else if ((res === '1-0') === (g.color === 'w')) a.w++;
  else if (res === '1-0' || res === '0-1') a.l++;
  if (g.h.Date) a.dates.push(String(g.h.Date));
  const op = openingName(g.sans);
  if (op) a.openings.set(op.name, (a.openings.get(op.name) ?? 0) + 1);

  const c = new Chess();
  let queensTraded = false;
  for (let i = 0; i < g.sans.length; i++) {
    const coachToMove = (i % 2 === 0) === (g.color === 'w');
    const fen = c.fen();
    let mv;
    try { mv = c.move(g.sans[i]); } catch { break; }
    if (!coachToMove) continue;
    if (i < TREE_PLIES) {
      const key = new Chess(fen).hash();
      if (!a.tree.has(key)) a.tree.set(key, new Map());
      const m = a.tree.get(key)!;
      m.set(mv.san, (m.get(mv.san) ?? 0) + 1);
    }
    const before = g.evals[i], after = g.evals[i + 1];
    if (!before || !after || i < 16) continue; // style numbers skip the first 8 moves (mostly preparation)
    const sign = g.color === 'w' ? 1 : -1;
    const loss = Math.max(0, cpW(before.a) * sign - cpW(after.a) * sign);
    a.moves++;
    a.loss += loss;
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    if (before.a.pv.split(' ')[0] === uci) a.best++;
    if (mv.captured) a.captures++;
    if (mv.san.includes('+')) a.checks++;
    const f = moveFeatures(fen, mv, after.a.pv ? after.a.pv.split(' ') : []);
    a.kingPressure += Math.max(0, f.kingPressureDelta);
    if (f.sacrifice >= 2) { a.sacrifices++; if (loss <= 50 && cpW(after.a) * sign > -150) a.soundSacrifices++; }
    if (!queensTraded && !new Chess(c.fen()).board().flat().some((p) => p?.type === 'q')) {
      if (new Chess(fen).board().flat().some((p) => p?.type === 'q')) { queensTraded = true; a.queenTrades++; }
    }
    void balance;
  }
}

const per = (x: number, n: number) => (n ? x / n : 0);
const coaches = [...acc.entries()].map(([id, a]) => {
  const stats = {
    games: a.games,
    analysedMoves: a.moves,
    from: a.dates.sort()[0]?.slice(0, 7).replace(/\.\?\?$/, '') ?? null,
    to: a.dates.sort().at(-1)?.slice(0, 7).replace(/\.\?\?$/, '') ?? null,
    score: { win: a.w, draw: a.d, loss: a.l },
    acpl: +per(a.loss, a.moves).toFixed(1),
    bestMoveRate: +per(a.best, a.moves).toFixed(3),
    captureRate: +per(a.captures, a.moves).toFixed(3),
    checkRate: +per(a.checks, a.moves).toFixed(3),
    sacrificePer100: +(per(a.sacrifices, a.moves) * 100).toFixed(2),
    soundSacrificePer100: +(per(a.soundSacrifices, a.moves) * 100).toFixed(2),
    kingPressure: +per(a.kingPressure, a.moves).toFixed(3),
    queenTradeRate: +per(a.queenTrades, a.games).toFixed(3),
    avgMoves: +(per(a.plies, a.games) / 2).toFixed(1),
    topOpenings: [...a.openings.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([name, n]) => ({ name, n })),
  };
  const tree: Record<string, [string, number][]> = {};
  for (const [k, m] of a.tree) tree[k] = [...m.entries()].sort((x, y) => y[1] - x[1]);
  return { id, stats, tree };
});

// style factors relative to the mean of all coaches
const mean = (k: 'soundSacrificePer100' | 'kingPressure' | 'checkRate' | 'captureRate' | 'queenTradeRate') =>
  coaches.reduce((s, c) => s + c.stats[k], 0) / coaches.length;
const ratio = (v: number, m: number) => +Math.max(0.6, Math.min(1.6, m > 0 ? Math.sqrt(v / m) : 1)).toFixed(2);
const m = { sac: mean('soundSacrificePer100'), kp: mean('kingPressure'), ch: mean('checkRate'), cap: mean('captureRate'), qt: mean('queenTradeRate') };
const source = 'kinairi/chess-data (GPL-3.0) data/players/*.pgn; classical games only; analysed with Stockfish 19 lite, depth 10, MultiPV 2';
const result = {
  source: 'kinairi/chess-data (GPL-3.0) data/players/*.pgn; classical games only; analysed with Stockfish 19 lite, depth 10, MultiPV 2',
  treePlies: TREE_PLIES,
  coaches: Object.fromEntries(coaches.map((c) => [c.id, {
    stats: c.stats,
    styleFactor: {
      sacrifice: ratio(c.stats.soundSacrificePer100, m.sac),
      kingAttack: ratio(c.stats.kingPressure, m.kp),
      check: ratio(c.stats.checkRate, m.ch),
      capture: ratio(c.stats.captureRate, m.cap),
      simplify: ratio(c.stats.queenTradeRate, m.qt),
    },
    tree: c.tree,
  }])),
};
const stats = { source, coaches: Object.fromEntries(Object.entries(result.coaches).map(([id, c]) => [id, { stats: c.stats, styleFactor: c.styleFactor }])) };
const trees = { source, treePlies: TREE_PLIES, coaches: Object.fromEntries(Object.entries(result.coaches).map(([id, c]) => [id, c.tree])) };
writeFileSync(out + '/coach-stats.json', JSON.stringify(stats, null, 1));
writeFileSync(out + '/coach-trees.json', JSON.stringify(trees));
for (const c of coaches) console.log(c.id, JSON.stringify({ ...c.stats, topOpenings: c.stats.topOpenings.slice(0, 3) }), 'positions', Object.keys(c.tree).length, JSON.stringify(result.coaches[c.id].styleFactor));

// Generates basic-endgame puzzles that the Lichess subset lacks (spec 7.2/7.3): K+Q vs K, K+R vs K and
// K+B+N vs K mates in 1–5, and K+P vs K "only winning move" positions. Every puzzle is verified with
// Stockfish 19 (which has a built-in KPK bitbase): mate puzzles must be a forced mate in exactly N with a
// complete principal variation that really ends in checkmate.
//
// Ratings of generated puzzles are ESTIMATES (nobody has played them yet), so they get a high rating
// deviation (200); Glicko-2 then moves the user's rating less on them.
//
// usage: npx tsx scripts/puzzles/generate-endgames.ts <Q|R|BN|KPK> → scripts/puzzles/generated-<kind>.json (seeded, reproducible)
//        build-puzzles.mjs merges all generated-*.json files
import { writeFileSync } from 'node:fs';
import { Chess, type Square } from 'chess.js';
import { nodeEngine } from '../lib/node-engine';

const engine = nodeEngine();
const KIND = process.argv[2] ?? 'Q';
let seed = 20261122 + ['Q', 'R', 'BN', 'KPK'].indexOf(KIND) * 7919;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const FILES = 'abcdefgh';
const sq = (f: number, r: number) => (FILES[f] + (r + 1)) as Square;
const ALL: Square[] = []; for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) ALL.push(sq(f, r));

interface Gen { id: string; fen: string; moves: string; rating: number; rd: number; themes: string }
const out: Gen[] = [];

function place(pieces: [string, Square][], turn: 'w' | 'b'): Chess | null {
  const c = new Chess();
  c.clear();
  for (const [p, s] of pieces) {
    const color = p === p.toUpperCase() ? 'w' : 'b';
    if (!c.put({ type: p.toLowerCase() as 'k', color }, s)) return null;
  }
  // kings next to each other (or the side not to move in check) is illegal and makes Stockfish misbehave
  const ks = pieces.filter(([p]) => p.toLowerCase() === 'k').map(([, s]) => s);
  if (Math.abs(ks[0].charCodeAt(0) - ks[1].charCodeAt(0)) <= 1 && Math.abs(Number(ks[0][1]) - Number(ks[1][1])) <= 1) return null;
  const fen = c.fen().replace(/ [wb] /, ` ${turn} `);
  const other = new Chess(fen.replace(/ [wb] /, ` ${turn === 'w' ? 'b' : 'w'} `).replace(/ \S+ \d+ \d+$/, ' - 0 1'));
  if (other.inCheck()) return null;
  try { const x = new Chess(fen); if (x.isGameOver()) return null; return x; } catch { return null; }
}

/** defender to move: plays its most stubborn move, then the attacker must mate in exactly n. */
async function tryMate(c: Chess, n: number, want: number[]): Promise<{ moves: string; n: number } | null> {
  const r0 = await engine.search(c.fen(), { depth: 14, movetime: 3000 });
  const setup = r0.lines[0]?.pv[0];
  if (!setup) return null;
  const s = new Chess(c.fen());
  s.move({ from: setup.slice(0, 2), to: setup.slice(2, 4), promotion: setup[4] });
  if (s.isGameOver()) return null;
  const r = await engine.search(s.fen(), { depth: 16, movetime: 4000 });
  const l = r.lines[0];
  if (l?.score.mate === undefined || !want.includes(l.score.mate)) return null;
  const m = l.score.mate;
  const pv = l.pv.slice(0, 2 * m - 1);
  const v = new Chess(s.fen());
  for (const u of pv) { try { v.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { return null; } }
  if (!v.isCheckmate()) return null;
  void n;
  return { moves: [setup, ...pv].join(' '), n: m };
}

async function mates(kind: 'Q' | 'R' | 'BN', perN: number, maxTries: number) {
  const need = new Map([1, 2, 3, 4, 5].map((n) => [n, perN]));
  for (let t = 0; t < maxTries && [...need.values()].some((x) => x > 0); t++) {
    const white = rnd() < 0.5;
    const A = (p: string) => (white ? p : p.toLowerCase());
    const D = (p: string) => (white ? p.toLowerCase() : p);
    const pcs: [string, Square][] = [];
    // defender king near an edge (where mates happen), attacker pieces anywhere
    let dk: Square;
    if (kind === 'BN') {
      const corner = pick([[0, 0], [7, 7], [0, 7], [7, 0]]);
      dk = sq(Math.min(7, Math.max(0, corner[0] + Math.floor(rnd() * 3) * (corner[0] ? -1 : 1))), Math.min(7, Math.max(0, corner[1] + Math.floor(rnd() * 3) * (corner[1] ? -1 : 1))));
    } else {
      const edge = Math.floor(rnd() * 4), k = Math.floor(rnd() * 8), d = Math.floor(rnd() * 2);
      dk = [sq(k, d), sq(k, 7 - d), sq(d, k), sq(7 - d, k)][edge];
    }
    pcs.push([D('K'), dk]);
    const used = new Set([dk]);
    const free = () => { let s: Square; do s = pick(ALL); while (used.has(s)); used.add(s); return s; };
    pcs.push([A('K'), free()]);
    for (const p of kind === 'BN' ? ['B', 'N'] : [kind]) pcs.push([A(p), free()]);
    if (t % 100 === 0) console.log(kind, 'try', t, 'found', out.length);
    const c = place(pcs, white ? 'b' : 'w');
    if (!c || c.inCheck()) continue;
    const want = [...need.entries()].filter(([, v]) => v > 0).map(([k]) => k);
    const res = await tryMate(c, 0, want);
    if (!res) continue;
    need.set(res.n, need.get(res.n)! - 1);
    const base = kind === 'Q' ? 700 : kind === 'R' ? 800 : 1500;
    const step = kind === 'Q' ? 150 : kind === 'R' ? 170 : 150;
    out.push({
      id: `g${kind}${res.n}-${out.length}`, fen: c.fen(), moves: res.moves, rating: base + step * (res.n - 1), rd: 200,
      themes: `endgame mate mateIn${res.n} ${res.n === 1 ? 'oneMove' : res.n <= 2 ? 'short' : 'long'}`,
    });
  }
  console.log(kind, 'missing', Object.fromEntries(need));
}

/** K+P vs K: after the defender's move exactly one attacker move keeps the win. */
async function kpk(count: number, maxTries: number) {
  let made = 0;
  for (let t = 0; t < maxTries && made < count; t++) {
    const white = rnd() < 0.5;
    const pf = Math.floor(rnd() * 8), pr = 2 + Math.floor(rnd() * 4); // pawn on ranks 3–6 (from its side)
    const ps = white ? sq(pf, pr) : sq(pf, 7 - pr);
    const used = new Set<Square>([ps]);
    const free = () => { let s: Square; do s = pick(ALL); while (used.has(s)); used.add(s); return s; };
    const c = place([[white ? 'P' : 'p', ps], [white ? 'K' : 'k', free()], [white ? 'k' : 'K', free()]], white ? 'b' : 'w');
    if (!c || c.inCheck()) continue;
    const r0 = await engine.search(c.fen(), { depth: 16, movetime: 3000 });
    const setup = r0.lines[0]?.pv[0];
    if (!setup) continue;
    const s = new Chess(c.fen()); s.move({ from: setup.slice(0, 2), to: setup.slice(2, 4) });
    if (s.isGameOver()) continue;
    const legal = s.moves().length;
    const r = await engine.search(s.fen(), { depth: 20, movetime: 8000 }, { multipv: legal });
    const win = (l: (typeof r.lines)[number]) => (l.score.mate !== undefined ? l.score.mate > 0 : (l.score.cp ?? 0) >= 500);
    const winning = r.lines.filter(win);
    const drawing = r.lines.filter((l) => l.score.mate === undefined && Math.abs(l.score.cp ?? 0) <= 30);
    if (winning.length !== 1 || drawing.length < 2 || r.lines.length !== legal) continue;
    const pv = winning[0].pv.slice(0, 3);
    if (pv.length < 3) continue;
    out.push({ id: `gKPK-${out.length}`, fen: c.fen(), moves: [setup, ...pv].join(' '), rating: 1350, rd: 200, themes: 'endgame pawnEndgame onlyMove short' });
    made++;
    console.log('KPK found', made, 'at try', t);
  }
  console.log('KPK made', made);
}

await engine.whenReady();
if (KIND === 'Q') await mates('Q', 10, 1500);
if (KIND === 'R') await mates('R', 10, 2500);
if (KIND === 'BN') await mates('BN', 6, 3000);
if (KIND === 'KPK') await kpk(30, 1500);
writeFileSync(new URL(`./generated-${KIND}.json`, import.meta.url), JSON.stringify(out, null, 0));
console.log('total', out.length);
engine.terminate();
process.exit(0);

// Builds the Openings Academy data: public/data/academy/<opening>.json + index.json
//
// 1. Theory lines: curated main/extra lines (src/lib/academy/defs.ts) + every Lichess named line
//    (lichess-org/chess-openings, CC0) of the opening's families that starts with its root moves.
//    Every move is checked for legality with chess.js.
// 2. Stockfish 19 (depth 12, MultiPV 5) evaluates every position where the learner is to move.
//    The theory move gets: the engine's best move, and the centipawn loss vs. the best move.
//    Lines in which a learner move loses more than 120 cp are left out (a theory name does not make
//    a bad move worth teaching); losses are shown to the learner as engine tags (spec 8.7).
//    Results are cached in scripts/academy/engine-cache.jsonl (resumable).
// 3. Lines are split into stages (src/lib/academy/stages.ts).
//
// usage: npx tsx scripts/academy/build-academy.ts [--eval-only worker workers]
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { Chess } from 'chess.js';
import { OPENINGS } from '../../src/lib/academy/defs';
import { buildStages, isLearnerPly, type Line } from '../../src/lib/academy/stages';
import { openingName } from '../../src/lib/analysis/book';
import { nodeEngine } from '../lib/node-engine';

const here = new URL('.', import.meta.url).pathname;
const root = here + '../../';
const CACHE = here + 'engine-cache.jsonl';
const MAX_LOSS = 120;
const fenKey = (f: string) => f.split(' ').slice(0, 4).join(' ');

// ---- 1. lines ----
const tsv: { eco: string; name: string; sans: string[] }[] = [];
for (const f of readdirSync(root + 'scripts/openings').filter((x) => x.endsWith('.tsv')).sort()) {
  for (const l of readFileSync(root + 'scripts/openings/' + f, 'utf8').trim().split('\n').slice(1)) {
    const [eco, name, pgn] = l.split('\t');
    tsv.push({ eco, name, sans: pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/) });
  }
}
function legal(sans: string[]) {
  const c = new Chess();
  try { for (const s of sans) c.move(s); return true; } catch { return false; }
}
const linesOf = new Map<string, Line[]>();
let illegal = 0;
for (const o of OPENINGS) {
  const rootMoves = o.root ? o.root.split(' ') : [];
  const named = (sans: string[]) => openingName(sans)?.name ?? o.name.en;
  const lines: Line[] = [];
  const seen = new Set<string>();
  const add = (l: Line) => {
    const k = l.sans.join(' ');
    if (seen.has(k)) return;
    if (!legal(l.sans)) { illegal++; console.log('ILLEGAL', o.id, l.name, k); return; }
    seen.add(k); lines.push(l);
  };
  add({ name: named(o.main.split(' ')), eco: openingName(o.main.split(' '))?.eco ?? '', sans: o.main.split(' '), source: 'main' });
  for (const x of o.extra ?? []) add({ name: named(x.split(' ')), eco: openingName(x.split(' '))?.eco ?? '', sans: x.split(' '), source: 'extra' });
  const fromTsv = tsv
    .filter((t) => o.families.some((f) => t.name === f || t.name.startsWith(f + ':') || t.name.startsWith(f + ',')))
    .filter((t) => rootMoves.every((m, i) => t.sans[i] === m))
    .sort((a, b) => (a.eco < b.eco ? -1 : a.eco > b.eco ? 1 : a.sans.length - b.sans.length));
  for (const t of fromTsv) add({ name: t.name, eco: t.eco, sans: t.sans, source: 'lichess' });
  linesOf.set(o.id, lines);
}

// learner positions
const todo = new Map<string, string>(); // fenKey → fen
for (const o of OPENINGS) for (const l of linesOf.get(o.id)!) {
  const c = new Chess();
  l.sans.forEach((s, i) => { if (isLearnerPly(i, o.side)) todo.set(fenKey(c.fen()), c.fen()); c.move(s); });
}

// ---- 2. engine ----
interface Ev { k: string; lines: { uci: string; cp: number }[] }
const cache = new Map<string, Ev>();
if (existsSync(CACHE)) for (const l of readFileSync(CACHE, 'utf8').split('\n')) if (l) { const e = JSON.parse(l) as Ev; cache.set(e.k, e); }
const cpOf = (s: { cp?: number; mate?: number }) => (s.mate !== undefined ? (s.mate > 0 ? 10000 - s.mate : -10000 - s.mate) : s.cp ?? 0);

const args = process.argv.slice(2);
if (args[0] === '--eval-only') {
  const [wi, wn] = [Number(args[1]), Number(args[2])];
  const engine = nodeEngine();
  await engine.whenReady();
  const keys = [...todo.keys()].filter((k, i) => i % wn === wi && !cache.has(k));
  console.log('positions', todo.size, 'cached', cache.size, 'this worker', keys.length);
  let n = 0;
  for (const k of keys) {
    const fen = todo.get(k)!;
    const r = await engine.search(fen, { depth: 12 }, { multipv: Math.min(5, new Chess(fen).moves().length) });
    const ev: Ev = { k, lines: r.lines.map((l) => ({ uci: l.pv[0], cp: cpOf(l.score) })) };
    appendFileSync(`${CACHE}.${wi}`, JSON.stringify(ev) + '\n');
    if (++n % 200 === 0) console.log(wi, n);
  }
  engine.terminate();
  process.exit(0);
}
// merge worker caches
for (const f of readdirSync(here).filter((x) => /^engine-cache\.jsonl\.\d+$/.test(x))) {
  for (const l of readFileSync(here + f, 'utf8').split('\n')) if (l) { const e = JSON.parse(l) as Ev; if (!cache.has(e.k)) { cache.set(e.k, e); appendFileSync(CACHE, l + '\n'); } }
}

// moves not in the top 5 need their own evaluation
const engine = nodeEngine();
await engine.whenReady();
async function lossOf(fen: string, san: string): Promise<{ loss: number; best: string; bestCp: number }> {
  const ev = cache.get(fenKey(fen));
  if (!ev) throw new Error('no engine data for ' + fen);
  const c = new Chess(fen);
  const mv = c.move(san);
  const uci = mv.from + mv.to + (mv.promotion ?? '');
  const best = ev.lines[0];
  const bestSan = new Chess(fen).move({ from: best.uci.slice(0, 2), to: best.uci.slice(2, 4), promotion: best.uci[4] }).san;
  const hit = ev.lines.find((l) => l.uci === uci);
  if (hit) return { loss: Math.max(0, best.cp - hit.cp), best: bestSan, bestCp: best.cp };
  const k2 = 'after:' + fenKey(c.fen());
  let after = cache.get(k2);
  if (!after) {
    const r = await engine.search(c.fen(), { depth: 11 });
    after = { k: k2, lines: [{ uci: r.lines[0]?.pv[0] ?? '', cp: c.isGameOver() ? 0 : cpOf(r.lines[0].score) }] };
    cache.set(k2, after); appendFileSync(CACHE, JSON.stringify(after) + '\n');
  }
  return { loss: Math.max(0, best.cp + after.lines[0].cp), best: bestSan, bestCp: best.cp };
}

// ---- 3. assemble ----
mkdirSync(root + 'public/data/academy', { recursive: true });
const index: { id: string; lines: number; stages: number; dropped: number }[] = [];
for (const o of OPENINGS) {
  const kept: (Line & { eng: (null | { loss: number; best: string })[] })[] = [];
  let dropped = 0;
  for (const l of linesOf.get(o.id)!) {
    const c = new Chess();
    const eng: (null | { loss: number; best: string })[] = [];
    let bad = false;
    for (let i = 0; i < l.sans.length; i++) {
      if (isLearnerPly(i, o.side)) {
        const e = await lossOf(c.fen(), l.sans[i]);
        eng.push({ loss: Math.round(e.loss), best: e.best });
        if (e.loss > MAX_LOSS) bad = true;
      } else eng.push(null);
      c.move(l.sans[i]);
    }
    if (bad) { dropped++; if (l.source !== 'lichess') console.log('curated line dropped (weak learner move):', o.id, l.sans.join(' ')); continue; }
    kept.push({ ...l, eng });
  }
  const stages = buildStages(kept, o.side);
  writeFileSync(`${root}public/data/academy/${o.id}.json`, JSON.stringify({ id: o.id, side: o.side, lines: kept, stages }));
  index.push({ id: o.id, lines: kept.length, stages: stages.length, dropped });
  console.log(o.id, 'lines', kept.length, 'stages', stages.length, 'dropped (engine)', dropped);
}
writeFileSync(root + 'public/data/academy/index.json', JSON.stringify({
  source: 'lichess-org/chess-openings (CC0) + curated main lines; checked with Stockfish 19 lite (depth 12, MultiPV 5)', maxLoss: MAX_LOSS, openings: index,
}));
console.log('illegal lines skipped', illegal);
engine.terminate();
process.exit(0);

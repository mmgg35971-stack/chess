// Builds the Openings Academy as a repertoire TREE (spec 8.4–8.7), to about move 18:
//
//  - Learner to move: the move masters played most (kinairi/chess-data, 326k games, GPL-3.0), unless
//    Stockfish 19 finds it more than 50 cp worse than its best move — then the next most played sound
//    move, or the engine's choice. Each move records how often masters chose it, the most played
//    move and the engine's best move.
//  - Opponent to move: the main master replies branch (top reply + others played in ≥8% of games
//    and ≥6 games, max 4). Every reply gets its "idea": the move the opponent would like to play next (Stockfish
//    on the same position with the opponent to move again).
//  - Where master games run out, the line continues with Stockfish's moves for both sides
//    (marked as engine moves), until ply 36.
//  - Stages walk the tree without repeating moves: a branch starts with the opponent's deviation,
//    then 2–6 of the learner's moves and the expected reply.
//
// The curated main line (defs.ts) is always taught first. Engine results are cached in
// scripts/academy/engine-cache.jsonl. usage: npx tsx scripts/academy/build-repertoire.ts
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Chess } from 'chess.js';
import { OPENINGS, type OpeningDef } from '../../src/lib/academy/defs';
import { isLearnerPly, stageUid, type Line, type Stage } from '../../src/lib/academy/stages';
import { openingName } from '../../src/lib/analysis/book';
import { nodeEngine } from '../lib/node-engine';

const here = new URL('.', import.meta.url).pathname;
const root = here + '../../';
const CACHE = here + 'engine-cache.jsonl';
const MAX_PLY = 36, MAX_LOSS = 50, BRANCH_SHARE = 0.06, BRANCH_MIN = 5, MAX_BRANCH = 5, MIN_NODE = 6;
const fenKey = (f: string) => f.split(' ').slice(0, 4).join(' ');

// ---------- master statistics ----------
const master = JSON.parse(gunzipSync(readFileSync(here + 'master-tree.json.gz')).toString()) as { counts: Record<string, number> };
const kids = new Map<string, [string, number][]>();
for (const [k, n] of Object.entries(master.counts)) {
  const i = k.lastIndexOf(' ');
  const parent = i < 0 ? '' : k.slice(0, i), mv = i < 0 ? k : k.slice(i + 1);
  if (!kids.has(parent)) kids.set(parent, []);
  kids.get(parent)!.push([mv, n]);
}
for (const v of kids.values()) v.sort((a, b) => b[1] - a[1]);
const childrenOf = (sans: string[]) => kids.get(sans.join(' ')) ?? [];

// named variations (lichess-org/chess-openings, CC0): the opponent's deviations they contain always
// get their own branch, even when masters rarely chose them (traps and side lines a club player meets)
const named = new Map<string, Set<string>>(); // prefix → opponent moves that start a named line
const tsvLines: { name: string; sans: string[] }[] = [];
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const p = root + `scripts/openings/open_${f}.tsv`;
  if (!existsSync(p)) continue;
  for (const l of readFileSync(p, 'utf8').trim().split('\n').slice(1)) {
    const [, name, pgn] = l.split('\t');
    tsvLines.push({ name, sans: pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/) });
  }
}
function namedFor(o: OpeningDef) {
  const m = new Map<string, Set<string>>();
  const rootMoves = o.root ? o.root.split(' ') : [];
  for (const t of tsvLines) {
    if (!o.families.some((f) => t.name === f || t.name.startsWith(f + ':') || t.name.startsWith(f + ','))) continue;
    if (!rootMoves.every((x, i) => t.sans[i] === x)) continue;
    t.sans.forEach((san, i) => { if (!isLearnerPly(i, o.side)) { const k = t.sans.slice(0, i).join(' '); if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(san); } });
  }
  return m;
}
void named;
const totalAt = (sans: string[]) => childrenOf(sans).reduce((s, [, n]) => s + n, 0);

// ---------- engine cache ----------
interface Ev { k: string; lines: { uci: string; cp: number; pv?: string[] }[] }
const cache = new Map<string, Ev>();
if (existsSync(CACHE)) for (const l of readFileSync(CACHE, 'utf8').split('\n')) if (l) { try { const e = JSON.parse(l) as Ev; cache.set(e.k, e); } catch { /* partial line */ } }
const cpOf = (s: { cp?: number; mate?: number }) => (s.mate !== undefined ? (s.mate > 0 ? 10000 - s.mate : -10000 - s.mate) : s.cp ?? 0);
const engines = [nodeEngine(), nodeEngine()];
await Promise.all(engines.map((e) => e.whenReady()));
/** evaluate many positions on two engines in parallel */
async function evalAll(jobs: { key: string; fen: string; depth: number; multipv: number; pv?: boolean }[]) {
  let next = 0, done = 0;
  const run = async (e: (typeof engines)[number]) => {
    while (next < jobs.length) {
      const j = jobs[next++];
      if (cache.has(j.key) && (!j.pv || cache.get(j.key)!.lines[0]?.pv)) continue;
      const c = new Chess(j.fen);
      const mpv = Math.min(j.multipv, c.moves().length);
      const r = await e.search(j.fen, { depth: j.depth }, { multipv: mpv });
      const ev: Ev = { k: j.key, lines: r.lines.map((l, i) => ({ uci: l.pv[0], cp: cpOf(l.score), ...(i === 0 ? { pv: l.pv.slice(0, 6) } : {}) })) };
      cache.set(j.key, ev);
      appendFileSync(CACHE, JSON.stringify(ev) + '\n');
      if (++done % 250 === 0) console.log('  evaluated', done, '/', jobs.length);
    }
  };
  await Promise.all(engines.map(run));
}
const sanOf = (fen: string, uci: string) => { try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san; } catch { return null; } };
function nullFen(fen: string): string | null {
  const c = new Chess(fen);
  if (c.inCheck()) return null;
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-';
  const f = parts.join(' ');
  try { const x = new Chess(f); return x.inCheck() || x.isGameOver() ? null : f; } catch { return null; }
}

// ---------- tree ----------
interface Meta { g?: number; s?: number; pop?: string; best?: string; loss?: number; idea?: string; alts?: [string, number][]; src: 'm' | 'e' | 'c' }
interface Path { sans: string[]; meta: Meta[]; weight: number }

function learnerChoice(sans: string[], fen: string, need: Set<string>, prefer: string[] = []): { san: string; meta: Meta } | null {
  const ev = cache.get(fenKey(fen));
  const ch = childrenOf(sans), total = totalAt(sans);
  if (!ev) { need.add(fen); return null; }
  const best = ev.lines[0];
  const bestSan = sanOf(fen, best.uci)!;
  const lossOf = (san: string) => {
    const m = new Chess(fen).move(san); const u = m.from + m.to + (m.promotion ?? '');
    const hit = ev.lines.find((l) => l.uci === u);
    return hit ? Math.max(0, best.cp - hit.cp) : 999;
  };
  // the learner's system first (keeps e.g. the London a London)
  if (sans.length < 20) {
    for (const san of prefer) {
      let ok = false;
      try { ok = !!new Chess(fen).move(san); } catch { ok = false; }
      if (!ok || lossOf(san) > 80) continue;
      const n = ch.find(([m]) => m === san)?.[1] ?? 0;
      return { san, meta: { g: total || undefined, s: total ? Math.round((100 * n) / total) : undefined, pop: ch[0] && ch[0][0] !== san ? ch[0][0] : undefined, best: bestSan, loss: lossOf(san), src: total >= MIN_NODE && n ? 'm' : 'e' } };
    }
  }
  if (total >= MIN_NODE) {
    for (const [san, n] of ch.slice(0, 3)) {
      const loss = lossOf(san);
      if (loss <= MAX_LOSS) return { san, meta: { g: total, s: Math.round((100 * n) / total), pop: ch[0][0] !== san ? ch[0][0] : undefined, best: bestSan, loss, src: 'm' } };
    }
  }
  return { san: bestSan, meta: { g: total || undefined, best: bestSan, loss: 0, src: 'e' } };
}

/** opponent's move where master games ran out: Stockfish's best reply */
function engineReply(fen: string, need: Set<string>): string | null {
  const ev = cache.get(fenKey(fen));
  if (!ev) { need.add(fen); return null; }
  return sanOf(fen, ev.lines[0].uci);
}

function expand(o: OpeningDef, need: Set<string>): Path[] {
  const out: Path[] = [];
  const namedMoves = namedFor(o);
  const rootSans = o.root ? o.root.split(' ') : [];
  const walk = (sans: string[], meta: Meta[], weight: number) => {
    const c = new Chess(); for (const s of sans) c.move(s);
    if (sans.length >= MAX_PLY || c.isGameOver()) { out.push({ sans, meta, weight }); return; }
    const fen = c.fen();
    if (isLearnerPly(sans.length, o.side)) {
      const ch = learnerChoice(sans, fen, need, o.prefer);
      if (!ch) { out.push({ sans, meta, weight }); return; }
      walk([...sans, ch.san], [...meta, ch.meta], weight);
      return;
    }
    const replies = childrenOf(sans), total = totalAt(sans);
    const extraNamed = [...(namedMoves.get(sans.join(' ')) ?? [])].filter((m) => !replies.slice(0, MAX_BRANCH).some(([x, n]) => x === m && n >= BRANCH_MIN));
    if (total >= MIN_NODE || extraNamed.length) {
      const pick = total >= MIN_NODE ? replies.filter(([, n], i) => i === 0 || (i < MAX_BRANCH && n >= BRANCH_MIN && n >= BRANCH_SHARE * total)) : [];
      const all: [string, number, boolean][] = [...pick.map(([m, n]) => [m, n, false] as [string, number, boolean]), ...extraNamed.filter((m) => !pick.some(([x]) => x === m)).map((m) => [m, replies.find(([x]) => x === m)?.[1] ?? 0, true] as [string, number, boolean])];
      for (const [san, n, isNamed] of all) {
        let ok = true; try { new Chess(fen).move(san); } catch { ok = false; }
        if (!ok) continue;
        walk([...sans, san], [...meta, { g: total || undefined, s: total ? Math.round((100 * n) / total) : undefined, alts: all.filter(([x]) => x !== san).slice(0, 4).map(([x, k]) => [x, total ? Math.round((100 * k) / total) : 0]), src: n ? 'm' : 'e' }], isNamed ? Math.min(weight, Math.max(n, 6)) : Math.min(weight, n));
      }
      return;
    }
    const r = engineReply(fen, need);
    if (!r) { out.push({ sans, meta, weight }); return; }
    walk([...sans, r], [...meta, { src: 'e' }], weight);
  };
  // forced root moves (both sides), then the tree
  const c = new Chess(); const meta: Meta[] = [];
  for (const s of rootSans) { const g = totalAt(meta.length ? rootSans.slice(0, meta.length) : []); meta.push({ g: g || undefined, src: 'c' }); c.move(s); }
  walk(rootSans, meta, Infinity);
  return out;
}

/** the curated main line first, continued by the tree from its end */
function mainPath(o: OpeningDef, need: Set<string>): Path {
  const sans = o.main.split(' ');
  const meta: Meta[] = sans.map((_, i) => { const t = totalAt(sans.slice(0, i)); const n = childrenOf(sans.slice(0, i)).find(([m]) => m === sans[i])?.[1] ?? 0; return { g: t || undefined, s: t ? Math.round((100 * n) / t) : undefined, src: 'c' as const }; });
  // continue along the learner's choices / main replies to MAX_PLY
  let cur = [...sans]; let m = [...meta];
  for (;;) {
    const c = new Chess(); for (const s of cur) c.move(s);
    if (cur.length >= MAX_PLY || c.isGameOver()) break;
    if (isLearnerPly(cur.length, o.side)) {
      const ch = learnerChoice(cur, c.fen(), need, o.prefer); if (!ch) break;
      cur = [...cur, ch.san]; m = [...m, ch.meta];
    } else {
      const r = childrenOf(cur), total = totalAt(cur);
      const san = total >= MIN_NODE ? r[0][0] : engineReply(c.fen(), need); if (!san) break;
      cur = [...cur, san]; m = [...m, total >= MIN_NODE ? { g: total, s: Math.round((100 * r[0][1]) / total), src: 'm' } : { src: 'e' }];
    }
  }
  return { sans: cur, meta: m, weight: Infinity };
}

const budgetOf = (o: OpeningDef) => {
  const rootSans = o.root ? o.root.split(' ') : o.main.split(' ').slice(0, 2);
  const g = master.counts[rootSans.join(' ')] ?? 0;
  return Math.max(80, Math.min(300, Math.round(g / 40)));
};

mkdirSync(root + 'public/data/academy', { recursive: true });
const index: { id: string; lines: number; stages: number; depth: number }[] = [];
for (const o of OPENINGS) {
  let paths: Path[] = [];
  for (let iter = 0; iter < 45; iter++) {
    const need = new Set<string>();
    const main = mainPath(o, need);
    const tree = expand(o, need).sort((a, b) => b.weight - a.weight);
    // keep the most played branches within the budget
    paths = [main, ...tree.filter((p) => p.sans.join(' ') !== main.sans.join(' '))].slice(0, budgetOf(o));
    // ideas of opponent moves and engine data for the learner positions on kept paths
    const jobs: { key: string; fen: string; depth: number; multipv: number }[] = [];
    for (const f of need) jobs.push({ key: fenKey(f), fen: f, depth: new Chess(f).moveNumber() > 10 ? 10 : 12, multipv: new Chess(f).turn() === o.side ? 5 : 1 });
    for (const p of paths) {
      const c = new Chess();
      p.sans.forEach((s, i) => {
        c.move(s);
        if (!isLearnerPly(i, o.side)) { const nf = nullFen(c.fen()); if (nf && !cache.has('null:' + fenKey(nf))) jobs.push({ key: 'null:' + fenKey(nf), fen: nf, depth: 9, multipv: 1 }); }
      });
    }
    // keep the learner-move jobs of paths that were cut off in the tree too (they extend next time)
    if (!jobs.length) break;
    console.log(o.id, 'iteration', iter, 'jobs', jobs.length);
    await evalAll(jobs);
  }
  // attach ideas, names, engine notes
  const lines: (Line & { eng: (null | { loss: number; best: string })[]; meta: Meta[] })[] = paths.map((p, k) => {
    const c = new Chess();
    const meta = p.meta.map((m, i) => {
      const fenBefore = c.fen();
      c.move(p.sans[i]);
      if (!isLearnerPly(i, o.side)) {
        const nf = nullFen(c.fen());
        const ev = nf ? cache.get('null:' + fenKey(nf)) : undefined;
        const idea = ev && nf ? sanOf(nf, ev.lines[0].uci) ?? undefined : undefined;
        return { ...m, idea };
      }
      if (m.best === undefined) {
        const ev = cache.get(fenKey(fenBefore));
        if (ev) {
          const best = ev.lines[0]; const bestSan = sanOf(fenBefore, best.uci)!;
          const mv = new Chess(fenBefore).move(p.sans[i]); const hit = ev.lines.find((l) => l.uci === mv.from + mv.to + (mv.promotion ?? ''));
          return { ...m, best: bestSan, loss: hit ? Math.max(0, best.cp - hit.cp) : undefined };
        }
      }
      return m;
    });
    // name: deepest Lichess name of this opening's families along the path
    let name = o.name.en;
    for (let i = 1; i <= p.sans.length; i++) {
      const n = openingName(p.sans.slice(0, i));
      if (n && o.families.some((f) => n.name === f || n.name.startsWith(f + ':') || n.name.startsWith(f + ','))) name = n.name;
    }
    const eng = meta.map((m, i) => (isLearnerPly(i, o.side) ? { loss: Math.round(m.loss ?? 0), best: m.best ?? p.sans[i] } : null));
    return { name, eco: openingName(p.sans)?.eco ?? o.eco, sans: p.sans, source: k === 0 ? 'main' as const : 'masters' as const, games: p.weight === Infinity ? undefined : p.weight, eng, meta };
  });
  // stages: walk the paths in order, never repeating a taught move
  const known = new Set<string>();
  const stages: Stage[] = [];
  lines.forEach((ln, li) => {
    let b = 0;
    while (b < ln.sans.length && known.has(ln.sans.slice(0, b + 1).join(' '))) b++;
    if (b >= ln.sans.length) return;
    const learner = ln.sans.map((_, i) => i).filter((i) => i >= b && isLearnerPly(i, o.side));
    if (!learner.length) return;
    const groups: number[][] = [];
    for (let k = 0; k < learner.length; k += 4) groups.push(learner.slice(k, k + 4));
    if (groups.length > 1 && groups[groups.length - 1].length < 2) groups[groups.length - 2].push(...groups.pop()!);
    groups.forEach((g, gi) => {
      const from = gi === 0 ? b : g[0];
      const to = Math.min(g[g.length - 1] + 1, ln.sans.length - 1);
      stages.push({ line: li, from, to, fresh: g, uid: stageUid(ln.sans, from, to) });
    });
    for (let i = b; i < ln.sans.length; i++) known.add(ln.sans.slice(0, i + 1).join(' '));
  });
  writeFileSync(`${root}public/data/academy/${o.id}.json`, JSON.stringify({ id: o.id, side: o.side, lines, stages }));
  const depth = Math.max(...lines.map((l) => l.sans.length));
  index.push({ id: o.id, lines: lines.length, stages: stages.length, depth });
  console.log(o.id, 'branches', lines.length, 'stages', stages.length, 'max ply', depth);
}
writeFileSync(root + 'public/data/academy/index.json', JSON.stringify({
  source: 'Repertoire trees from master games (kinairi/chess-data, GPL-3.0, 326k games) + lichess-org/chess-openings names (CC0) + Stockfish 19 lite checks and continuations',
  maxLoss: MAX_LOSS, maxPly: MAX_PLY, openings: index,
}));
engines.forEach((e) => e.terminate());
process.exit(0);

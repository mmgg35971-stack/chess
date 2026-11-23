// Builds the coach's knowledge network from scripts/ai/kb/*.md:
//   refs-*.md     — the reference index (books, their key ideas, written in our own words)
//   concepts-*.md — concepts linked to references and to each other, with example positions
// Every example position is checked with chess.js; with --verify, every claim (win/draw/best move/mate)
// is checked with Stockfish 19. Output: public/data/books/knowledge.pz (gzip JSON).
// usage: npx tsx scripts/ai/build-knowledge.ts [--verify]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Chess } from 'chess.js';
import { THEMES } from '../../src/lib/puzzles/explain';
import { INDEXED_CATEGORIES } from '../../src/lib/puzzles/categories';

export interface KRef { id: string; author: string; title: string; year: number; areas: string[]; coaches: string[]; ideas: string[] }
export interface KExample { fen?: string; moves?: string; claim?: string; note: string }
export interface KConcept {
  id: string; area: string; title: { ar: string; en: string }; refs: string[]; rel: string[]; pz?: string;
  summary: string; ideas: string[]; how: string[]; mistakes: string[]; examples: KExample[];
  /** Arabic text for the offline coach: aka = words users type for this concept */
  ar?: { aka: string[]; summary: string; ideas: string[]; how: string[]; mistakes: string[]; notes: string[] };
}

const DIR = 'scripts/ai/kb';
const files = readdirSync(DIR).filter((f) => f.endsWith('.md')).sort();
const refs: KRef[] = [];
const concepts: KConcept[] = [];
const problems: string[] = [];

for (const f of files.filter((f) => f.startsWith('refs-'))) {
  let cur: KRef | null = null;
  for (const raw of readFileSync(`${DIR}/${f}`, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('@ ')) {
      const [id, author, title, year, areas, coaches] = line.slice(2).split('|').map((s) => s.trim());
      cur = { id, author, title, year: +year, areas: areas.split(',').map((s) => s.trim()).filter(Boolean), coaches: (coaches ?? '').split(',').map((s) => s.trim()).filter(Boolean), ideas: [] };
      if (!id || !author || !title || !(cur.year > 1700)) problems.push(`${f}: bad ref line ${line}`);
      refs.push(cur);
    } else if (line.startsWith('- ') && cur) cur.ideas.push(line.slice(2));
  }
}

for (const f of files.filter((f) => f.startsWith('concepts-'))) {
  let cur: KConcept | null = null;
  for (const raw of readFileSync(`${DIR}/${f}`, 'utf8').split('\n')) {
    const line = raw.trim();
    if (/^# [a-z0-9-]+ \|/.test(line)) {
      const [id, area, ar, en] = line.slice(2).split('|').map((s) => s.trim());
      cur = { id, area, title: { ar, en }, refs: [], rel: [], summary: '', ideas: [], how: [], mistakes: [], examples: [] };
      concepts.push(cur);
      continue;
    }
    if (!cur || !line || line.startsWith('#')) continue;
    const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    if (line.startsWith('refs:')) cur.refs = list(line.slice(5));
    else if (line.startsWith('rel:')) cur.rel = list(line.slice(4));
    else if (line.startsWith('pz:')) cur.pz = line.slice(3).trim();
    else if (line.startsWith('> ')) cur.summary += (cur.summary ? ' ' : '') + line.slice(2);
    else if (line.startsWith('+ ')) cur.ideas.push(line.slice(2));
    else if (line.startsWith('= ')) cur.how.push(line.slice(2));
    else if (line.startsWith('! ')) cur.mistakes.push(line.slice(2));
    else if (line.startsWith('ex:')) {
      const [fen, claim, note] = line.slice(3).split('|').map((s) => s.trim());
      cur.examples.push({ fen, claim: claim || undefined, note: note ?? '' });
    } else if (line.startsWith('line:')) {
      const [moves, note] = line.slice(5).split('|').map((s) => s.trim());
      cur.examples.push({ moves, note: note ?? '' });
    } else problems.push(`${f}: ${cur.id}: unknown line "${line.slice(0, 60)}"`);
  }
}

// ---- Arabic texts (ar-*.md) ----
for (const f of files.filter((f) => f.startsWith('ar-'))) {
  let cur: NonNullable<KConcept['ar']> | null = null;
  for (const raw of readFileSync(`${DIR}/${f}`, 'utf8').split('\n')) {
    const line = raw.trim();
    const m = /^# ([a-z0-9-]+)$/.exec(line);
    if (m) {
      const c = concepts.find((x) => x.id === m[1]);
      if (!c) { problems.push(`${f}: unknown concept ${m[1]}`); cur = null; continue; }
      if (c.ar) problems.push(`${f}: Arabic text for ${m[1]} given twice`);
      c.ar = cur = { aka: [], summary: '', ideas: [], how: [], mistakes: [], notes: [] };
      continue;
    }
    if (!cur || !line || line.startsWith('#')) continue;
    if (line.startsWith('aka:')) cur.aka = line.slice(4).split(',').map((x) => x.trim()).filter(Boolean);
    else if (line.startsWith('> ')) cur.summary += (cur.summary ? ' ' : '') + line.slice(2);
    else if (line.startsWith('+ ')) cur.ideas.push(line.slice(2));
    else if (line.startsWith('= ')) cur.how.push(line.slice(2));
    else if (line.startsWith('! ')) cur.mistakes.push(line.slice(2));
    else if (line.startsWith('ex:')) cur.notes.push(line.slice(3).trim());
    else problems.push(`${f}: unknown line "${line.slice(0, 60)}"`);
  }
}
for (const c of concepts) {
  if (!c.ar) { problems.push(`${c.id}: no Arabic text`); continue; }
  if (!c.ar.summary || !c.ar.aka.length) problems.push(`${c.id}: Arabic summary/aka missing`);
  if (c.ar.notes.length !== c.examples.length) problems.push(`${c.id}: ${c.examples.length} examples but ${c.ar.notes.length} Arabic notes`);
}
{
  const seen = new Map<string, string>();
  for (const c of concepts) for (const a of c.ar?.aka ?? []) {
    if (seen.has(a) && seen.get(a) !== c.id) problems.push(`alias "${a}" used by ${seen.get(a)} and ${c.id}`);
    seen.set(a, c.id);
  }
}

// ---- integrity ----
const refIds = new Set(refs.map((r) => r.id));
const conIds = new Set(concepts.map((c) => c.id));
const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
for (const d of dup(refs.map((r) => r.id))) problems.push(`duplicate ref ${d}`);
for (const d of dup(concepts.map((c) => c.id))) problems.push(`duplicate concept ${d}`);
for (const c of concepts) {
  if (!c.summary) problems.push(`${c.id}: no summary`);
  if (!c.refs.length) problems.push(`${c.id}: no refs`);
  for (const r of c.refs) if (!refIds.has(r)) problems.push(`${c.id}: unknown ref ${r}`);
  for (const r of c.rel) if (!conIds.has(r)) problems.push(`${c.id}: unknown related concept ${r}`);
  if (c.pz && !(c.pz in THEMES) && c.pz !== 'opening' && !INDEXED_CATEGORIES.some((x) => x.id === c.pz)) problems.push(`${c.id}: unknown puzzle theme ${c.pz}`);
  for (const ex of c.examples) {
    if (ex.fen) {
      try { new Chess(ex.fen); } catch (e) { problems.push(`${c.id}: illegal FEN ${ex.fen}: ${(e as Error).message}`); }
    } else if (ex.moves) {
      const g = new Chess();
      for (const m of ex.moves.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t)).map((t) => t.replace(/^\d+\.+/, ''))) {
        try { g.move(m); } catch { problems.push(`${c.id}: illegal move ${m} in line "${ex.moves}"`); break; }
      }
      ex.fen = g.fen(); // final position of the line, used as the example board
    }
  }
}

// ---- engine check of the claims ----
if (process.argv.includes('--verify')) {
  const { nodeEngine } = await import('../lib/node-engine');
  const e = nodeEngine(); await e.whenReady();
  const white = (s: { cp?: number; mate?: number }, stm: 'w' | 'b') => {
    const v = s.mate !== undefined ? (s.mate > 0 ? 10000 : -10000) : s.cp ?? 0;
    return stm === 'w' ? v : -v;
  };
  for (const c of concepts) for (const ex of c.examples) {
    if (!ex.claim || !ex.fen) continue;
    const g = new Chess(ex.fen);
    const r = await e.search(ex.fen, { depth: 22, movetime: 8000 } as never, { multipv: 3 });
    const top = r.lines[0];
    const v = white(top.score, g.turn());
    const san = (u: string) => { try { return new Chess(ex.fen!).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san; } catch { return u; } };
    let ok = true; let why = '';
    const [kind, arg] = ex.claim.split(/\s+/);
    if (kind === 'win') ok = arg === 'w' ? v >= 250 : v <= -250;
    else if (kind === 'draw') ok = Math.abs(v) <= 120;
    else if (kind === 'eq') ok = Math.abs(v) <= 100;
    else if (kind === 'mate') ok = top.score.mate !== undefined && top.score.mate > 0;
    else if (kind === 'best') {
      const want = arg.replace(/[+#]/g, '');
      const bestV = white(top.score, g.turn());
      const hit = r.lines.find((l) => san(l.pv[0]).replace(/[+#]/g, '') === want);
      ok = !!hit && Math.abs(white(hit.score, g.turn()) - bestV) <= 40;
    } else { ok = false; why = 'unknown claim'; }
    const line = top.pv.slice(0, 6).map((u, i) => (i === 0 ? san(u) : u)).join(' ');
    if (!ok) problems.push(`${c.id}: claim "${ex.claim}" failed (engine ${v} ${line}) ${why} — ${ex.fen}`);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.id} ${ex.claim} (${v}) ${line}`);
  }
  e.terminate();
}

const out = { v: 1, refs, concepts };
mkdirSync('public/data/books', { recursive: true });
writeFileSync('public/data/books/knowledge.pz', gzipSync(Buffer.from(JSON.stringify(out)), { level: 9 }));
const exCount = concepts.reduce((a, c) => a + c.examples.length, 0);
console.log(`${refs.length} references, ${concepts.length} concepts, ${exCount} examples, ${concepts.reduce((a, c) => a + c.refs.length, 0)} concept→reference links`);
const unused = refs.filter((r) => !concepts.some((c) => c.refs.includes(r.id)));
console.log(`${unused.length} references not linked from any concept${unused.length ? ': ' + unused.map((r) => r.id).join(', ') : ''}`);
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }

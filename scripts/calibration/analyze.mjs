// Analyse Lichess sample games with the app's Stockfish build (depth 12, MultiPV 2).
// usage: node analyze.mjs <pgn> <workerIndex> <workerCount> <out.jsonl>
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { Chess } = require('chess.js');
const [file, wi, wn, out] = process.argv.slice(2);
const DEPTH = 12;

const p = spawn(process.execPath, [new URL('../../node_modules/stockfish/bin/stockfish-19-lite-single.js', import.meta.url).pathname], { stdio: 'pipe' });
let buf = '', waiters = [], infos = new Map();
p.stdout.on('data', (d) => {
  buf += d; const ls = buf.split('\n'); buf = ls.pop();
  for (const l of ls) {
    if (l.startsWith('info ') && l.includes(' pv ') && !l.includes('bound')) {
      const t = l.split(' '); const mp = +t[t.indexOf('multipv') + 1] || 1;
      const si = t.indexOf('score'); const kind = t[si + 1], v = +t[si + 2];
      infos.set(mp, { [kind]: v, pv: t[t.indexOf('pv') + 1] });
    }
    const i = waiters.findIndex((w) => w.m(l)); if (i >= 0) waiters.splice(i, 1)[0].r(l);
  }
});
const send = (c) => p.stdin.write(c + '\n');
const wait = (m) => new Promise((r) => waiters.push({ m, r }));
send('uci'); await wait((l) => l === 'uciok');
send('setoption name MultiPV value 2'); send('isready'); await wait((l) => l === 'readyok');

const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).idx) : []);
const games = readFileSync(file, 'utf8').replace(/\r/g, '').split(/\n(?=\[Event )/);
let n = 0;
for (let idx = 0; idx < games.length; idx++) {
  if (idx % +wn !== +wi || done.has(idx)) continue;
  const raw = games[idx];
  const h = Object.fromEntries([...raw.matchAll(/^\[(\w+) "([^"]*)"\]/gm)].map((m) => [m[1], m[2]]));
  if (/Bullet|UltraBullet|Correspondence/.test(h.Event)) continue;
  const c = new Chess();
  try { c.loadPgn(raw.replace(/\{[^}]*\}/g, '')); } catch { continue; }
  const moves = c.history({ verbose: true });
  if (moves.length < 20) continue;
  const fens = [moves[0].before, ...moves.map((m) => m.after)].slice(0, 161);
  const evals = [];
  send('ucinewgame');
  for (const f of fens) {
    const pos = new Chess(f);
    if (pos.isGameOver()) { evals.push(null); continue; }
    infos = new Map();
    send('position fen ' + f); send('go depth ' + DEPTH);
    await wait((l) => l.startsWith('bestmove'));
    const turn = f.split(' ')[1] === 'w' ? 1 : -1; // store White POV
    const pov = (s) => s && ({ cp: s.cp !== undefined ? s.cp * turn : undefined, mate: s.mate !== undefined ? s.mate * turn : undefined, pv: s.pv });
    evals.push({ a: pov(infos.get(1)), b: pov(infos.get(2)) });
  }
  appendFileSync(out, JSON.stringify({ idx, h: { WhiteElo: +h.WhiteElo, BlackElo: +h.BlackElo, Result: h.Result, Event: h.Event, TimeControl: h.TimeControl }, sans: moves.map((m) => m.san), evals }) + '\n');
  if (++n % 10 === 0) console.log(new Date().toISOString(), 'worker', wi, 'games', n);
}
console.log('worker', wi, 'finished', n);
p.kill();

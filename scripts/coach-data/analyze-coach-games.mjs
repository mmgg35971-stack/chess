// Analyses the coaches' real games with Stockfish 19 (depth 10, MultiPV 2), one JSON line per game.
// Input: <gamesDir>/<coach>.pgn — the last 150 classical games per coach, extracted from
//        kinairi/chess-data (GPL-3.0) data/players/*.pgn (git clone https://github.com/kinairi/chess-data).
// usage: node scripts/coach-data/analyze-coach-games.mjs <worker> <workers> <out.jsonl> <gamesDir>
//        (run several workers in parallel; it resumes if out.jsonl already has games)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { Chess } = require('chess.js');
const [wi, wn, out, gamesDir = 'coach_games'] = process.argv.slice(2);
const DEPTH = 10;
const NAMES = { carlsen: /^Carlsen/i, nakamura: /^Nakamura/i, caruana: /^Caruana/i, firouzja: /^Firouzja/i, tal: /^Tal,/i, fischer: /^Fischer,/i, kasparov: /^Kasparov,/i };
const p = spawn(process.execPath, [new URL('../../node_modules/stockfish/bin/stockfish-19-lite-single.js', import.meta.url).pathname], { stdio: 'pipe' });
let buf = '', waiters = [], infos = new Map();
p.stdout.on('data', (d) => {
  buf += d; const ls = buf.split('\n'); buf = ls.pop();
  for (const l of ls) {
    if (l.startsWith('info ') && l.includes(' pv ') && !l.includes('bound')) {
      const t = l.split(' '); const mp = +t[t.indexOf('multipv') + 1] || 1;
      const si = t.indexOf('score'); const kind = t[si + 1], v = +t[si + 2];
      infos.set(mp, { [kind]: v, pv: t.slice(t.indexOf('pv') + 1, t.indexOf('pv') + 5).join(' ') });
    }
    const i = waiters.findIndex((w) => w.m(l)); if (i >= 0) waiters.splice(i, 1)[0].r(l);
  }
});
const send = (c) => p.stdin.write(c + '\n');
const wait = (m) => new Promise((r) => waiters.push({ m, r }));
send('uci'); await wait((l) => l === 'uciok');
send('setoption name MultiPV value 2'); send('isready'); await wait((l) => l === 'readyok');
const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const j = JSON.parse(l); return j.coach + ':' + j.idx; }) : []);
let k = 0, n = 0;
for (const coach of Object.keys(NAMES)) {
  const games = readFileSync(`${gamesDir}/${coach}.pgn`, 'utf8').split(/\n\s*\n(?=\[Event )/);
  for (let idx = 0; idx < games.length; idx++) {
    if (k++ % +wn !== +wi || done.has(coach + ':' + idx)) continue;
    const raw = games[idx];
    const h = Object.fromEntries([...raw.matchAll(/^\[(\w+) "([^"]*)"\]/gm)].map((m) => [m[1], m[2]]));
    const color = NAMES[coach].test(h.White) ? 'w' : NAMES[coach].test(h.Black) ? 'b' : null;
    if (!color) continue;
    const c = new Chess();
    try { c.loadPgn(raw.replace(/\{[^}]*\}/g, '').replace(/\$\d+/g, '')); } catch { continue; }
    const moves = c.history({ verbose: true });
    const fens = [moves[0].before, ...moves.map((m) => m.after)].slice(0, 161);
    const evals = [];
    send('ucinewgame');
    for (const f of fens) {
      if (new Chess(f).isGameOver()) { evals.push(null); continue; }
      infos = new Map();
      send('position fen ' + f); send('go depth ' + DEPTH);
      await wait((l) => l.startsWith('bestmove'));
      const turn = f.split(' ')[1] === 'w' ? 1 : -1;
      const pov = (s) => s && ({ cp: s.cp !== undefined ? s.cp * turn : undefined, mate: s.mate !== undefined ? s.mate * turn : undefined, pv: s.pv });
      evals.push({ a: pov(infos.get(1)), b: pov(infos.get(2)) });
    }
    appendFileSync(out, JSON.stringify({ coach, idx, color, h: { White: h.White, Black: h.Black, Result: h.Result, Date: h.Date, Event: h.Event, WhiteElo: +h.WhiteElo || null, BlackElo: +h.BlackElo || null }, sans: moves.map((m) => m.san), evals }) + '\n');
    if (++n % 20 === 0) console.log(new Date().toISOString(), 'worker', wi, n);
  }
}
console.log('worker', wi, 'finished', n);
p.kill();

// Self-play each difficulty level, then measure average centipawn loss (depth-10 re-analysis)
// and compare with real players (Lichess sample): 1000→100, 1250→77, 1550→67, 1850→55, 2200→45.
import { Chess } from 'chess.js';
import { nodeEngine } from '../lib/node-engine';
import { chooseHumanLike, type PlayLevel } from '../../src/lib/coach/style';
import { COACHES } from '../../src/lib/coach/coaches';

const engine = nodeEngine();
const levels: PlayLevel[] = JSON.parse(process.argv[2]);
const GAMES = Number(process.argv[3] ?? 4);
const neutral = { ...COACHES[0], weights: { sacrifice: 4, kingAttack: 6, check: 4, capture: 3, complexity: 0.8, simplify: 6, centralize: 6, develop: 6, passedPawn: 8 } };
// seeded rng for reproducibility
let seed = 12345; const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const cp = (s: { cp?: number; mate?: number }, sign: number) => s.mate !== undefined ? (s.mate * sign > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, (s.cp ?? 0) * sign));
await engine.whenReady();
for (const lv of levels) {
  const acpl: number[] = [];
  for (let g = 0; g < GAMES; g++) {
    const c = new Chess();
    // random but sensible opening: 2 plies from common first moves
    const firsts = ['e4', 'd4', 'c4', 'Nf3']; c.move(firsts[g % 4]); c.move(['e5', 'c5', 'd5', 'Nf6', 'e6'][(g * 3) % 5]);
    await engine.newGame();
    while (!c.isGameOver() && c.history().length < 90) {
      const legal = c.moves().length;
      const mpv = lv.multipv === 0 ? Math.min(legal, 40) : Math.min(lv.multipv, legal);
      const r = await engine.search(c.fen(), { depth: lv.depth }, { multipv: mpv });
      const ch = chooseHumanLike(c.fen(), r.lines, neutral as any, lv, rng);
      if (!ch) break;
      c.move({ from: ch.uci.slice(0, 2), to: ch.uci.slice(2, 4), promotion: ch.uci[4] });
    }
    // re-analyse at depth 10 (same yardstick as the real games)
    const v = c.history({ verbose: true });
    const fens = [v[0].before, ...v.map((m) => m.after)];
    const sc: ({ cp?: number; mate?: number } | null)[] = [];
    for (const f of fens) {
      const p = new Chess(f);
      if (p.isGameOver()) { sc.push(p.isCheckmate() ? { mate: p.turn() === 'w' ? -1 : 1 } : { cp: 0 }); continue; }
      const r = await engine.search(f, { depth: 10 });
      const s = r.lines[0].score; const t = p.turn() === 'w' ? 1 : -1;
      sc.push({ cp: s.cp !== undefined ? s.cp * t : undefined, mate: s.mate !== undefined ? s.mate * t : undefined });
    }
    for (const side of [1, -1]) {
      const losses: number[] = [];
      for (let i = 2; i < v.length; i++) {
        if ((i % 2 === 0 ? 1 : -1) !== side) continue;
        losses.push(Math.max(0, cp(sc[i]!, side) - cp(sc[i + 1]!, side)));
      }
      if (losses.length >= 10) acpl.push(losses.reduce((a, b) => a + b, 0) / losses.length);
    }
  }
  acpl.sort((a, b) => a - b);
  console.log(`level ${lv.level} (target ${lv.targetRating}) depth ${lv.depth} mpv ${lv.multipv} T ${lv.temperature}: median ACPL ${acpl[Math.floor(acpl.length / 2)].toFixed(0)} (n=${acpl.length}, range ${acpl[0].toFixed(0)}-${acpl[acpl.length - 1].toFixed(0)})`);
}
engine.terminate();
process.exit(0);

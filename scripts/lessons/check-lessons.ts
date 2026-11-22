// Verifies every lesson with Stockfish 19 (spec 8.7/9): legal moves, one note per ply, and every
// learner move keeps the lesson's goal (win / draw (engine ≥ −1.5, as engines without tablebases
// misjudge some book draws) / mate / within 40 cp of the best move). Opponent replies may not
// throw away more than 3 pawns compared with their best defence.
// usage: npx tsx scripts/lessons/check-lessons.ts  (exit code 1 on any problem)
import { Chess } from 'chess.js';
import { LESSONS, TOPICS } from '../../src/lib/lessons/lessons';
import { nodeEngine } from '../lib/node-engine';

const e = nodeEngine(); await e.whenReady();
const pov = (s: { cp?: number; mate?: number }) => (s.mate !== undefined ? (s.mate > 0 ? 100000 - s.mate : -100000 - s.mate) : s.cp ?? 0);
let bad = 0;
for (const l of LESSONS) {
  if (!TOPICS.some((t) => t.id === l.topic)) { console.log('UNKNOWN TOPIC', l.id); bad++; }
  const c = new Chess(l.fen);
  for (const m of (l.pre ?? '').split(' ').filter(Boolean)) c.move(m);
  const learner = c.turn();
  const moves = l.moves.split(' ');
  if (l.notes.length !== moves.length) { console.log(l.id, 'notes', l.notes.length, 'moves', moves.length); bad++; }
  const report: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    const fen = c.fen();
    let mv;
    try { mv = c.move(moves[i]); } catch { console.log(l.id, 'ILLEGAL', moves[i]); bad++; break; }
    if (mv.color !== learner) {
      const best = await e.search(fen, { depth: 14 });
      // a lost side may choose among losing moves; only check replies from playable positions
      if (best.lines[0].pv[0] === mv.from + mv.to + (mv.promotion ?? '') || pov(best.lines[0].score) < -400) continue;
      const after = c.isGameOver() ? null : await e.search(c.fen(), { depth: 14 });
      const loss = after ? pov(best.lines[0].score) + pov(after.lines[0].score) : 0;
      if (loss > 300 && Math.abs(pov(best.lines[0].score)) < 90000) { report.push(`  opp ${moves[i]} loses ${loss} (best ${best.lines[0].pv[0]})`); bad++; }
      continue;
    }
    // learner move
    const before = await e.search(fen, { depth: 16 });
    const bestV = pov(before.lines[0].score);
    const v = c.isCheckmate() ? 100000 : c.isGameOver() ? 0 : -pov((await e.search(c.fen(), { depth: 16 })).lines[0].score);
    const ok = l.goal === 'win' ? v >= 200 : l.goal === 'draw' ? v >= -150 : l.goal === 'mate' ? v > 90000 : bestV - v <= 40;
    if (!ok) { report.push(`  LEARNER ${moves[i]}: ${v} (best ${before.lines[0].pv[0]} ${bestV})`); bad++; }
  }
  console.log(l.id, report.length ? '\n' + report.join('\n') : 'ok');
}
e.terminate();
console.log(bad ? `${bad} problem(s)` : 'all lessons verified');
process.exit(bad ? 1 : 0);

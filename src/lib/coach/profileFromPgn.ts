import { Chess } from 'chess.js';
import { splitPgn } from '../chess/pgn';
import { balance } from '../analysis/features';

/**
 * Build a coach profile from real games of one player. Used offline by
 * `scripts/coach-profile-from-pgn.ts` on PGN files you are allowed to use.
 * Output: opening lines actually played (with counts) and simple style
 * statistics. No engine needed; engine-based style stats can be added later.
 */
export interface PgnProfile {
  player: string;
  games: number;
  asWhite: number;
  asBlack: number;
  score: number; // 0..1
  book: { white: { line: string; count: number }[]; black: { line: string; count: number }[] };
  perGame: { checks: number; captures: number; sacrifices: number; plies: number };
  sacrificeGames: number;
}

function sideOf(headers: Record<string, string>, player: string): 'w' | 'b' | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const p = norm(player);
  if (norm(headers.White ?? '').includes(p)) return 'w';
  if (norm(headers.Black ?? '').includes(p)) return 'b';
  return null;
}

export function profileFromPgn(text: string, player: string, bookPlies = 12, minCount = 2): PgnProfile {
  const lines = { w: new Map<string, number>(), b: new Map<string, number>() };
  let games = 0, asWhite = 0, asBlack = 0, points = 0, checks = 0, captures = 0, sacs = 0, plies = 0, sacGames = 0;
  for (const raw of splitPgn(text)) {
    const c = new Chess();
    try { c.loadPgn(raw); } catch { continue; }
    const h = c.getHeaders() as Record<string, string>;
    const side = sideOf(h, player);
    if (!side) continue;
    games++;
    side === 'w' ? asWhite++ : asBlack++;
    const r = h.Result;
    if (r === '1/2-1/2') points += 0.5;
    else if ((r === '1-0' && side === 'w') || (r === '0-1' && side === 'b')) points += 1;
    const hist = c.history({ verbose: true });
    plies += hist.length;
    // every prefix up to bookPlies counts as a book line
    const sans = hist.map((m) => m.san);
    for (let n = 2; n <= Math.min(bookPlies, sans.length); n += 2) {
      const key = sans.slice(0, n).join(' ');
      lines[side].set(key, (lines[side].get(key) ?? 0) + 1);
    }
    // style: own checks/captures, and "sacrifices": own move after which we are
    // down >= 2 more pawns of material two plies later than before it
    const g = new Chess();
    let sacInGame = 0;
    for (let i = 0; i < hist.length; i++) {
      const m = hist[i];
      const mine = m.color === side;
      const before = balance(g, side);
      g.move(m.san);
      if (!mine) continue;
      if (m.san.includes('+')) checks++;
      if (m.captured) captures++;
      if (i + 2 < hist.length) {
        const t = new Chess(g.fen());
        t.move(hist[i + 1].san); t.move(hist[i + 2].san);
        if (balance(t, side) - before <= -2) sacInGame++;
      }
    }
    sacs += sacInGame;
    if (sacInGame) sacGames++;
  }
  const top = (m: Map<string, number>) =>
    [...m.entries()]
      .filter(([, n]) => n >= minCount)
      // keep only maximal lines (drop prefixes of longer kept lines with the same count)
      .filter(([k, n], _, all) => !all.some(([k2, n2]) => k2 !== k && k2.startsWith(k + ' ') && n2 === n))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([line, count]) => ({ line, count }));
  const d = Math.max(games, 1);
  return {
    player, games, asWhite, asBlack, score: games ? points / games : 0,
    book: { white: top(lines.w), black: top(lines.b) },
    perGame: { checks: checks / d, captures: captures / d, sacrifices: sacs / d, plies: plies / d },
    sacrificeGames: sacGames,
  };
}

/** Pure UCI output parsing — no worker or DOM dependencies, unit tested. */

export interface Score {
  /** centipawns from the side-to-move's point of view */
  cp?: number;
  /** mate in N (positive = side to move mates) */
  mate?: number;
}

export interface InfoLine {
  depth: number;
  multipv: number;
  score: Score;
  pv: string[];
  nodes?: number;
  bound?: 'lower' | 'upper';
}

export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const t = line.split(/\s+/);
  const out: InfoLine = { depth: 0, multipv: 1, score: {}, pv: [] };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': out.depth = Number(t[++i]); break;
      case 'multipv': out.multipv = Number(t[++i]); break;
      case 'nodes': out.nodes = Number(t[++i]); break;
      case 'score': {
        const kind = t[++i];
        const v = Number(t[++i]);
        if (kind === 'cp') out.score.cp = v;
        else if (kind === 'mate') out.score.mate = v;
        if (t[i + 1] === 'lowerbound') { out.bound = 'lower'; i++; }
        else if (t[i + 1] === 'upperbound') { out.bound = 'upper'; i++; }
        break;
      }
      case 'pv':
        out.pv = t.slice(i + 1).filter(Boolean);
        i = t.length;
        break;
    }
  }
  return out;
}

export function parseBestMove(line: string): { best: string | null; ponder?: string } | null {
  if (!line.startsWith('bestmove')) return null;
  const t = line.trim().split(/\s+/);
  const best = t[1] && t[1] !== '(none)' ? t[1] : null;
  const pi = t.indexOf('ponder');
  return { best, ponder: pi > 0 ? t[pi + 1] : undefined };
}

/** Convert side-to-move score into White's point of view. */
export function toWhitePov(score: Score, sideToMove: 'w' | 'b'): Score {
  const s = sideToMove === 'w' ? 1 : -1;
  return {
    cp: score.cp !== undefined ? score.cp * s : undefined,
    mate: score.mate !== undefined ? score.mate * s : undefined,
  };
}

/**
 * Expected score (0..1) for White from an engine evaluation. Logistic model
 * with the widely used coefficient; used by the eval bar and, later, move
 * classification.  Mate scores map to 0/1.
 */
export function winProbability(whiteScore: Score): number {
  if (whiteScore.mate !== undefined) return whiteScore.mate > 0 ? 1 : 0;
  const cp = Math.max(-2000, Math.min(2000, whiteScore.cp ?? 0));
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

export function formatScore(whiteScore: Score): string {
  if (whiteScore.mate !== undefined) return (whiteScore.mate > 0 ? '#' : '#-') + Math.abs(whiteScore.mate);
  const v = (whiteScore.cp ?? 0) / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

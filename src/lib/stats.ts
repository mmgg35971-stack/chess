import type { SavedGame, Activity } from './storage/db';

export interface PlayStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  unfinished: number;
  winRate: number | null; // 0..100, null when no decided games
  trainingMs: number;
}

/** Stats come only from the user's real saved games (imported games excluded). */
export function playStats(games: SavedGame[], activity: Activity[]): PlayStats {
  const own = games.filter((g) => !g.imported);
  let wins = 0, losses = 0, draws = 0, unfinished = 0;
  for (const g of own) {
    if (g.result === '1/2-1/2') draws++;
    else if (g.result === '*') unfinished++;
    else if ((g.result === '1-0') === (g.userColor === 'w')) wins++;
    else losses++;
  }
  const played = wins + losses + draws;
  return {
    games: own.length,
    wins,
    losses,
    draws,
    unfinished,
    winRate: played ? Math.round((wins / played) * 1000) / 10 : null,
    trainingMs: activity.reduce((s, a) => s + (a.durationMs || 0), 0),
  };
}

export function userOutcome(g: SavedGame): 'win' | 'loss' | 'draw' | 'none' {
  if (g.result === '1/2-1/2') return 'draw';
  if (g.result === '*') return 'none';
  return (g.result === '1-0') === (g.userColor === 'w') ? 'win' : 'loss';
}

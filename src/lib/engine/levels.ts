import type { SearchLimits } from './engine';

/**
 * Engine difficulty levels for "play vs Stockfish".
 * Strength comes from Stockfish's own `Skill Level` option plus a search
 * limit. These levels are NOT calibrated Elo ratings; the app never shows
 * a rating for them until a calibration study is done (see TASKS.md).
 */
export interface EngineLevel {
  level: number;
  skill: number; // Stockfish "Skill Level" 0..20
  limits: SearchLimits;
}

export const ENGINE_LEVELS: EngineLevel[] = [
  { level: 1, skill: 0, limits: { depth: 1 } },
  { level: 2, skill: 3, limits: { depth: 2 } },
  { level: 3, skill: 6, limits: { depth: 4 } },
  { level: 4, skill: 9, limits: { depth: 6 } },
  { level: 5, skill: 12, limits: { depth: 8, movetime: 400 } },
  { level: 6, skill: 15, limits: { depth: 11, movetime: 700 } },
  { level: 7, skill: 18, limits: { depth: 14, movetime: 1000 } },
  { level: 8, skill: 20, limits: { movetime: 1500 } },
];

export function levelConfig(level: number): EngineLevel {
  return ENGINE_LEVELS[Math.min(Math.max(level, 1), ENGINE_LEVELS.length) - 1];
}

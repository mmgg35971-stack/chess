import Dexie, { type Table } from 'dexie';
import type { ResultCode, EndReason, Color } from '../chess/game';

export interface Profile {
  id: 'me';
  name: string;
  avatar?: string; // data URL chosen by the user
  /** optional self-reported rating (e.g. from Chess.com/Lichess/FIDE), used as the starting point for estimates */
  rating?: number;
  createdAt: number;
}

export type GameMode = 'competitive' | 'training' | 'educational';

export interface SavedGame {
  id?: number;
  pgn: string;
  white: string;
  black: string;
  userColor: Color;
  opponent: { kind: 'engine'; level: number } | { kind: 'coach'; id: string; level: number } | { kind: 'import' };
  mode: GameMode;
  result: ResultCode;
  reason?: EndReason;
  plies: number;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  timeControl?: string;
  imported?: boolean;
}

export interface Activity {
  id?: number;
  type: 'game' | 'import' | 'puzzle' | 'lesson' | 'opening';
  refId?: number;
  at: number;
  durationMs: number;
  summary: string;
  result?: string;
}

/** The unfinished game, saved after every move so nothing is lost on close. */
export interface Session {
  id: 'current';
  sanMoves: string[];
  userColor: Color;
  level: number;
  mode: GameMode;
  timeControl: string;
  clocks: { w: number; b: number } | null;
  startedAt: number;
  activeMs: number;
  undoCount: number;
}

export interface StoredAnalysis {
  gameId: number;
  /** 'live' = collected during a coach game; 'full' = full-game analysis */
  kind: 'live' | 'full';
  evals: import('../analysis/analyzer').MoveEval[];
  curve?: import('../engine/uci').Score[];
  depth: number;
  engine: string;
  createdAt: number;
}

export interface KV {
  key: string;
  value: unknown;
}

export class AcademyDB extends Dexie {
  profile!: Table<Profile, string>;
  games!: Table<SavedGame, number>;
  activity!: Table<Activity, number>;
  session!: Table<Session, string>;
  kv!: Table<KV, string>;
  analyses!: Table<StoredAnalysis, number>;

  constructor(name = 'chess-academy') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      games: '++id, endedAt, result, mode',
      activity: '++id, at, type',
      session: 'id',
      kv: 'key',
    });
    this.version(2).stores({ analyses: 'gameId' });
  }
}

export const SCHEMA_VERSION = 2;
export const TABLES = ['profile', 'games', 'activity', 'session', 'kv', 'analyses'] as const;

let instance: AcademyDB | null = null;
export function db(): AcademyDB {
  if (!instance) instance = new AcademyDB();
  return instance;
}
/** Tests use a throwaway database. */
export function useDb(d: AcademyDB) {
  instance = d;
}

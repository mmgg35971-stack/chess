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

/** One attempt at a puzzle (spec 7.7). `result` null = skipped without a rated result. */
export interface PuzzleAttempt {
  id?: number;
  puzzleId: string;
  at: number;
  result: 0 | 1 | null;
  /** solved in the end (possibly after a mistake/hint) */
  completed: boolean;
  hints: number;
  timeMs: number;
  category: string;
  themes: string[];
  puzzleRating: number;
  ratingBefore: number;
  ratingAfter: number;
  rdAfter: number;
}

/** One learned stage of an opening (spec 8.7). */
export interface OpeningStageRecord {
  key: string; // `${openingId}#${stage}`
  openingId: string;
  stage: number;
  completedAt: number | null;
  /** test attempts (each full run of the stage test) */
  attempts: number;
  /** wrong moves over all attempts */
  mistakes: number;
  /** passed the test with no mistake on the first attempt */
  firstTry: boolean;
  needsReview: boolean;
  lastAt: number;
}
/** A periodic retention test (spec 8.6). */
export interface OpeningQuiz {
  id?: number;
  openingId: string;
  at: number;
  /** number of completed stages when the quiz was taken */
  upto: number;
  items: number;
  correct: number;
  passed: boolean;
}

export class AcademyDB extends Dexie {
  profile!: Table<Profile, string>;
  games!: Table<SavedGame, number>;
  activity!: Table<Activity, number>;
  session!: Table<Session, string>;
  kv!: Table<KV, string>;
  analyses!: Table<StoredAnalysis, number>;
  puzzleAttempts!: Table<PuzzleAttempt, number>;
  openingStages!: Table<OpeningStageRecord, string>;
  openingQuizzes!: Table<OpeningQuiz, number>;

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
    this.version(3).stores({ puzzleAttempts: '++id, at, puzzleId, category' });
    this.version(4).stores({ openingStages: 'key, openingId', openingQuizzes: '++id, openingId, at' });
  }
}

export const SCHEMA_VERSION = 4;
export const TABLES = ['profile', 'games', 'activity', 'session', 'kv', 'analyses', 'puzzleAttempts', 'openingStages', 'openingQuizzes'] as const;

let instance: AcademyDB | null = null;
export function db(): AcademyDB {
  if (!instance) instance = new AcademyDB();
  return instance;
}
/** Tests use a throwaway database. */
export function useDb(d: AcademyDB) {
  instance = d;
}

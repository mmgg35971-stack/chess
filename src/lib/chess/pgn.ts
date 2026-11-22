import { Chess } from 'chess.js';
import type { ResultCode } from './game';

export interface PgnHeaders {
  Event?: string;
  Site?: string;
  Date?: string;
  White?: string;
  Black?: string;
  Result?: ResultCode;
  [k: string]: string | undefined;
}

export function pgnDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/** Build a PGN string from SAN moves + headers, validating every move. */
export function buildPgn(moves: string[], headers: PgnHeaders, startFen?: string): string {
  const chess = startFen ? new Chess(startFen) : new Chess();
  for (const [k, v] of Object.entries(headers)) if (v !== undefined) chess.setHeader(k, v);
  if (startFen) {
    chess.setHeader('SetUp', '1');
    chess.setHeader('FEN', startFen);
  }
  for (const san of moves) chess.move(san);
  let pgn = chess.pgn();
  // chess.js appends the result from the header only when the game is over on
  // the board; make sure resignations/timeouts also carry the result token.
  const result = headers.Result ?? '*';
  if (!pgn.trimEnd().endsWith(result)) pgn = pgn.trimEnd() + ' ' + result;
  return pgn;
}

/** Split a multi-game PGN file into single games. */
export function splitPgn(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const games: string[] = [];
  let cur: string[] = [];
  let seenMoves = false;
  for (const line of normalized.split('\n')) {
    const isHeader = /^\s*\[[A-Za-z0-9_]+\s+".*"\]\s*$/.test(line);
    if (isHeader && seenMoves) {
      games.push(cur.join('\n').trim());
      cur = [];
      seenMoves = false;
    }
    if (!isHeader && line.trim() !== '') seenMoves = true;
    cur.push(line);
  }
  if (cur.join('').trim()) games.push(cur.join('\n').trim());
  return games.filter((g) => g.length > 0);
}

export interface ParsedGame {
  pgn: string;
  headers: Record<string, string>;
  sanMoves: string[];
  result: ResultCode;
}

export interface ImportReport {
  games: ParsedGame[];
  errors: { index: number; message: string }[];
}

/** Parse & validate (legal moves only) every game in a PGN file. */
export function importPgn(text: string): ImportReport {
  const report: ImportReport = { games: [], errors: [] };
  splitPgn(text).forEach((raw, index) => {
    try {
      const chess = new Chess();
      chess.loadPgn(raw);
      const headers = chess.getHeaders() as Record<string, string>;
      const r = headers.Result;
      const result: ResultCode =
        r === '1-0' || r === '0-1' || r === '1/2-1/2' ? r : '*';
      report.games.push({ pgn: chess.pgn(), headers, sanMoves: chess.history(), result });
    } catch (e) {
      report.errors.push({ index, message: e instanceof Error ? e.message : String(e) });
    }
  });
  return report;
}

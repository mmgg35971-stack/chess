import { describe, expect, it } from 'vitest';
import { buildPgn, importPgn, splitPgn } from '../src/lib/chess/pgn';

describe('pgn', () => {
  it('round-trips a resigned game with its result', () => {
    const pgn = buildPgn(['e4', 'e5', 'Nf3'], { White: 'Me', Black: 'SF', Result: '0-1', Date: '2026.11.22' });
    expect(pgn).toContain('[White "Me"]');
    expect(pgn.trim().endsWith('0-1')).toBe(true);
    const r = importPgn(pgn);
    expect(r.errors).toEqual([]);
    expect(r.games[0].sanMoves).toEqual(['e4', 'e5', 'Nf3']);
    expect(r.games[0].result).toBe('0-1');
  });
  it('splits multi-game files and reports bad games without dropping good ones', () => {
    const text = [
      '[Event "A"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
      '[Event "B"]\n[Result "*"]\n\n1. e4 e4 *',
      '[Event "C"]\n[Result "1/2-1/2"]\n\n1. d4 d5 1/2-1/2',
    ].join('\n\n');
    expect(splitPgn(text)).toHaveLength(3);
    const r = importPgn(text);
    expect(r.games.map((g) => g.headers.Event)).toEqual(['A', 'C']);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].index).toBe(1);
  });
  it('handles CRLF and BOM', () => {
    const r = importPgn('﻿[Event "X"]\r\n\r\n1. e4 *\r\n');
    expect(r.games).toHaveLength(1);
  });
});

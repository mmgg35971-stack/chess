import { describe, expect, it } from 'vitest';
import { profileFromPgn } from '../src/lib/coach/profileFromPgn';

const pgn = [
  '[White "Tal, Mikhail"]\n[Black "X"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
  '[White "Tal, Mikhail"]\n[Black "Y"]\n[Result "1/2-1/2"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 1/2-1/2',
  '[White "Z"]\n[Black "Tal, M."]\n[Result "0-1"]\n\n1. d4 Nf6 2. c4 c5 3. d5 e6 0-1',
  '[White "Z"]\n[Black "Tal, M."]\n[Result "1-0"]\n\n1. d4 Nf6 2. c4 c5 3. d5 e6 1-0',
  // white sacrifices the bishop on h7
  '[White "Tal"]\n[Black "W"]\n[Result "1-0"]\n\n1. d4 Nf6 2. Nf3 e6 3. e3 Be7 4. Bd3 O-O 5. O-O d5 6. Bxh7+ Nxh7 7. Ng5 Bxg5 1-0',
  '[White "Other"]\n[Black "Someone"]\n[Result "1-0"]\n\n1. e4 1-0',
].join('\n\n');

describe('profile from PGN', () => {
  const p = profileFromPgn(pgn, 'Tal');
  it('counts only the player’s games and the score', () => {
    expect(p.games).toBe(5);
    expect(p.asWhite).toBe(3);
    expect(p.asBlack).toBe(2);
    expect(p.score).toBeCloseTo((1 + 0.5 + 1 + 0 + 1) / 5);
  });
  it('extracts repeated opening lines', () => {
    expect(p.book.white.map((l) => l.line)).toContain('e4 e5 Nf3 Nc6');
    expect(p.book.black[0]).toEqual({ line: 'd4 Nf6 c4 c5 d5 e6', count: 2 });
  });
  it('detects the sacrifice game', () => {
    expect(p.sacrificeGames).toBe(1);
  });
});

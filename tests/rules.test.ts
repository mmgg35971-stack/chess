import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { boardOutcome, canMate, isPromotion, legalTargets, resignOutcome, timeoutOutcome, tryMove } from '../src/lib/chess/game';

describe('rules', () => {
  it('only legal moves are accepted', () => {
    const c = new Chess();
    expect(tryMove(c, { from: 'e2', to: 'e5' })).toBeNull();
    expect(tryMove(c, { from: 'e2', to: 'e4' })?.san).toBe('e4');
    expect(legalTargets(c, 'g8').sort()).toEqual(['f6', 'h6']);
  });
  it("fool's mate is checkmate for black", () => {
    const c = new Chess();
    for (const m of ['f3', 'e5', 'g4', 'Qh4#']) c.move(m);
    expect(boardOutcome(c)).toEqual({ result: '0-1', reason: 'checkmate' });
  });
  it('stalemate', () => {
    const c = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(boardOutcome(c)).toEqual({ result: '1/2-1/2', reason: 'stalemate' });
  });
  it('insufficient material', () => {
    expect(boardOutcome(new Chess('8/8/4k3/8/8/3NK3/8/8 w - - 0 1'))?.reason).toBe('insufficient');
  });
  it('threefold repetition', () => {
    const c = new Chess();
    for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) c.move(m);
    expect(boardOutcome(c)?.reason).toBe('threefold');
  });
  it('fifty-move rule', () => {
    const c = new Chess('8/8/4k3/8/8/4K3/8/R7 w - - 99 80');
    c.move('Ra2');
    expect(boardOutcome(c)?.reason).toBe('fifty-move');
  });
  it('flag loses only if opponent can mate', () => {
    const lone = new Chess('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1'); // black: lone king
    expect(canMate(lone, 'b')).toBe(false);
    expect(timeoutOutcome(lone, 'w')).toEqual({ result: '1/2-1/2', reason: 'timeout-vs-insufficient' });
    expect(timeoutOutcome(lone, 'b')).toEqual({ result: '1-0', reason: 'timeout' });
  });
  it('resign and promotion detection', () => {
    expect(resignOutcome('w').result).toBe('0-1');
    const c = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
    expect(isPromotion(c, 'e7', 'e8')).toBe(true);
    expect(tryMove(c, { from: 'e7', to: 'e8', promotion: 'n' })?.san).toBe('e8=N');
  });
  it('castling and en passant are legal', () => {
    const c = new Chess('r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 0 1');
    expect(tryMove(c, { from: 'e5', to: 'd6' })?.flags).toContain('e');
    expect(tryMove(c, { from: 'e8', to: 'c8' })?.san).toBe('O-O-O');
  });
});

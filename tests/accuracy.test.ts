import { describe, expect, it } from 'vitest';
import { cpOf, lichessAccuracy, moveAccuracyFromWin, winPercent } from '../src/lib/analysis/accuracy';

describe('Lichess accuracy (lila AccuracyPercent / WinPercent)', () => {
  it('win% is 50 at equality and symmetric', () => {
    expect(winPercent(0)).toBeCloseTo(50, 6);
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100, 6);
    expect(winPercent(100)).toBeCloseTo(59.1, 1);
  });
  it('mates count as ±1000 and cp is capped', () => {
    expect(cpOf({ mate: 3 })).toBe(1000);
    expect(cpOf({ mate: -2 })).toBe(-1000);
    expect(cpOf({ cp: 5000 })).toBe(1000);
  });
  it('a move that does not lose win% is 100% accurate; a big drop is low', () => {
    expect(moveAccuracyFromWin(60, 60)).toBe(100);
    expect(moveAccuracyFromWin(60, 65)).toBe(100);
    expect(moveAccuracyFromWin(80, 20)).toBeLessThan(10);
    const small = moveAccuracyFromWin(55, 50);
    expect(small).toBeGreaterThan(75);
    expect(small).toBeLessThan(100);
  });
  it('a game with no losses gives 100 to both sides', () => {
    const evals = Array.from({ length: 20 }, () => ({ cp: 15 }));
    const a = lichessAccuracy(evals);
    expect(a.w).toBe(100);
    expect(a.b).toBe(100);
    expect(a.perMove).toHaveLength(20);
  });
  it('one blunder by White lowers White only', () => {
    const evals = [...Array.from({ length: 10 }, () => ({ cp: 20 })), { cp: -600 }, ...Array.from({ length: 9 }, () => ({ cp: -600 }))];
    // ply 11 (index 10) is White's move (even index = White when starting as White)
    const a = lichessAccuracy(evals);
    expect(a.w!).toBeLessThan(90);
    expect(a.b).toBe(100);
  });
  it('respects a game that starts with Black to move', () => {
    const evals = [{ cp: 600 }, { cp: 600 }, { cp: 600 }, { cp: 600 }];
    const a = lichessAccuracy(evals, 'b');
    expect(a.b!).toBeLessThan(a.w!);
  });
});

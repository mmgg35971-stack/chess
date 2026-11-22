import { describe, expect, it } from 'vitest';
import { updatePeriod, update, decay, expectedScore, DEFAULT_PLAYER, bandOf } from '../src/lib/puzzles/glicko2';

describe('Glicko-2', () => {
  it("reproduces Glickman's worked example (2012 paper)", () => {
    const r = updatePeriod({ rating: 1500, rd: 200, vol: 0.06 }, [
      { rating: 1400, rd: 30, score: 1 },
      { rating: 1550, rd: 100, score: 0 },
      { rating: 1700, rd: 300, score: 0 },
    ], 0.5, false);
    expect(r.rating).toBeCloseTo(1464.06, 1);
    expect(r.rd).toBeCloseTo(151.52, 1);
    expect(r.vol).toBeCloseTo(0.05999, 4);
  });
  it('changes are not fixed: bigger for surprises and while provisional', () => {
    const p = DEFAULT_PLAYER;
    const winEasy = update(p, { rating: 800, rd: 75 }, 1).rating - p.rating;
    const winHard = update(p, { rating: 1400, rd: 75 }, 1).rating - p.rating;
    expect(winHard).toBeGreaterThan(winEasy);
    expect(winEasy).toBeGreaterThan(0);
    const settled = { rating: 1500, rd: 60, vol: 0.09 };
    const dSettled = update(settled, { rating: 1500, rd: 75 }, 1).rating - 1500;
    const dNew = update({ ...settled, rd: 300 }, { rating: 1500, rd: 75 }, 1).rating - 1500;
    expect(dNew).toBeGreaterThan(dSettled * 3);
    expect(update(settled, { rating: 1500, rd: 75 }, 0).rating).toBeLessThan(1500);
  });
  it('a player who always solves ~50% at their level stays near it', () => {
    let p = DEFAULT_PLAYER; let s = 3;
    const rng = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const TRUE = 1400;
    for (let i = 0; i < 400; i++) {
      const pr = p.rating + (rng() - 0.5) * 200;
      const pSolve = 1 / (1 + 10 ** ((pr - TRUE) / 400));
      p = update(p, { rating: pr, rd: 75 }, rng() < pSolve ? 1 : 0);
    }
    expect(Math.abs(p.rating - TRUE)).toBeLessThan(120);
    expect(p.rd).toBeLessThan(90);
    expect(expectedScore(p, { rating: p.rating, rd: 75 })).toBeCloseTo(0.5, 1);
  });
  it('deviation grows when idle, bands match the spec', () => {
    expect(decay({ rating: 1500, rd: 60, vol: 0.09 }, 60).rd).toBeGreaterThan(60);
    expect(bandOf(1000).key).toBe('band_1000');
    expect(bandOf(2450).key).toBe('band_2400');
    expect(bandOf(950).key).toBe('band_lt1000');
  });
});

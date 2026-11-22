import { describe, expect, it } from 'vitest';
import { engineThinkMs } from '../src/lib/engine/timing';

const base = { legalMoves: 30, gapCp: 40, ply: 20, clockMs: null, incMs: 0 };

describe('engine think time', () => {
  it('forced moves are near-instant', () => {
    expect(engineThinkMs({ ...base, legalMoves: 1 })).toBeLessThan(500);
  });
  it('no clock: between 0.8s and 3.5s, longer for close choices than obvious ones', () => {
    const obvious = engineThinkMs({ ...base, gapCp: 300 });
    const close = engineThinkMs({ ...base, gapCp: 10 });
    expect(obvious).toBeGreaterThanOrEqual(800);
    expect(close).toBeLessThanOrEqual(3500);
    expect(close).toBeGreaterThan(obvious);
  });
  it('opening moves are quicker than middlegame moves', () => {
    expect(engineThinkMs({ ...base, ply: 2 })).toBeLessThan(engineThinkMs({ ...base, ply: 24 }));
  });
  it('with a clock it uses a share of remaining time and never risks flagging', () => {
    const t10 = engineThinkMs({ ...base, clockMs: 10 * 60e3 });
    expect(t10).toBeGreaterThan(5000);
    expect(t10).toBeLessThanOrEqual(12000);
    const low = engineThinkMs({ ...base, clockMs: 2000 });
    expect(low).toBeLessThanOrEqual(300);
  });
  it('is deterministic', () => {
    expect(engineThinkMs(base)).toBe(engineThinkMs(base));
  });
});

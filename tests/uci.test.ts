import { describe, expect, it } from 'vitest';
import { formatScore, parseBestMove, parseInfo, toWhitePov, winProbability } from '../src/lib/engine/uci';

describe('uci parsing', () => {
  it('parses info with multipv, cp score and pv', () => {
    const i = parseInfo('info depth 12 seldepth 18 multipv 2 score cp -34 nodes 1234 nps 1 pv e7e5 g1f3 b8c6');
    expect(i).toMatchObject({ depth: 12, multipv: 2, score: { cp: -34 }, pv: ['e7e5', 'g1f3', 'b8c6'], nodes: 1234 });
  });
  it('parses mate and bounds', () => {
    expect(parseInfo('info depth 5 score mate -3 pv a1a2')?.score).toEqual({ mate: -3 });
    expect(parseInfo('info depth 5 score cp 10 lowerbound pv a1a2')?.bound).toBe('lower');
    expect(parseInfo('info string hello')).toBeNull();
  });
  it('parses bestmove', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ best: 'e2e4', ponder: 'e7e5' });
    expect(parseBestMove('bestmove (none)')?.best).toBeNull();
  });
  it('white point of view and win probability', () => {
    expect(toWhitePov({ cp: 50 }, 'b')).toEqual({ cp: -50, mate: undefined });
    expect(winProbability({ cp: 0 })).toBeCloseTo(0.5);
    expect(winProbability({ mate: 2 })).toBe(1);
    expect(winProbability({ cp: 300 })).toBeGreaterThan(0.7);
    expect(formatScore({ cp: 123 })).toBe('+1.23');
    expect(formatScore({ mate: -4 })).toBe('#-4');
  });
});

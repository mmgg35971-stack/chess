import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
import { LESSONS, TOPICS, lessonsOf } from '../src/lib/lessons/lessons';
import { INDEXED_CATEGORIES } from '../src/lib/puzzles/categories';

describe('middlegame and endgame lessons', () => {
  it('covers every topic of spec 9.1 and 9.2 with a concept card and practice', () => {
    expect(TOPICS.filter((t) => t.section === 'mg')).toHaveLength(10);
    expect(TOPICS.filter((t) => t.section === 'eg')).toHaveLength(10);
    const counts = JSON.parse(readFileSync('public/data/puzzles/index.json', 'utf8')).counts as Record<string, number[]>;
    for (const t of TOPICS) {
      expect(t.concept.ar && t.concept.en && t.deter.ar && t.deter.en && t.idea.en, t.id).toBeTruthy();
      expect(t.principles.length).toBeGreaterThanOrEqual(3);
      expect(INDEXED_CATEGORIES.some((c) => c.id === t.practice), t.practice).toBe(true);
      expect(counts[t.practice].reduce((a, b) => a + b, 0), t.practice).toBeGreaterThan(500);
    }
    // every endgame topic has a guided lesson; at least half of the middlegame ones do
    for (const t of TOPICS.filter((x) => x.section === 'eg')) expect(lessonsOf(t.id).length, t.id).toBeGreaterThan(0);
    expect(TOPICS.filter((x) => x.section === 'mg' && lessonsOf(x.id).length).length).toBeGreaterThanOrEqual(5);
  });
  it('every lesson is legal, has one note per move and 3–6 learner moves', () => {
    for (const l of LESSONS) {
      const c = new Chess(l.fen);
      for (const m of (l.pre ?? '').split(' ').filter(Boolean)) c.move(m);
      const learner = c.turn();
      const moves = l.moves.split(' ');
      let n = 0;
      for (const m of moves) { if (c.turn() === learner) n++; c.move(m); }
      expect(l.notes.length, l.id).toBe(moves.length);
      expect(n, l.id).toBeGreaterThanOrEqual(3);
      expect(n, l.id).toBeLessThanOrEqual(6);
      if (l.goal === 'mate') expect(c.isCheckmate()).toBe(true);
    }
  });
});

import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { OPENINGS } from '../src/lib/academy/defs';
import { INFO } from '../src/lib/academy/info';
import { buildStages, stagePlies, isLearnerPly, type Line } from '../src/lib/academy/stages';
import { explainOpeningMove } from '../src/lib/academy/explain';
import { makeQuiz, quizDue, recordStageTest, recordQuiz, stageRecords, quizzesOf, nextStage, type OpeningData } from '../src/lib/academy/progress';
import { AcademyDB, useDb } from '../src/lib/storage/db';

const load = (id: string): OpeningData => JSON.parse(readFileSync(`public/data/academy/${id}.json`, 'utf8'));

describe('academy content', () => {
  it('has more than ten openings for each colour, each with a reference page', () => {
    expect(OPENINGS.filter((o) => o.side === 'w').length).toBeGreaterThan(10);
    expect(OPENINGS.filter((o) => o.side === 'b').length).toBeGreaterThan(10);
    for (const o of OPENINGS) {
      const i = INFO[o.id];
      expect(i, o.id).toBeTruthy();
      for (const k of ['history', 'idea', 'plansWhite', 'plansBlack', 'structure'] as const) expect(i[k].ar && i[k].en, `${o.id}.${k}`).toBeTruthy();
      expect(i.pros.length && i.cons.length && i.players.length && i.mistakes.length).toBeTruthy();
      const main = o.main.split(' ');
      for (const [k, n] of Object.entries(i.notes)) {
        const san = main[+k].replace(/[+#]/g, '');
        if (san.startsWith('O-O')) continue;
        expect(n.en.includes(san) && n.ar.includes(san), `${o.id} note ${k} should be about ${san}`).toBe(true);
      }
    }
  });
  it('every line is legal, checked by the engine, and stages teach 3–6 moves', () => {
    let total = 0;
    for (const o of OPENINGS) {
      const d = load(o.id);
      expect(d.lines[0].source, o.id).toBe('main');
      expect(d.lines[0].sans.join(' ')).toBe(o.main);
      for (const l of d.lines) {
        const c = new Chess();
        for (const s of l.sans) c.move(s); // throws if illegal
        l.sans.forEach((_, i) => {
          if (isLearnerPly(i, o.side)) { expect(l.eng[i], `${o.id} ${l.name} ply ${i}`).toBeTruthy(); expect(l.eng[i]!.loss).toBeLessThanOrEqual(120); }
          else expect(l.eng[i]).toBeNull();
        });
      }
      expect(d.stages.length, o.id).toBeGreaterThan(8);
      for (const s of d.stages) {
        const n = stagePlies(s, o.side).length;
        expect(n, `${o.id} stage`).toBeGreaterThanOrEqual(3);
        expect(n).toBeLessThanOrEqual(6);
        expect(isLearnerPly(s.from, o.side)).toBe(true);
        expect(s.to).toBeLessThan(d.lines[s.line].sans.length);
      }
      total += d.stages.length;
    }
    expect(total).toBeGreaterThan(1000);
  });
});

describe('stage builder', () => {
  const L = (s: string, name = 'x'): Line => ({ name, eco: '', sans: s.split(' '), source: 'lichess' });
  it('teaches new moves only once and repeats known ones to reach three', () => {
    const lines = [L('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7'), L('e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6')];
    const st = buildStages(lines, 'w');
    expect(st[0]).toMatchObject({ line: 0, from: 0, fresh: [0, 2, 4, 6, 8] });
    expect(st[1].line).toBe(1);
    expect(st[1].fresh).toEqual([6]); // only Bxc6 is new
    expect(stagePlies(st[1], 'w')).toEqual([2, 4, 6]); // Nf3 and Bb5 repeated as revision
    expect(st[1].to).toBe(7); // includes the expected reply ...dxc6
  });
  it('splits long lines in chunks of at most 5–6 moves', () => {
    const st = buildStages([L('d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5')], 'w');
    expect(st.map((s) => s.fresh.length)).toEqual([5, 5]);
  });
});

describe('move explanations', () => {
  const at = (s: string) => { const c = new Chess(); for (const m of s.split(' ')) c.move(m); return c.fen(); };
  it('describes what the move really does', () => {
    expect(explainOpeningMove(at('d4 d5 c4 e6 Nc3 Nf6'), 'Bg5', 'en').join(' ')).toMatch(/Pins the knight on f6 to the queen/);
    expect(explainOpeningMove(at('e4 e5 Nf3 Nc6 Bb5'), 'a6', 'en').join(' ')).toMatch(/Attacks the bishop on b5/);
    expect(explainOpeningMove(at('e4 e5'), 'f4', 'en').join(' ')).toMatch(/gambit/);
    expect(explainOpeningMove(at('e4 e5 Nf3 Nc6 Bc4 Nf6'), 'O-O', 'ar').join(' ')).toMatch(/تبييت/);
    expect(explainOpeningMove(at('d4 Nf6 c4'), 'g6', 'en').join(' ')).toMatch(/fianchetto/);
    expect(explainOpeningMove(at('e4'), 'c5', 'en', { engine: { loss: 0, best: 'c5' } }).join(' ')).toMatch(/top choice/);
    expect(explainOpeningMove(at('e4 e5'), 'f4', 'en', { engine: { loss: 70, best: 'Nf3' } }).join(' ')).toMatch(/riskier; the engine prefers Nf3/);
  });
});

describe('progress, review tests', () => {
  beforeEach(() => useDb(new AcademyDB('test-ac-' + Math.random())));
  it('records tests, unlocks in order and flags stages needing review', async () => {
    const d = load('italian');
    let r = await recordStageTest('italian', 0, 2, 1000);
    expect(r).toMatchObject({ completedAt: null, needsReview: true, attempts: 1 });
    r = await recordStageTest('italian', 0, 0, 1000);
    expect(r.completedAt).not.toBeNull();
    expect(r.firstTry).toBe(false);
    expect(r.needsReview).toBe(true); // completed only after mistakes
    r = await recordStageTest('italian', 0, 0, 1000);
    expect(r.needsReview).toBe(false); // clean review
    expect(nextStage(d, await stageRecords('italian'))).toBe(1);
  });
  it('a 7–15 move review test is due every 10 stages until passed', async () => {
    const d = load('sicilian');
    for (let i = 0; i < 10; i++) await recordStageTest('sicilian', i, 0, 500);
    const recs = await stageRecords('sicilian');
    expect(quizDue(9, [])).toBe(false);
    expect(quizDue(10, await quizzesOf('sicilian'))).toBe(true);
    const items = makeQuiz(d, [...recs.keys()], () => 0.4);
    expect(items.length).toBeGreaterThanOrEqual(7);
    expect(items.length).toBeLessThanOrEqual(15);
    expect(new Set(items.map((q) => d.lines[q.line].sans.slice(0, q.ply + 1).join(' '))).size).toBe(items.length);
    for (const q of items) expect(isLearnerPly(q.ply, 'b')).toBe(true);
    const fail = await recordQuiz('sicilian', 10, items.map((q, i) => ({ stage: q.stage, ok: i > 3 })));
    expect(fail.passed).toBe(false);
    expect(quizDue(10, await quizzesOf('sicilian'))).toBe(true);
    expect([...(await stageRecords('sicilian')).values()].some((x) => x.needsReview)).toBe(true);
    await recordQuiz('sicilian', 10, items.map((q) => ({ stage: q.stage, ok: true })));
    expect(quizDue(10, await quizzesOf('sicilian'))).toBe(false);
    expect(quizDue(20, await quizzesOf('sicilian'))).toBe(true);
  });
});

// Progress in the Openings Academy, stored locally (spec 8.4–8.7).
import { db, type OpeningQuiz, type OpeningStageRecord } from '../storage/db';
import { stagePlies, type Line, type Stage } from './stages';

export const QUIZ_EVERY = 10;
export const QUIZ_MIN = 7;
export const QUIZ_MAX = 15;
export const QUIZ_PASS = 0.8;

export interface OpeningData { id: string; side: 'w' | 'b'; lines: (Line & { eng: (null | { loss: number; best: string })[] })[]; stages: Stage[] }

/**
 * Records of an opening keyed by the CURRENT stage index. With `data`, records are matched by the
 * stage's stable uid, so adding new lines (which renumbers stages) keeps progress on the right stage.
 */
export async function stageRecords(openingId: string, data?: OpeningData): Promise<Map<number, OpeningStageRecord>> {
  const rows = await db().openingStages.where('openingId').equals(openingId).toArray();
  if (!data || !data.stages.some((s) => s.uid)) return new Map(rows.map((r) => [r.stage, r]));
  const byUid = new Map(data.stages.map((s, i) => [s.uid, i]));
  const out = new Map<number, OpeningStageRecord>();
  for (const r of rows) { const i = r.uid ? byUid.get(r.uid) : undefined; if (i !== undefined) out.set(i, { ...r, stage: i }); }
  return out;
}
export const quizzesOf = (openingId: string) => db().openingQuizzes.where('openingId').equals(openingId).sortBy('at');
export const allStageRecords = () => db().openingStages.toArray();

/** Saves one run of a stage test. Passing = no mistakes in this run. */
export async function recordStageTest(openingId: string, stage: number, mistakes: number, timeMs: number, uid?: string, now = Date.now()): Promise<OpeningStageRecord> {
  const key = uid ? `${openingId}#${uid}` : `${openingId}#${stage}`;
  const prev = await db().openingStages.get(key);
  const passed = mistakes === 0;
  const rec: OpeningStageRecord = {
    key, openingId, stage, uid,
    completedAt: passed ? prev?.completedAt ?? now : prev?.completedAt ?? null,
    attempts: (prev?.attempts ?? 0) + 1,
    mistakes: (prev?.mistakes ?? 0) + mistakes,
    firstTry: prev ? prev.firstTry : passed,
    // first completed only after mistakes → review later; a later clean pass (the review) clears it
    needsReview: !passed ? true : prev?.completedAt ? false : (prev?.mistakes ?? 0) > 0,
    lastAt: now,
  };
  await db().transaction('rw', db().openingStages, db().activity, async () => {
    await db().openingStages.put(rec);
    if (passed && !prev?.completedAt) {
      await db().activity.add({ type: 'opening', at: now, durationMs: timeMs, summary: `📖 ${openingId} · ${stage + 1}`, result: '✓' });
    }
  });
  return rec;
}

export interface QuizItem { stage: number; line: number; ply: number }

/** 7–15 positions from the last 20 completed stages (spec 8.6). */
export function makeQuiz(data: OpeningData, completed: number[], rng = Math.random): QuizItem[] {
  const recent = [...completed].sort((a, b) => a - b).slice(-20);
  const pool: QuizItem[] = [];
  for (const s of recent) for (const ply of stagePlies(data.stages[s], data.side)) pool.push({ stage: s, line: data.stages[s].line, ply });
  // one per (line prefix): do not ask the same position twice
  const seen = new Set<string>();
  const uniq = pool.filter((q) => { const k = data.lines[q.line].sans.slice(0, q.ply + 1).join(' '); if (seen.has(k)) return false; seen.add(k); return true; });
  for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [uniq[i], uniq[j]] = [uniq[j], uniq[i]]; }
  const n = Math.min(QUIZ_MAX, Math.max(QUIZ_MIN, Math.round(recent.length * 0.75)));
  return uniq.slice(0, n);
}

/** A quiz is due after every 10 completed stages until it is passed. */
export function quizDue(completedCount: number, quizzes: OpeningQuiz[]): boolean {
  const milestone = Math.floor(completedCount / QUIZ_EVERY) * QUIZ_EVERY;
  if (milestone === 0) return false;
  return !quizzes.some((q) => q.passed && q.upto >= milestone);
}

export async function recordQuiz(openingId: string, upto: number, results: { stage: number; ok: boolean; uid?: string }[], now = Date.now()): Promise<OpeningQuiz> {
  const correct = results.filter((r) => r.ok).length;
  const q: OpeningQuiz = { openingId, at: now, upto, items: results.length, correct, passed: correct / results.length >= QUIZ_PASS };
  await db().transaction('rw', db().openingQuizzes, db().openingStages, db().activity, async () => {
    q.id = await db().openingQuizzes.add(q);
    for (const r of results) if (!r.ok) {
      const key = r.uid ? `${openingId}#${r.uid}` : `${openingId}#${r.stage}`;
      const rec = await db().openingStages.get(key);
      if (rec) await db().openingStages.put({ ...rec, needsReview: true });
    }
    await db().activity.add({ type: 'opening', at: now, durationMs: 0, summary: `📝 ${openingId} ${correct}/${results.length}`, result: q.passed ? '✓' : '✗' });
  });
  return q;
}

/** The next stage to study: the first not completed (stages unlock in order). */
export function nextStage(data: OpeningData, recs: Map<number, OpeningStageRecord>): number {
  for (let i = 0; i < data.stages.length; i++) if (!recs.get(i)?.completedAt) return i;
  return data.stages.length;
}

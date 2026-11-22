import { getEngine } from '../engine/engine';
import { analyzeGame } from './analyzer';
import type { Thresholds } from './classify';
import { saveAnalysis } from '../storage/repo';

/** One full-game analysis at a time, in the engine worker; screens subscribe to progress. */
export interface Job {
  gameId: number;
  done: number;
  total: number;
  finished: boolean;
  cancelled: boolean;
}

let job: Job | null = null;
const listeners = new Set<(j: Job | null) => void>();
const emit = () => listeners.forEach((l) => l(job ? { ...job } : null));

export function subscribe(fn: (j: Job | null) => void) {
  listeners.add(fn);
  fn(job ? { ...job } : null);
  return () => { listeners.delete(fn); };
}

export function currentJob() {
  return job;
}

export async function runFullAnalysis(gameId: number, pgn: string, depth: number, movetime: number, th: Thresholds) {
  if (job && !job.finished && !job.cancelled) {
    if (job.gameId === gameId) return;
    job.cancelled = true;
    getEngine().stop();
  }
  const me: Job = { gameId, done: 0, total: 1, finished: false, cancelled: false };
  job = me;
  emit();
  const engine = getEngine();
  const res = await analyzeGame(
    engine, { pgn }, { depth, movetime },
    (d, total) => { me.done = d; me.total = total; if (job === me) emit(); },
    () => me.cancelled,
    th,
  );
  if (res && !me.cancelled) {
    await saveAnalysis({ gameId, kind: 'full', evals: res.evals, curve: res.curve, depth, engine: res.engine, createdAt: res.createdAt });
  }
  me.finished = true;
  if (job === me) emit();
}

export function cancelAnalysis() {
  if (job && !job.finished) {
    job.cancelled = true;
    getEngine().stop();
    emit();
  }
}

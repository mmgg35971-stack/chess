import { db, SCHEMA_VERSION, TABLES, type Profile, type SavedGame, type Session, type StoredAnalysis } from './db';
import { importPgn } from '../chess/pgn';

export async function ensureProfile(defaultName: string): Promise<Profile> {
  const existing = await db().profile.get('me');
  if (existing) return existing;
  const p: Profile = { id: 'me', name: defaultName, createdAt: Date.now() };
  await db().profile.put(p);
  return p;
}

export async function updateProfile(patch: Partial<Omit<Profile, 'id'>>) {
  await db().profile.update('me', patch);
}

export async function saveFinishedGame(g: Omit<SavedGame, 'id'>): Promise<number> {
  return db().transaction('rw', db().games, db().activity, db().session, async () => {
    const id = await db().games.add(g);
    await db().activity.add({
      type: 'game',
      refId: id,
      at: g.endedAt,
      durationMs: g.durationMs,
      summary: `${g.white} – ${g.black}`,
      result: g.result,
    });
    await db().session.delete('current');
    return id;
  });
}

export const getAnalysis = (gameId: number) => db().analyses.get(gameId);
export const saveAnalysis = (a: StoredAnalysis) => db().analyses.put(a);
export async function gamesVsCoach(coachId: string) {
  return (await db().games.toArray()).filter((g) => g.opponent.kind === 'coach' && g.opponent.id === coachId).length;
}

export const listGames = () => db().games.orderBy('endedAt').reverse().toArray();
export const getGame = (id: number) => db().games.get(id);
export const listActivity = (limit = 20) => db().activity.orderBy('at').reverse().limit(limit).toArray();
export const allActivity = () => db().activity.toArray();

export const loadSession = () => db().session.get('current');
export const saveSession = (s: Session) => db().session.put(s);
export const clearSession = () => db().session.delete('current');

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db().kv.get(key);
  return row ? (row.value as T) : fallback;
}
export const setSetting = (key: string, value: unknown) => db().kv.put({ key, value });

/** Import games from PGN text. Imported games never count toward the user's stats. */
export async function importGames(text: string) {
  const report = importPgn(text);
  const now = Date.now();
  await db().transaction('rw', db().games, db().activity, async () => {
    for (const g of report.games) {
      await db().games.add({
        pgn: g.pgn,
        white: g.headers.White ?? '?',
        black: g.headers.Black ?? '?',
        userColor: 'w',
        opponent: { kind: 'import' },
        mode: 'training',
        result: g.result,
        plies: g.sanMoves.length,
        startedAt: now,
        endedAt: now,
        durationMs: 0,
        imported: true,
      });
    }
    if (report.games.length)
      await db().activity.add({ type: 'import', at: now, durationMs: 0, summary: `PGN ×${report.games.length}` });
  });
  return report;
}

export interface Backup {
  app: 'chess-grandmaster-academy';
  schema: number;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export async function exportBackup(): Promise<Backup> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db().table(t).toArray();
  return { app: 'chess-grandmaster-academy', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Replace all local data with a backup. Validates before touching anything. */
export async function restoreBackup(raw: unknown) {
  const b = raw as Backup;
  if (!b || b.app !== 'chess-grandmaster-academy' || typeof b.data !== 'object')
    throw new Error('not-a-backup');
  if (b.schema > SCHEMA_VERSION) throw new Error('backup-too-new');
  for (const t of TABLES) if (b.data[t] !== undefined && !Array.isArray(b.data[t])) throw new Error('corrupt-backup');
  await db().transaction('rw', TABLES.map((t) => db().table(t)), async () => {
    for (const t of TABLES) {
      await db().table(t).clear();
      const rows = b.data[t] ?? [];
      if (rows.length) await db().table(t).bulkAdd(rows);
    }
  });
}

export async function wipeAll() {
  await db().transaction('rw', TABLES.map((t) => db().table(t)), async () => {
    for (const t of TABLES) await db().table(t).clear();
  });
}

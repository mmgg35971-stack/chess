import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AcademyDB, useDb } from '../src/lib/storage/db';
import {
  ensureProfile, exportBackup, importGames, listGames, loadSession, restoreBackup,
  saveFinishedGame, saveSession, wipeAll, allActivity,
} from '../src/lib/storage/repo';
import { playStats } from '../src/lib/stats';

let n = 0;
beforeEach(() => useDb(new AcademyDB('test-' + n++)));

const game = (over: Partial<Parameters<typeof saveFinishedGame>[0]> = {}) => ({
  pgn: '[Result "1-0"]\n\n1. e4 1-0', white: 'Me', black: 'SF', userColor: 'w' as const,
  opponent: { kind: 'engine' as const, level: 3 }, mode: 'competitive' as const,
  result: '1-0' as const, plies: 1, startedAt: 1, endedAt: 2, durationMs: 60000, ...over,
});

describe('storage', () => {
  it('creates the local profile once', async () => {
    const a = await ensureProfile('Player');
    const b = await ensureProfile('Other');
    expect(b.createdAt).toBe(a.createdAt);
    expect(b.name).toBe('Player');
  });

  it('stats come from real saved games; imports do not count', async () => {
    await saveFinishedGame(game());
    await saveFinishedGame(game({ result: '0-1' }));
    await saveFinishedGame(game({ result: '1/2-1/2', userColor: 'b' }));
    await saveFinishedGame(game({ result: '1-0', userColor: 'b' }));
    await importGames('[Result "1-0"]\n\n1. e4 e5 1-0');
    const s = playStats(await listGames(), await allActivity());
    expect(s).toMatchObject({ games: 4, wins: 1, losses: 2, draws: 1, winRate: 25, trainingMs: 240000 });
  });

  it('saving a finished game clears the unfinished session', async () => {
    await saveSession({ id: 'current', sanMoves: ['e4'], userColor: 'w', level: 1, mode: 'training', timeControl: 'none', clocks: null, startedAt: 1, activeMs: 0, undoCount: 0 });
    expect((await loadSession())?.sanMoves).toEqual(['e4']);
    await saveFinishedGame(game());
    expect(await loadSession()).toBeUndefined();
  });

  it('backup → wipe → restore returns identical data', async () => {
    await ensureProfile('Ali');
    await saveFinishedGame(game());
    const b = await exportBackup();
    const json = JSON.parse(JSON.stringify(b));
    await wipeAll();
    expect(await listGames()).toEqual([]);
    await restoreBackup(json);
    const again = await exportBackup();
    expect(again.data).toEqual(b.data);
  });

  it('rejects files that are not backups without touching data', async () => {
    await saveFinishedGame(game());
    await expect(restoreBackup({ hello: 1 })).rejects.toThrow('not-a-backup');
    await expect(restoreBackup({ app: 'chess-grandmaster-academy', schema: 999, data: {} })).rejects.toThrow('backup-too-new');
    expect(await listGames()).toHaveLength(1);
  });
});

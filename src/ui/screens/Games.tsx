import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { useApp } from '../AppContext';
import { importGames, listGames } from '../../lib/storage/repo';
import type { SavedGame } from '../../lib/storage/db';
import { userOutcome } from '../../lib/stats';
import { fmtDateTime } from '../format';
import { pickTextFile, saveTextFile, stamp } from '../../lib/files';
import { Board } from '../board/Board';
import { MoveList } from './Play';

export function Games({ openId }: { openId?: number }) {
  const { t, settings, dataVersion, bumpData, toast, go } = useApp();
  const [games, setGames] = useState<SavedGame[]>([]);
  const [open, setOpen] = useState<SavedGame | null>(null);

  useEffect(() => {
    listGames().then((g) => {
      setGames(g);
      if (openId) setOpen(g.find((x) => x.id === openId) ?? null);
    });
  }, [dataVersion, openId]);

  const doImport = async () => {
    const text = await pickTextFile('.pgn,text/plain,application/x-chess-pgn');
    if (!text) return;
    const rep = await importGames(text);
    toast(t('importDone', { n: rep.games.length }) + (rep.errors.length ? t('importErrors', { n: rep.errors.length }) : ''));
    bumpData();
  };

  const exportAll = () =>
    saveTextFile(`games-${stamp()}.pgn`, games.map((g) => g.pgn).join('\n\n') + '\n', 'application/x-chess-pgn');

  if (open) return <Replay game={open} onClose={() => setOpen(null)} />;

  return (
    <div className="screen">
      <h1>{t('history')}</h1>
      <div className="row gap wrap">
        <button className="btn primary" onClick={() => go({ name: 'analyzePgn' })}>{t('apg_open')}</button>
        <button className="btn" onClick={doImport} data-testid="import-pgn">{t('importPgn')}</button>
        <button className="btn" onClick={exportAll} disabled={!games.length} data-testid="export-all">{t('exportAll')}</button>
      </div>
      {games.length === 0 && <p className="muted">{t('noGames')}</p>}
      <ul className="list card" data-testid="game-list">
        {games.map((g) => {
          const o = userOutcome(g);
          return (
            <li key={g.id} onClick={() => setOpen(g)}>
              <span><bdi>{g.white}</bdi> – <bdi>{g.black}</bdi></span>
              <span className={'pill ' + (g.imported ? '' : o)}><span dir="ltr">{g.result}</span>{g.imported ? ` · ${t('imported')}` : ''}</span>
              <span className="muted small">{fmtDateTime(g.endedAt, settings.lang)} · {g.plies} {t('plies')}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Replay({ game, onClose }: { game: SavedGame; onClose: () => void }) {
  const { t, settings, go } = useApp();
  const { sans, fens, moves } = useMemo(() => {
    const c = new Chess();
    c.loadPgn(game.pgn);
    const verbose = c.history({ verbose: true });
    return { sans: verbose.map((m) => m.san), fens: [verbose[0]?.before ?? c.fen(), ...verbose.map((m) => m.after)], moves: verbose };
  }, [game.pgn]);
  const [ply, setPly] = useState(sans.length);
  const last = ply > 0 ? moves[ply - 1] : null;

  return (
    <div className="screen play">
      <div className="row between">
        <strong><bdi>{game.white}</bdi> – <bdi>{game.black}</bdi> <span dir="ltr" className="res">{game.result}</span></strong>
        <button className="btn" onClick={onClose}>{t('close')}</button>
      </div>
      <Board
        fen={fens[ply]} orientation={game.userColor} movable={null}
        targets={() => []} needsPromotion={() => false} onMove={() => false}
        lastMove={last ? [last.from as Square, last.to as Square] : null}
        themeId={settings.boardTheme} pieceSet={settings.pieceSet}
        coordinates={settings.coordinates} showLegal={false} showLastMove={settings.showLastMove}
      animationMs={settings.animationMs}
      />
      <div className="row gap center" dir="ltr">
        <button className="btn" onClick={() => setPly(0)}>⏮</button>
        <button className="btn" onClick={() => setPly(Math.max(0, ply - 1))} data-testid="prev">◀</button>
        <span className="muted">{ply}/{sans.length}</span>
        <button className="btn" onClick={() => setPly(Math.min(sans.length, ply + 1))} data-testid="next">▶</button>
        <button className="btn" onClick={() => setPly(sans.length)}>⏭</button>
      </div>
      <button className="btn primary" onClick={() => go({ name: 'analysis', gameId: game.id! })} data-testid="open-analysis">{t('analyzeGame')}</button>
      <MoveList sans={sans} title={t('moves')} current={ply} onPick={setPly} />
      <button className="btn" onClick={() => saveTextFile(`game-${game.id}.pgn`, game.pgn, 'application/x-chess-pgn')}>{t('exportPgn')}</button>
    </div>
  );
}

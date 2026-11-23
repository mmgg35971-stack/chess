import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { useApp } from '../AppContext';
import { Board } from '../board/Board';
import { importPgn } from '../../lib/chess/pgn';
import { importGames } from '../../lib/storage/repo';
import { pickTextFile } from '../../lib/files';
import { openingName } from '../../lib/analysis/book';
import { Segmented } from '../screens/Play';

/** Analyse any game: paste or open a PGN, choose the game and your colour, then the full Stockfish report opens. */
export function AnalyzePgn() {
  const { t, go, settings, toast, bumpData } = useApp();
  const [text, setText] = useState('');
  const [pick, setPick] = useState(0);
  const [color, setColor] = useState<'w' | 'b'>('w');
  const [busy, setBusy] = useState(false);
  const rep = useMemo(() => (text.trim() ? importPgn(text) : null), [text]);
  const games = rep?.games ?? [];
  const g = games[Math.min(pick, games.length - 1)];
  const preview = useMemo(() => {
    if (!g) return null;
    const c = new Chess();
    c.loadPgn(g.pgn);
    return { fen: c.fen(), opening: openingName(g.sanMoves), plies: g.sanMoves.length };
  }, [g]);

  const open = async () => {
    const f = await pickTextFile('.pgn,text/plain,application/x-chess-pgn');
    if (f) { setText(f); setPick(0); }
  };
  const analyse = async () => {
    if (!g) return;
    setBusy(true);
    const r = await importGames(text, { userColor: color, only: Math.min(pick, games.length - 1) });
    setBusy(false);
    if (!r.ids.length) { toast(t('apg_none')); return; }
    bumpData();
    go({ name: 'analysis', gameId: r.ids[0], autostart: true });
  };

  return (
    <div className="screen">
      <div className="card">
        <h2>{t('apg_title')}</h2>
        <p className="small muted">{t('apg_hint')}</p>
        <textarea className="pgn-input" dir="ltr" rows={7} value={text} onChange={(e) => { setText(e.target.value); setPick(0); }}
          placeholder={'[Event "?"]\n[White "…"]\n[Black "…"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 …'} data-testid="apg-text" />
        <div className="row gap wrap">
          <button className="btn" onClick={open} data-testid="apg-file">{t('apg_file')}</button>
          {text && <button className="btn" onClick={() => setText('')}>{t('apg_clear')}</button>}
        </div>
        {rep && !games.length && <p className="small bad" data-testid="apg-error">{t('apg_invalid')}</p>}
        {rep && rep.errors.length > 0 && games.length > 0 && <p className="small muted">{t('importErrors', { n: rep.errors.length })}</p>}
      </div>

      {g && preview && (
        <div className="card" data-testid="apg-preview">
          {games.length > 1 && (
            <label className="field col"><span>{t('apg_pick', { n: games.length })}</span>
              <select value={pick} onChange={(e) => setPick(+e.target.value)} data-testid="apg-pick" dir="ltr">
                {games.map((x, i) => <option key={i} value={i}>{i + 1}. {x.headers.White ?? '?'} – {x.headers.Black ?? '?'} {x.result}</option>)}
              </select>
            </label>
          )}
          <div className="apg-head" dir="ltr">
            <b>{g.headers.White ?? '?'}</b> <span className="muted">{g.headers.WhiteElo ?? ''}</span> – <b>{g.headers.Black ?? '?'}</b> <span className="muted">{g.headers.BlackElo ?? ''}</span>
            <span className="pill">{g.result}</span>
          </div>
          <div className="small muted">{preview.opening ? <bdi dir="ltr">{preview.opening.eco} {preview.opening.name}</bdi> : null}{preview.opening ? ' · ' : ''}{t('apg_moves', { n: Math.ceil(preview.plies / 2) })}{g.headers.Event && g.headers.Event !== '?' ? ` · ${g.headers.Event}` : ''}</div>
          <div className="apg-board">
            <Board fen={preview.fen} orientation={color} movable={null} targets={() => []} needsPromotion={() => false} onMove={() => false}
              themeId={settings.boardTheme} pieceSet={settings.pieceSet} coordinates={settings.coordinates} showLegal={false} showLastMove animationMs={0} />
          </div>
          <div className="field"><span>{t('apg_myColor')}</span>
            <Segmented value={color} onChange={(v) => setColor(v as 'w' | 'b')} options={[['w', t('white')], ['b', t('black')]]} />
          </div>
          <button className="btn primary big" onClick={analyse} disabled={busy} data-testid="apg-go">{busy ? '…' : t('apg_go')}</button>
          <p className="tiny muted">{t('apg_note')}</p>
        </div>
      )}
    </div>
  );
}

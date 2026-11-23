import { useEffect, useMemo, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import { useApp } from '../AppContext';
import { Board, type Arrow } from '../board/Board';
import { Dock } from '../Dock';
import { EvalBar, EvalGraph } from './EvalBar';
import { LabelTable } from '../coach/CoachGame';
import { getAnalysis, getGame } from '../../lib/storage/repo';
import type { SavedGame, StoredAnalysis } from '../../lib/storage/db';
import { summarize, type MoveEval } from '../../lib/analysis/analyzer';
import { explain, LABEL_SYMBOL, LABEL_TEXT } from '../../lib/analysis/explain';
import { STRICTNESS, type MoveLabel } from '../../lib/analysis/classify';
import { formatScore, type Score } from '../../lib/engine/uci';
import { cancelAnalysis, runFullAnalysis, subscribe, type Job } from '../../lib/analysis/runner';
import { saveTextFile } from '../../lib/files';
import { coachById } from '../../lib/coach/coaches';
import { estimateRatings } from '../../lib/analysis/gameRating';
import { openingName } from '../../lib/analysis/book';

const LABEL_COLOR: Record<MoveLabel, string> = {
  book: 'rgba(160,128,90,0.85)', brilliant: 'rgba(178,110,224,0.85)', great: 'rgba(74,127,212,0.85)', best: 'rgba(46,157,99,0.85)',
  excellent: 'rgba(90,164,105,0.85)', good: 'rgba(138,154,123,0.85)', inaccuracy: 'rgba(224,160,48,0.85)',
  mistake: 'rgba(226,118,40,0.85)', missedWin: 'rgba(214,84,120,0.85)', blunder: 'rgba(208,64,56,0.9)',
};

function moverPov(s: Score, c: 'w' | 'b'): Score {
  return c === 'w' ? s : { cp: s.cp !== undefined ? -s.cp : undefined, mate: s.mate !== undefined ? -s.mate : undefined };
}

export function annotatedPgn(game: SavedGame, evals: MoveEval[], lang: 'ar' | 'en'): string {
  const c = new Chess();
  c.loadPgn(game.pgn);
  const headers = c.getHeaders();
  const moves = c.history();
  const out = new Chess();
  for (const [k, v] of Object.entries(headers)) if (v) out.setHeader(k, v);
  out.setHeader('Annotator', 'Chess Grandmaster Academy (Stockfish, offline)');
  moves.forEach((san, i) => {
    out.move(san);
    const e = evals.find((x) => x.ply === i + 1);
    if (!e) return;
    const ev = e.playedScore.mate !== undefined ? `#${e.playedScore.mate}` : ((e.playedScore.cp ?? 0) / 100).toFixed(2);
    let text = `[%eval ${ev}] ${LABEL_SYMBOL[e.label]} ${LABEL_TEXT[lang][e.label]}`;
    if (e.bestSan && e.bestSan !== e.san && !['best', 'brilliant', 'great'].includes(e.label)) text += `. ${lang === 'ar' ? 'الأفضل' : 'Best'}: ${e.bestSan}`;
    out.setComment(text);
  });
  let pgn = out.pgn();
  const r = headers.Result ?? '*';
  if (!pgn.trimEnd().endsWith(r)) pgn = pgn.trimEnd() + ' ' + r;
  return pgn;
}

export function Analysis({ gameId }: { gameId: number }) {
  const { t, settings, go, profile } = useApp();
  const L = settings.lang;
  const [game, setGame] = useState<SavedGame | null>(null);
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');

  const reload = async () => {
    const g = (await getGame(gameId)) ?? null;
    setGame(g);
    if (g) setOrientation(g.imported ? 'w' : g.userColor);
    setAnalysis((await getAnalysis(gameId)) ?? null);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [gameId]);
  useEffect(() => subscribe((j) => {
    setJob(j && j.gameId === gameId ? j : null);
    if (j && j.gameId === gameId && j.finished) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [gameId]);

  const { fens, moves } = useMemo(() => {
    if (!game) return { fens: [] as string[], moves: [] as Move[] };
    const c = new Chess();
    c.loadPgn(game.pgn);
    const v = c.history({ verbose: true });
    return { fens: [v[0]?.before ?? c.fen(), ...v.map((m) => m.after)], moves: v };
  }, [game]);

  useEffect(() => {
    if (game && settings.autoAnalyze && analysis?.kind !== 'full' && !job) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, analysis]);

  if (!game) return <div className="screen"><p className="muted">…</p></div>;

  const evals = analysis?.evals ?? [];
  const ev = ply > 0 ? evals.find((e) => e.ply === ply) ?? null : null;
  const summary = evals.length ? summarize(evals) : null;
  const curve: Score[] = analysis?.curve ?? (evals.length ? [evals[0].bestScore, ...evals.map((e) => e.playedScore)] : []);
  const posScore: Score | null = curve[ply] ?? null;
  const running = !!job && !job.finished && !job.cancelled;
  const headerRatings = (() => {
    const w = Number(/\[WhiteElo "(\d+)"\]/.exec(game.pgn)?.[1]), b = Number(/\[BlackElo "(\d+)"\]/.exec(game.pgn)?.[1]);
    if (w && b) return { w, b };
    // own games: your profile rating (if you entered one) for your side
    if (!game.imported && profile?.rating) return game.userColor === 'w' ? { w: profile.rating, b: null } : { w: null, b: profile.rating };
    return null;
  })();
  const start = () => runFullAnalysis(gameId, game.pgn, settings.analysisDepth, settings.analysisMoveTimeMs, STRICTNESS[settings.strictness], headerRatings);
  const est = evals.length ? estimateRatings(evals, headerRatings ?? {}) : null;
  const op = openingName(moves.map((m) => m.san));

  const last = ply > 0 ? moves[ply - 1] : null;
  const arrows: Arrow[] = [];
  const highlights: { sq: Square; color: string }[] = [];
  if (ev && last) {
    highlights.push({ sq: last.to as Square, color: (LABEL_COLOR[ev.label] ?? 'rgba(128,128,128,0.85)').replace(/0\.\d+\)$/, '0.45)') });
    if (settings.showArrows && ev.bestUci && ev.bestUci !== ev.uci)
      arrows.push({ from: ev.bestUci.slice(0, 2) as Square, to: ev.bestUci.slice(2, 4) as Square, color: 'rgba(46,157,99,0.8)' });
  }
  const userColor = game.userColor;
  const opponentName = game.opponent.kind === 'coach' ? coachById(game.opponent.id)?.name[L] ?? '' : game.userColor === 'w' ? game.black : game.white;
  const ex = ev
    ? explain({ lang: L, label: ev.label, played: ev.played, best: ev.best, bestSan: ev.bestSan, before: moverPov(ev.bestScore, ev.color), after: moverPov(ev.playedScore, ev.color), replySan: ev.replySan, phase: ev.phase })
    : null;
  const key = evals.filter((e) => ['brilliant', 'great', 'mistake', 'blunder', 'missedWin'].includes(e.label));

  return (
    <div className="screen play has-dock">
      <div className="row between">
        <h1>{t('analysisTitle')}</h1>
        <button className="btn" onClick={() => go({ name: 'games', openId: undefined })}>{t('close')}</button>
      </div>
      <div className="muted small"><bdi>{game.white}</bdi> – <bdi>{game.black}</bdi> <span dir="ltr">{game.result}</span></div>
      {op && <div className="small" data-testid="opening-name"><span className="muted">{t('opening')}:</span> <span dir="ltr">{op.eco} {op.name}</span></div>}

      <div className="board-row with-bar">
        <EvalBar score={posScore} orientation={orientation} />
        <Board
          fen={fens[ply]} orientation={orientation} movable={null}
          targets={() => []} needsPromotion={() => false} onMove={() => false}
          lastMove={last ? [last.from as Square, last.to as Square] : null}
          arrows={arrows} highlights={highlights}
          themeId={settings.boardTheme} pieceSet={settings.pieceSet}
          coordinates={settings.coordinates} showLegal={false} showLastMove={false}
          animationMs={settings.animationMs}
        />
      </div>
      <div className="row gap center" dir="ltr">
        <button className="btn" onClick={() => setPly(0)}>⏮</button>
        <button className="btn" onClick={() => setPly(Math.max(0, ply - 1))} data-testid="a-prev">◀</button>
        <span className="muted">{ply}/{moves.length}</span>
        <button className="btn" onClick={() => setPly(Math.min(moves.length, ply + 1))} data-testid="a-next">▶</button>
        <button className="btn" onClick={() => setPly(moves.length)}>⏭</button>
        <button className="btn" onClick={() => setOrientation(orientation === 'w' ? 'b' : 'w')}>⇅</button>
      </div>
      {curve.length > 1 && <EvalGraph curve={curve} current={ply} onPick={setPly} />}
      <Dock testId="move-panel" resetKey={ply} title={<span className="muted">{t('dock_explain')}</span>}>
        {ev && ex ? (
          <>
            <div className="row gap">
              <span className={'lb lb-' + ev.label} data-testid="move-label">{LABEL_SYMBOL[ev.label]} {LABEL_TEXT[L][ev.label]}</span>
              <b dir="ltr">{Math.ceil(ev.ply / 2)}{ev.color === 'w' ? '.' : '…'} {ev.san}</b>
              <span className="muted small" dir="ltr">{formatScore(ev.playedScore)}</span>
            </div>
            <p>{ex.headline}</p>
            {ex.reasons.map((r, i) => <p key={i} className="small">• {r}</p>)}
            {ex.better && <p className="small"><b>{ex.better}</b></p>}
            {ev.bestLineSan.length > 0 && <p className="small muted"><span>{t('line')}:</span> <span dir="ltr">{ev.bestLineSan.join(' ')}</span></p>}
          </>
        ) : (
          <p className="muted small">{ply === 0 ? t('startPosition') + ' — ' : ''}{evals.length ? t('selectMove') : t('noAnalysis')}</p>
        )}
      </Dock>


      <div className="card">
        {running ? (
          <div className="row gap between">
            <span data-testid="progress">{t('analyzing', { done: job!.done, total: job!.total })}</span>
            <button className="btn" onClick={cancelAnalysis}>{t('stop')}</button>
          </div>
        ) : (
          <div className="row gap wrap between">
            <span className="muted small">
              {!analysis ? t('noAnalysis') : analysis.kind === 'live' ? t('liveAnalysisNote') : t('fullAnalysisNote', { depth: analysis.depth })}
            </span>
            <button className="btn primary" onClick={start} data-testid="run-analysis">{analysis?.kind === 'full' ? t('rerunAnalysis') : t('runAnalysis')}</button>
          </div>
        )}
      </div>

      {summary && (
        <div className="card">
          <div className="acc-row" data-testid="game-ratings">
            {(['w', 'b'] as const).map((c) => (
              <div key={c}>
                <span className="muted small">{game.imported ? (c === 'w' ? game.white : game.black) : c === userColor ? t('you') : opponentName || t('player')} ({c === 'w' ? t('white') : t('black')})</span>
                <b>{summary[c].accuracy ?? '—'}%</b>
                <span className="small" data-testid={'gr-' + c}>{t('gameRating')}: {est?.[c] ? <b dir="ltr">{est[c]!.rating} ±{est[c]!.plusMinus}</b> : t('grNeedMoves')}</span>
              </div>
            ))}
          </div>
          <p className="muted tiny">{t('gameRatingNote')}{!headerRatings && ' ' + t('gameRatingNoPrior')}</p>
          <LabelTable summary={summary} userColor={userColor} coachName={opponentName || t('player')} names={game.imported ? { w: game.white, b: game.black } : undefined} />
        </div>
      )}

      {key.length > 0 && (
        <div className="card">
          <h2>{t('keyMoments')}</h2>
          <ul className="list">
            {key.map((e) => (
              <li key={e.ply} onClick={() => setPly(e.ply)}>
                <span><span className={'lb lb-' + e.label}>{LABEL_SYMBOL[e.label]}</span> <span dir="ltr">{Math.ceil(e.ply / 2)}{e.color === 'w' ? '.' : '…'} {e.san}</span></span>
                <span className="muted small">{game.imported ? (e.color === 'w' ? game.white : game.black) : e.color === userColor ? t('you') : opponentName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card moves" dir="ltr" data-testid="a-moves">
        <div className="mv-grid">
          {Array.from({ length: Math.ceil(moves.length / 2) }, (_, r) => (
            <div className="mv-row" key={r}>
              <span className="mv-n">{r + 1}.</span>
              {[2 * r + 1, 2 * r + 2].map((p) => {
                const m = moves[p - 1];
                if (!m) return <span key={p} />;
                const e = evals.find((x) => x.ply === p);
                return (
                  <span key={p} className={'mv' + (ply === p ? ' cur' : '')} onClick={() => setPly(p)}>
                    {m.san}{e && <sup className={'lbt lb-' + e.label}>{LABEL_SYMBOL[e.label]}</sup>}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {evals.length > 0 && (
        <button className="btn" onClick={() => saveTextFile(`analysis-${gameId}.pgn`, annotatedPgn(game, evals, L), 'application/x-chess-pgn')} data-testid="export-annotated">
          {t('exportAnnotated')}
        </button>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import { useApp } from '../AppContext';
import { Board, type Arrow } from '../board/Board';
import { EvalBar, EvalGraph } from './EvalBar';
import { CoachPortrait } from '../coach/Emblem';
import { getAnalysis, getGame, getSetting, setSetting } from '../../lib/storage/repo';
import type { SavedGame, StoredAnalysis } from '../../lib/storage/db';
import { summarize, type MoveEval } from '../../lib/analysis/analyzer';
import { explain, LABEL_SYMBOL, LABEL_TEXT } from '../../lib/analysis/explain';
import { STRICTNESS, type MoveLabel } from '../../lib/analysis/classify';
import { lichessAccuracy, winPercent, cpOf } from '../../lib/analysis/accuracy';
import { formatScore, toWhitePov, type Score } from '../../lib/engine/uci';
import { getEngine } from '../../lib/engine/engine';
import { cancelAnalysis, runFullAnalysis, subscribe, type Job } from '../../lib/analysis/runner';
import { saveTextFile } from '../../lib/files';
import { COACHES, coachById } from '../../lib/coach/coaches';
import { estimateRatings } from '../../lib/analysis/gameRating';
import { openingName } from '../../lib/analysis/book';
import { checkedKingSquare } from '../../lib/chess/game';
import type { Lang } from '../../lib/settings';

/** Colour and glyph of each classification (our own palette, used for the badges and the table). */
export const LABEL_META: Record<MoveLabel, { color: string; glyph: string }> = {
  brilliant: { color: '#26b5a8', glyph: '!!' },
  great: { color: '#5b8fc7', glyph: '!' },
  best: { color: '#7cb342', glyph: '★' },
  excellent: { color: '#8fbf4f', glyph: '✔' },
  good: { color: '#9ab87a', glyph: '✓' },
  book: { color: '#b08d68', glyph: '≣' },
  inaccuracy: { color: '#f2c14e', glyph: '?!' },
  mistake: { color: '#f39a4c', glyph: '?' },
  missedWin: { color: '#ec6b5e', glyph: '✕' },
  blunder: { color: '#e24a3b', glyph: '??' },
};
const ALL_LABELS: MoveLabel[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'missedWin', 'blunder'];
const BAD: MoveLabel[] = ['inaccuracy', 'mistake', 'missedWin', 'blunder'];

export function LabelIcon({ label, size = 26 }: { label: MoveLabel; size?: number }) {
  const m = LABEL_META[label];
  return <span className="lbi" style={{ background: m.color, width: size, height: size, fontSize: size * (m.glyph.length > 1 ? 0.42 : 0.55) }} aria-hidden>{m.glyph}</span>;
}

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

/** What the coach says about the whole game, from the side the student played. */
function overallComment(L: Lang, acc: number | null, s: ReturnType<typeof summarize>[ 'w' ], won: boolean | null): string {
  const blunders = s.counts.blunder + s.counts.missedWin, mistakes = s.counts.mistake, shiny = s.counts.brilliant + s.counts.great;
  const ar: string[] = [], en: string[] = [];
  if (acc === null) { ar.push('لنراجع مباراتك نقلة نقلة.'); en.push('Let’s go through your game move by move.'); }
  else if (acc >= 90) { ar.push(`مباراة قوية جدًا! دقتك ${acc}%.`); en.push(`A very strong game! Your accuracy was ${acc}%.`); }
  else if (acc >= 80) { ar.push(`لعبت بشكل جيد، دقتك ${acc}%.`); en.push(`You played well — ${acc}% accuracy.`); }
  else if (acc >= 65) { ar.push(`مباراة فيها لحظات جيدة وأخطاء يمكن تجنبها (دقتك ${acc}%).`); en.push(`Some good moments and some avoidable errors (${acc}% accuracy).`); }
  else { ar.push(`كانت مباراة صعبة (دقتك ${acc}%)، لكن فيها دروس مفيدة.`); en.push(`A tough game (${acc}% accuracy), but there is a lot to learn from it.`); }
  if (shiny) { ar.push(`وجدت ${shiny} ${shiny === 1 ? 'نقلة مميزة' : 'نقلات مميزة'} 👏.`); en.push(`You found ${shiny} standout move${shiny === 1 ? '' : 's'} 👏.`); }
  if (blunders) { ar.push(`انتبه: ${blunders} ${blunders === 1 ? 'خطأ كبير' : 'أخطاء كبيرة'} غيّرت مجرى المباراة.`); en.push(`Careful: ${blunders} big error${blunders === 1 ? '' : 's'} changed the course of the game.`); }
  else if (mistakes) { ar.push(`عندك ${mistakes} ${mistakes === 1 ? 'خطأ' : 'أخطاء'} سنراها معًا.`); en.push(`There ${mistakes === 1 ? 'is 1 mistake' : `are ${mistakes} mistakes`} we will look at.`); }
  else { ar.push('بلا أخطاء كبيرة — رائع.'); en.push('No big errors — great.'); }
  if (won === true) { ar.push('ومبروك الفوز!'); en.push('And congratulations on the win!'); }
  return (L === 'ar' ? ar : en).join(' ');
}

async function scoreAfter(fen: string): Promise<Score | null> {
  try {
    const g = new Chess(fen);
    if (g.isCheckmate()) return { mate: g.turn() === 'w' ? -1 : 1 };
    if (g.isGameOver()) return { cp: 0 };
    const r = await getEngine().search(fen, { depth: 14, movetime: 4000 }, { multipv: 1 });
    return r.lines[0] ? toWhitePov(r.lines[0].score, g.turn()) : null;
  } catch { return null; }
}

type Mode = 'summary' | 'review';
type View = 'played' | 'best' | 'show' | 'retry';

export function Analysis({ gameId, autostart }: { gameId: number; autostart?: boolean }) {
  const { t, settings, go, profile } = useApp();
  const L = settings.lang;
  const [game, setGame] = useState<SavedGame | null>(null);
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [ply, setPly] = useState(0);
  const [mode, setMode] = useState<Mode>('summary');
  const [view, setView] = useState<View>('played');
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [coachId, setCoachId] = useState<string>('carlsen');
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState<{ fen: string; state: 'idle' | 'checking' | 'right' | 'ok' | 'wrong'; san?: string; last?: [Square, Square] } | null>(null);
  const [showAll, setShowAll] = useState(true);
  const stripRef = useRef<HTMLDivElement>(null);

  const reload = async () => {
    const g = (await getGame(gameId)) ?? null;
    setGame(g);
    if (g) {
      setOrientation(g.userColor);
      if (g.opponent.kind === 'coach' && coachById(g.opponent.id)) setCoachId(g.opponent.id);
      else setCoachId(await getSetting<string>('reviewCoach', 'carlsen'));
    }
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
    if (game && (settings.autoAnalyze || autostart) && analysis?.kind !== 'full' && !job) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, analysis]);
  useEffect(() => { setView('played'); setRetry(null); setMore(false); }, [ply, mode]);
  useEffect(() => {
    const el = stripRef.current?.querySelector('.gr-mv.cur') as HTMLElement | null;
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [ply, mode]);

  if (!game) return <div className="screen"><p className="muted">…</p></div>;

  const coach = coachById(coachId) ?? COACHES[0];
  const evals = analysis?.evals ?? [];
  const evalOf = (p: number) => evals.find((e) => e.ply === p) ?? null;
  const ev = ply > 0 ? evalOf(ply) : null;
  const summary = evals.length ? summarize(evals) : null;
  const curve: Score[] = analysis?.curve ?? (evals.length ? [evals[0].bestScore, ...evals.map((e) => e.playedScore)] : []);
  const running = !!job && !job.finished && !job.cancelled;
  const headerRatings = (() => {
    const w = Number(/\[WhiteElo "(\d+)"\]/.exec(game.pgn)?.[1]), b = Number(/\[BlackElo "(\d+)"\]/.exec(game.pgn)?.[1]);
    if (w && b) return { w, b };
    if (!game.imported && profile?.rating) return game.userColor === 'w' ? { w: profile.rating, b: null } : { w: null, b: profile.rating };
    return null;
  })();
  const start = () => runFullAnalysis(gameId, game.pgn, settings.analysisDepth, settings.analysisMoveTimeMs, STRICTNESS[settings.strictness], headerRatings);
  const est = evals.length ? estimateRatings(evals, headerRatings ?? {}) : null;
  const op = openingName(moves.map((m) => m.san));
  const me = game.userColor, them: 'w' | 'b' = me === 'w' ? 'b' : 'w';
  const opponentName = game.opponent.kind === 'coach' ? coachById(game.opponent.id)?.name[L] ?? '' : me === 'w' ? game.black : game.white;
  const nameOf = (c: 'w' | 'b') => (game.imported ? (c === 'w' ? game.white : game.black) : c === me ? (profile?.name ?? t('you')) : opponentName || t('player'));
  const won = game.result === '1-0' ? me === 'w' : game.result === '0-1' ? me === 'b' : null;
  const fullAnalysed = analysis?.kind === 'full' && evals.length === moves.length && moves.length > 0;

  // per-phase accuracy (Lichess move accuracies, grouped by game phase)
  const phases = (() => {
    if (!fullAnalysed) return null;
    const sorted = [...evals].sort((a, b) => a.ply - b.ply);
    const acc = lichessAccuracy(sorted.map((e) => e.playedScore), sorted[0].color).perMove;
    const out: Record<'opening' | 'middlegame' | 'endgame', { w: number[]; b: number[] }> = { opening: { w: [], b: [] }, middlegame: { w: [], b: [] }, endgame: { w: [], b: [] } };
    sorted.forEach((e, i) => out[e.phase][e.color].push(acc[i]));
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    return (['opening', 'middlegame', 'endgame'] as const).map((k) => ({ k, w: avg(out[k].w), b: avg(out[k].b) })).filter((x) => x.w !== null || x.b !== null);
  })();

  const cycleCoach = () => {
    if (game.opponent.kind === 'coach') return;
    const i = COACHES.findIndex((c) => c.id === coachId);
    const next = COACHES[(i + 1) % COACHES.length].id;
    setCoachId(next);
    setSetting('reviewCoach', next);
  };

  const header = (
    <div className="gr-top">
      <button className="gr-icon" onClick={() => (mode === 'review' ? setMode('summary') : go({ name: 'games', openId: undefined }))} aria-label={t('back')}>{L === 'ar' ? '→' : '←'}</button>
      <h1>{t('gr_title')}</h1>
      <div className="row gap">
        {mode === 'review' && <button className="gr-icon" onClick={() => setMode('summary')} aria-label={t('gr_summary')} data-testid="gr-summary-btn">▤</button>}
        <button className="gr-icon" onClick={() => setOrientation(orientation === 'w' ? 'b' : 'w')} aria-label={t('flip')}>⇅</button>
      </div>
    </div>
  );

  const bubble = (head: React.ReactNode, body: React.ReactNode, testId?: string) => (
    <div className="gr-coach" data-testid={testId}>
      <button className="gr-avatar" onClick={cycleCoach} title={coach.name[L]} aria-label={coach.name[L]}><CoachPortrait coach={coach} size={64} round /></button>
      <div className="gr-bubble">
        {head && <div className="gr-bubble-head">{head}</div>}
        <div className="gr-bubble-body">{body}</div>
      </div>
    </div>
  );

  // ---------------- progress / not analysed ----------------
  const analysisCard = running ? (
    <div className="card gr-progress">
      <div className="gr-ring" style={{ ['--p' as string]: `${Math.round((job!.done / Math.max(1, job!.total)) * 100)}` }}><span>{Math.round((job!.done / Math.max(1, job!.total)) * 100)}%</span></div>
      <div style={{ flex: 1 }}>
        <div data-testid="progress">{t('analyzing', { done: job!.done, total: job!.total })}</div>
        <div className="tiny muted">{t('gr_depth', { d: settings.analysisDepth })}</div>
      </div>
      <button className="btn small" onClick={cancelAnalysis}>{t('stop')}</button>
    </div>
  ) : (
    <div className="row gap wrap between gr-runrow">
      <span className="muted small">
        {!analysis ? t('noAnalysis') : analysis.kind === 'live' ? t('liveAnalysisNote') : t('fullAnalysisNote', { depth: analysis.depth })}
      </span>
      <button className={'btn ' + (fullAnalysed ? 'small' : 'primary')} onClick={start} data-testid="run-analysis">{analysis?.kind === 'full' ? t('rerunAnalysis') : t('runAnalysis')}</button>
    </div>
  );

  // ================= SUMMARY =================
  if (mode === 'summary') {
    const s = summary;
    return (
      <div className="screen gr">
        {header}
        {bubble(null, running ? t('gr_working') : s ? overallComment(L, s[me].accuracy, s[me], won) : t('gr_notYet'), 'gr-overall')}
        {curve.length > 1 && <div className="gr-graph"><EvalGraph curve={curve} current={ply} onPick={(p) => { setPly(Math.max(1, p)); setMode('review'); }} /></div>}
        <div className="card gr-players">
          <div className="gr-prow">
            <span />
            {(['w', 'b'] as const).map((c) => (
              <div key={c} className="gr-pname"><span className={'gr-dot ' + c} /><bdi>{nameOf(c)}</bdi></div>
            ))}
          </div>
          {op && <div className="small center muted" data-testid="opening-name"><span dir="ltr">{op.eco} {op.name}</span></div>}
          {s && (
            <>
              <div className="gr-prow gr-accrow" data-testid="game-ratings">
                <span className="gr-rowlabel">{t('accuracy')}</span>
                {(['w', 'b'] as const).map((c) => <div key={c} className={'gr-box ' + c} data-testid={'acc-' + c}>{s[c].accuracy ?? '—'}</div>)}
              </div>
              <div className="gr-table" data-testid="label-table">
                {(showAll ? ALL_LABELS : ALL_LABELS.filter((l) => s.w.counts[l] + s.b.counts[l] > 0)).map((l) => (
                  <div className="gr-trow" key={l}>
                    <span className="gr-rowlabel">{LABEL_TEXT[L][l]}</span>
                    <b style={{ color: LABEL_META[l].color }}>{s.w.counts[l]}</b>
                    <LabelIcon label={l} />
                    <b style={{ color: LABEL_META[l].color }}>{s.b.counts[l]}</b>
                  </div>
                ))}
                <button className="gr-collapse" onClick={() => setShowAll(!showAll)} aria-label="toggle">{showAll ? '⌃' : '⌄'}</button>
              </div>
              <div className="gr-prow gr-accrow">
                <span className="gr-rowlabel">{t('gameRating')}</span>
                {(['w', 'b'] as const).map((c) => (
                  <div key={c} className={'gr-box ' + c} data-testid={'gr-' + c}>{est?.[c] ? <><span dir="ltr">{est[c]!.rating}</span><span className="gr-pm" dir="ltr"> ±{est[c]!.plusMinus}</span></> : <span className="gr-need">{t('grNeedMoves')}</span>}</div>
                ))}
              </div>
              {est && (est.w || est.b) && <p className="tiny muted center">{t('gameRatingNote')}{!headerRatings && ' ' + t('gameRatingNoPrior')}</p>}
              {phases && phases.length > 0 && (
                <>
                  <h2 className="center-h">{t('gr_phases')}</h2>
                  {phases.map((p) => (
                    <div className="gr-trow" key={p.k}>
                      <span className="gr-rowlabel">{t(('phase_' + p.k) as never)}</span>
                      <b>{p.w ?? '—'}</b>
                      <span className="gr-phase-ic">{p.k === 'opening' ? '≣' : p.k === 'middlegame' ? '⚔' : '♔'}</span>
                      <b>{p.b ?? '—'}</b>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
        {analysisCard}
        {s && (() => {
          const key = evals.filter((e) => ['brilliant', 'great', 'mistake', 'blunder', 'missedWin'].includes(e.label));
          return key.length > 0 && (
            <div className="card">
              <h2>{t('keyMoments')}</h2>
              <div className="gr-keys">
                {key.map((e) => (
                  <button key={e.ply} className="gr-key" onClick={() => { setPly(e.ply); setMode('review'); }}>
                    <LabelIcon label={e.label} size={22} /> <span dir="ltr">{Math.ceil(e.ply / 2)}{e.color === 'w' ? '.' : '…'} {e.san}</span>
                    <span className="tiny muted">{nameOf(e.color)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        <div className="gr-two">
          {evals.length > 0 && <button className="btn" onClick={() => saveTextFile(`analysis-${gameId}.pgn`, annotatedPgn(game, evals, L), 'application/x-chess-pgn')} data-testid="export-annotated">⤴ {t('exportAnnotated')}</button>}
          <button className="btn" onClick={() => go({ name: 'play' })}>＋ {t('gr_newGame')}</button>
        </div>
        <div className="gr-bottom">
          <button className="btn gr-next" onClick={() => { setPly(ply || 1); setMode('review'); }} disabled={!moves.length} data-testid="gr-start">{ply ? t('gr_continue') : t('gr_start')}</button>
        </div>
      </div>
    );
  }

  // ================= REVIEW =================
  const last = ply > 0 ? moves[ply - 1] : null;
  const showBest = view === 'best' && ev?.bestUci && ev.bestUci !== ev.uci;
  let boardFen = fens[ply];
  let lastSq: [Square, Square] | null = last ? [last.from as Square, last.to as Square] : null;
  const arrows: Arrow[] = [];
  const highlights: { sq: Square; color: string }[] = [];
  let badge: { sq: Square; color: string; text: string } | null = null;
  if (ev && last) {
    const meta = LABEL_META[ev.label];
    if (view === 'retry' && retry) {
      boardFen = retry.fen;
      lastSq = retry.last ?? null;
      if (retry.last) {
        const col = retry.state === 'right' || retry.state === 'ok' ? LABEL_META.best.color : retry.state === 'wrong' ? LABEL_META.mistake.color : '#999999';
        highlights.push({ sq: retry.last[0], color: col + '66' }, { sq: retry.last[1], color: col + '88' });
        if (retry.state !== 'checking' && retry.state !== 'idle') badge = { sq: retry.last[1], color: col, text: retry.state === 'wrong' ? '✕' : '★' };
      }
    } else if (showBest) {
      boardFen = ev.fenBefore;
      const from = ev.bestUci!.slice(0, 2) as Square, to = ev.bestUci!.slice(2, 4) as Square;
      lastSq = null;
      arrows.push({ from, to, color: 'rgba(124,179,66,0.9)' });
      highlights.push({ sq: from, color: '#7cb34255' });
      badge = { sq: to, color: LABEL_META.best.color, text: '★' };
    } else {
      highlights.push({ sq: last.from as Square, color: meta.color + '55' }, { sq: last.to as Square, color: meta.color + '99' });
      badge = { sq: last.to as Square, color: meta.color, text: meta.glyph };
      if (view === 'show' && ev.replySan.length) {
        try {
          const g = new Chess(fens[ply]);
          const m = g.move(ev.replySan[0]);
          arrows.push({ from: m.from as Square, to: m.to as Square, color: 'rgba(226,74,59,0.85)' });
          if (ev.replySan[1]) { const m2 = g.move(ev.replySan[1]); arrows.push({ from: m2.from as Square, to: m2.to as Square, color: 'rgba(91,143,199,0.8)' }); }
        } catch { /* line no longer legal */ }
      } else if (settings.showArrows && ev.bestUci && ev.bestUci !== ev.uci && BAD.includes(ev.label)) {
        arrows.push({ from: ev.bestUci.slice(0, 2) as Square, to: ev.bestUci.slice(2, 4) as Square, color: 'rgba(124,179,66,0.85)' });
      }
    }
  }
  const posScore: Score | null = ev ? (view === 'best' ? ev.bestScore : ev.playedScore) : curve[ply] ?? null;
  const ex = ev
    ? explain({ lang: L, label: ev.label, played: ev.played, best: ev.best, bestSan: ev.bestSan, before: moverPov(ev.bestScore, ev.color), after: moverPov(ev.playedScore, ev.color), replySan: ev.replySan, phase: ev.phase })
    : null;
  const evalBadge = (s: Score) => {
    const v = cpOf(s);
    return <span className={'gr-eval ' + (v >= 0 ? 'w' : 'b')} dir="ltr">{formatScore(s)}</span>;
  };
  const moveNo = (e: { ply: number; color: 'w' | 'b' }) => `${Math.ceil(e.ply / 2)}${e.color === 'w' ? '.' : '…'}`;

  const startRetry = () => { if (ev) { setView('retry'); setRetry({ fen: ev.fenBefore, state: 'idle' }); } };
  const onRetryMove = (from: Square, to: Square, promotion?: string) => {
    if (!ev || !retry || retry.state === 'checking') return false;
    const g = new Chess(ev.fenBefore);
    let m: Move;
    try { m = g.move({ from, to, promotion: promotion ?? 'q' }); } catch { return false; }
    const uci = from + to + (m.promotion ?? '');
    setRetry({ fen: g.fen(), state: 'checking', san: m.san, last: [from, to] });
    (async () => {
      if (uci === ev.bestUci) { setRetry({ fen: g.fen(), state: 'right', san: m.san, last: [from, to] }); return; }
      const after = await scoreAfter(g.fen());
      const wb = ev.color === 'w' ? winPercent(cpOf(ev.bestScore)) : 100 - winPercent(cpOf(ev.bestScore));
      const wa = after ? (ev.color === 'w' ? winPercent(cpOf(after)) : 100 - winPercent(cpOf(after))) : 0;
      setRetry({ fen: g.fen(), state: wb - wa <= 4 ? 'ok' : 'wrong', san: m.san, last: [from, to] });
    })();
    return true;
  };

  let head: React.ReactNode = null, body: React.ReactNode = null;
  if (!ev) {
    head = <span className="gr-hl">{ply === 0 ? t('startPosition') : t('noAnalysis')}</span>;
    body = <span className="muted">{evals.length ? t('gr_tapNext') : t('noAnalysis')}</span>;
  } else if (view === 'retry' && retry) {
    head = <><span className="gr-hl">{t('gr_retryTitle')}</span></>;
    body = retry.state === 'idle' ? t('gr_retryHint', { side: ev.color === 'w' ? t('white') : t('black') })
      : retry.state === 'checking' ? t('quizChecking')
        : retry.state === 'right' ? <span className="gr-okt">✅ {t('gr_retryRight', { san: retry.san ?? '' })}</span>
          : retry.state === 'ok' ? <span className="gr-okt">👍 {t('gr_retryOk', { san: retry.san ?? '' })}</span>
            : <span className="gr-badt">❌ {t('gr_retryWrong', { san: retry.san ?? '' })}</span>;
  } else if (showBest) {
    head = <><LabelIcon label="best" /><b dir="ltr">{ev.bestSan}</b><span>{t('gr_wasBest')}</span>{evalBadge(ev.bestScore)}</>;
    body = <>{ex?.better ?? ''}{ev.bestLineSan.length > 0 && <div className="small muted"><span dir="ltr">{ev.bestLineSan.slice(0, 6).join(' ')}</span></div>}</>;
  } else {
    head = <><LabelIcon label={ev.label} /><b dir="ltr" data-testid="move-label-san">{ev.san}</b><span data-testid="move-label">{LABEL_TEXT[L][ev.label]}</span>{evalBadge(ev.playedScore)}</>;
    body = (
      <>
        <div>{ex?.headline}</div>
        {view === 'show' && ev.replySan.length > 0 && <div className="small"><b>{t('gr_threat')}:</b> <span dir="ltr">{ev.replySan.slice(0, 4).join(' ')}</span></div>}
        {more && ex && (
          <div className="small">
            {ex.reasons.map((r, i) => <div key={i}>• {r}</div>)}
            {ex.better && BAD.includes(ev.label) && <div><b>{ex.better}</b></div>}
          </div>
        )}
        {ex && (ex.reasons.length > 0 || ex.better) && <button className="gr-more" onClick={() => setMore(!more)}>{more ? t('gr_less') : t('gr_more')}</button>}
      </>
    );
  }

  const canRetry = !!ev && BAD.includes(ev.label) && !!ev.bestUci;
  const next = () => { if (ply >= moves.length) setMode('summary'); else setPly(ply + 1); };
  return (
    <div className="screen gr gr-review">
      {header}
      {bubble(head, body, 'move-panel')}
      <div className="board-row with-bar">
        <EvalBar score={posScore} orientation={orientation} />
        <Board
          fen={boardFen} orientation={orientation}
          movable={view === 'retry' && retry && (retry.state === 'idle' || retry.state === 'wrong') && retry.fen === ev?.fenBefore ? ev!.color : null}
          targets={(from) => (view === 'retry' && ev ? new Chess(ev.fenBefore).moves({ square: from, verbose: true }).map((m) => m.to as Square) : [])}
          needsPromotion={(f, to) => { const pc = ev ? new Chess(ev.fenBefore).get(f) : null; return !!pc && pc.type === 'p' && (to[1] === '8' || to[1] === '1'); }}
          onMove={onRetryMove}
          lastMove={lastSq} arrows={arrows} highlights={highlights} badge={badge} checkSquare={checkedKingSquare(new Chess(boardFen))}
          themeId={settings.boardTheme} pieceSet={settings.pieceSet} coordinates={settings.coordinates}
          showLegal={view === 'retry'} showLastMove={false} animationMs={settings.animationMs}
        />
      </div>
      <div className="gr-strip-wrap" dir="ltr">
        <button className="gr-chev" onClick={() => setPly(Math.max(0, ply - 1))} data-testid="a-prev" aria-label="previous">‹</button>
        <div className="gr-strip" ref={stripRef} data-testid="a-moves">
          {moves.map((m, i) => {
            const p = i + 1, e = evalOf(p);
            return (
              <button key={p} className={'gr-mv' + (p === ply ? ' cur' : '')} onClick={() => setPly(p)}>
                {m.color === 'w' && <span className="gr-n">{Math.ceil(p / 2)}.</span>}
                {e && ['brilliant', 'great', 'book', 'inaccuracy', 'mistake', 'missedWin', 'blunder'].includes(e.label) && <LabelIcon label={e.label} size={18} />}
                <span style={e && BAD.includes(e.label) ? { color: LABEL_META[e.label].color } : undefined}>{m.san}</span>
              </button>
            );
          })}
        </div>
        <button className="gr-chev" onClick={() => setPly(Math.min(moves.length, ply + 1))} aria-label="next">›</button>
      </div>
      {ev && <div className="tiny muted center" dir="ltr">{moveNo(ev)} {ev.san} · {nameOf(ev.color)}</div>}
      <div className="gr-actions">
        <button className={'gr-act' + (view === 'show' ? ' on' : '')} onClick={() => setView(view === 'show' ? 'played' : 'show')} disabled={!ev?.replySan.length} data-testid="gr-show">
          <span className="gr-act-ic">👁</span>{t('gr_show')}
        </button>
        <button className={'gr-act' + (view === 'best' ? ' on' : '')} onClick={() => setView(view === 'best' ? 'played' : 'best')} disabled={!ev?.bestUci || ev.bestUci === ev.uci} data-testid="gr-best">
          <span className="gr-act-ic">★</span>{t('gr_best')}
        </button>
        <button className={'gr-act' + (view === 'retry' ? ' on' : '')} onClick={() => (view === 'retry' ? setView('played') : startRetry())} disabled={!canRetry} data-testid="gr-retry">
          <span className="gr-act-ic">↻</span>{t('gr_retry')}
        </button>
        <button className="btn gr-next" onClick={next} data-testid="a-next">{ply >= moves.length ? t('gr_finish') : t('gr_next')}</button>
      </div>
      {running && <div className="tiny muted center" data-testid="progress">{t('analyzing', { done: job!.done, total: job!.total })}</div>}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { useApp } from '../AppContext';
import { Board } from '../board/Board';
import { legalTargets, isPromotion, checkedKingSquare } from '../../lib/chess/game';
import { getEngine } from '../../lib/engine/engine';
import { SECTIONS, type Puzzle } from '../../lib/puzzles/categories';
import { PuzzleStore, countIn, type PuzzleIndex } from '../../lib/puzzles/store';
import { BANDS, PROVISIONAL_RD, bandOf, expectedScore } from '../../lib/puzzles/glicko2';
import {
  attemptedIds, computeStats, getPuzzleRating, listAttempts, recordAttempt, type PuzzleRatingState, type PuzzleStats,
} from '../../lib/puzzles/progress';
import {
  expectedMove, goalOf, playSolverMove, playUci, retry, solutionSan, startPuzzle, uciOf, withHint, type Evaluate, type SolveState,
} from '../../lib/puzzles/solver';
import { ideasFor, themeName } from '../../lib/puzzles/explain';
import { getSetting, setSetting } from '../../lib/storage/repo';
import { playMoveSound } from '../../lib/sound';
import type { TKey } from '../../i18n';

// ---------- data ----------
export const puzzleStore = new PuzzleStore((path) => fetch('./data/puzzles/' + path).then((r) => {
  if (!r.ok) throw new Error('puzzle data ' + path);
  return r.text();
}));

interface Prefs { diff: 'easier' | 'normal' | 'harder'; band: string }
const DEFAULT_PREFS: Prefs = { diff: 'normal', band: 'auto' };
const DIFF_OFFSET = { easier: -250, normal: 0, harder: 250 };

const evaluate: Evaluate = async (fen) => {
  const r = await getEngine().search(fen, { depth: 14, movetime: 1500 });
  const l = r.lines[0];
  return { cp: l?.score.cp, mate: l?.score.mate, pv: l?.pv ?? [] };
};

const fmtRating = (s: { rating: number; rd: number }) => `${Math.round(s.rating)}${s.rd > PROVISIONAL_RD ? '?' : ''}`;

// ---------- home ----------
export function PuzzlesHome() {
  const { t, go, dataVersion } = useApp();
  const [all, setAll] = useState<PuzzleIndex | null>(null);
  const [rating, setRating] = useState<PuzzleRatingState | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    puzzleStore.index().then(setAll);
    getPuzzleRating().then(setRating);
    getSetting<Prefs>('puzzlePrefs', DEFAULT_PREFS).then(setPrefs);
  }, [dataVersion]);
  const savePrefs = (p: Prefs) => { setPrefs(p); setSetting('puzzlePrefs', p); };
  const band = BANDS.find((b) => b.key === prefs.band);
  const counts = useMemo(() => {
    if (!all) return null;
    const m = new Map<string, number>();
    for (const s of SECTIONS) for (const c of s.categories) m.set(c.id, countIn(all, c.id, band));
    return m;
  }, [all, band]);

  return (
    <div className="screen">
      <h1>{t('pz_title')}</h1>
      <div className="card pz-rating" data-testid="pz-home-rating">
        <div>
          <span className="muted small">{t('pz_myRating')}</span>
          <b className="big" dir="ltr">{rating ? fmtRating(rating) : '…'}</b>
          {rating && rating.rd > PROVISIONAL_RD && <span className="muted tiny">{t('pz_provisional')}</span>}
        </div>
        {rating && <div><span className="muted small">{t('pz_peak')}</span><b dir="ltr">{Math.round(rating.peak)}</b></div>}
        {rating && <div><span className="muted small">{t('pz_band')}</span><b dir="ltr">{t(bandOf(rating.rating).key as TKey)}</b></div>}
      </div>
      <div className="card">
        <label className="field"><span>{t('pz_difficulty')}</span>
          <select value={prefs.diff} onChange={(e) => savePrefs({ ...prefs, diff: e.target.value as Prefs['diff'] })} data-testid="pz-diff">
            {(['easier', 'normal', 'harder'] as const).map((d) => <option key={d} value={d}>{t(('pz_diff_' + d) as TKey)}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('pz_band')}</span>
          <select value={prefs.band} onChange={(e) => savePrefs({ ...prefs, band: e.target.value })} data-testid="pz-band">
            <option value="auto">{t('pz_bandAuto')}</option>
            {BANDS.map((b) => <option key={b.key} value={b.key}>{'\u2066' + t(b.key as TKey) + '\u2069'}</option>)}
          </select>
        </label>
        <div className="row gap wrap">
          <button className="btn primary" data-testid="pz-start" onClick={() => go({ name: 'puzzle', cat: 'c_random' })}>{t('pz_start')}</button>
          <button className="btn" data-testid="pz-stats" onClick={() => go({ name: 'puzzleStats' })}>{t('pz_stats')}</button>
        </div>
        <p className="muted small">{t('pz_ratingNote')}</p>
      </div>
      {!all && <div className="card muted">{t('pz_loading')}</div>}
      {counts && SECTIONS.map((s) => (
        <div className="card" key={s.id}>
          <h2>{t(('pz_section_' + s.id) as TKey)}</h2>
          <div className="pz-cats">
            {s.categories.map((c) => {
              const n = counts.get(c.id) ?? 0;
              return (
                <button key={c.id} className="pz-cat" disabled={n === 0} data-testid={'pz-cat-' + c.id} onClick={() => go({ name: 'puzzle', cat: c.id })}>
                  <span>{t(('pz_' + c.id) as TKey)}</span>
                  <span className="muted tiny" dir="ltr">{n}{n > 0 && n < 20 ? ` · ${t('pz_few')}` : ''}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- solving ----------
type Feedback = { kind: 'good' | 'bad' | 'info'; text: string } | null;

export function PuzzleSolve({ cat }: { cat: string }) {
  const { t, settings, go, bumpData } = useApp();
  const L = settings.lang;
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [none, setNone] = useState(false);
  const [st, setSt] = useState<SolveState | null>(null);
  const [fen, setFen] = useState<string>('');
  const [last, setLast] = useState<[Square, Square] | null>(null);
  const [rating, setRating] = useState<PuzzleRatingState | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [fb, setFb] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<{ from: Square; to?: Square } | null>(null);
  const [hints, setHints] = useState(0);
  const [moved, setMoved] = useState(false);
  const [altUsed, setAltUsed] = useState(false);
  const recorded = useRef(false);
  const t0 = useRef(0);
  const gen = useRef(0);

  const next = useCallback(async () => {
    const my = ++gen.current;
    setSt(null); setFb(null); setHint(null);
    const [r, prefs, seen] = await Promise.all([getPuzzleRating(), getSetting<Prefs>('puzzlePrefs', DEFAULT_PREFS), attemptedIds()]);
    const band = BANDS.find((b) => b.key === prefs.band);
    const p = await puzzleStore.pick(cat, r.rating + DIFF_OFFSET[prefs.diff], seen, Math.random, band);
    if (my !== gen.current) return;
    setRating(r); setChange(null); setFb(null); setHint(null); setHints(0); setMoved(false); setAltUsed(false); setBusy(false);
    recorded.current = false;
    if (!p) { setNone(true); setPuzzle(null); return; }
    setNone(false);
    setPuzzle(p);
    const s = startPuzzle(p);
    setFen(p.fen); setLast(null); setSt(null);
    // show the opponent's move that sets up the puzzle, like Lichess
    setTimeout(() => {
      if (my !== gen.current) return;
      const m = p.moves[0];
      setFen(s.fen); setLast([m.slice(0, 2) as Square, m.slice(2, 4) as Square]); setSt(s);
      if (settings.sound) playMoveSound('move');
      t0.current = Date.now();
    }, 700);
  }, [cat, settings.sound]);

  useEffect(() => { next(); return () => { gen.current++; }; }, [next]);

  const record = async (s: SolveState, result: 0 | 1 | null, completed: boolean) => {
    if (recorded.current || !puzzle) return;
    recorded.current = true;
    const { before, after } = await recordAttempt({ puzzle, result, completed, hints, timeMs: Date.now() - t0.current, category: cat });
    setRating(after);
    setChange(result === null ? null : after.rating - before.rating);
    bumpData();
    void s;
  };

  const onMove = (from: Square, to: Square, promotion?: string): boolean => {
    if (!st || st.status === 'solved' || busy) return false;
    const c = new Chess(st.fen);
    let mv;
    try { mv = c.move({ from, to, promotion }); } catch { return false; }
    if (!mv) return false;
    const uci = uciOf(mv);
    const exp = expectedMove(st);
    setMoved(true); setHint(null);
    // show the move at once; the engine may need a moment to judge an alternative
    setFen(c.fen()); setLast([from, to]);
    if (settings.sound) playMoveSound(c.inCheck() ? 'check' : mv.captured ? 'capture' : 'move');
    if (uci !== exp) { setBusy(true); setFb({ kind: 'info', text: t('pz_checking') }); }
    const my = gen.current;
    (async () => {
      const out = await playSolverMove(st, uci, evaluate);
      if (my !== gen.current) return;
      setBusy(false);
      if (!out.verdict.ok) {
        setFb({ kind: 'bad', text: t('pz_wrong') });
        setTimeout(() => { if (my === gen.current) { setFen(st.fen); setLast(null); } }, 700);
        setSt(out.state);
        record(out.state, 0, false);
        return;
      }
      const alt = out.verdict.reason !== 'solution';
      if (alt) setAltUsed(true);
      setFb({ kind: 'good', text: alt ? t('pz_correctAlt') : t('pz_correct') });
      if (out.state.status === 'solved') {
        setFen(out.state.fen); setSt(out.state);
        record(out.state, out.state.ratedResult, true);
        return;
      }
      // opponent reply after a short pause
      setTimeout(() => {
        if (my !== gen.current) return;
        const r = out.reply!;
        setFen(out.state.fen); setLast([r.slice(0, 2) as Square, r.slice(2, 4) as Square]);
        if (settings.sound) playMoveSound('move');
        setSt(out.state);
      }, 450);
    })();
    return true;
  };

  const doHint = async () => {
    if (!st || st.status === 'solved') return;
    let mv = expectedMove(st);
    if (!mv) { setBusy(true); mv = (await evaluate(st.fen)).pv[0] ?? null; setBusy(false); }
    if (!mv) return;
    const s2 = withHint(st);
    setSt(s2);
    setHints((h) => h + 1);
    setHint(hint ? { from: mv.slice(0, 2) as Square, to: mv.slice(2, 4) as Square } : { from: mv.slice(0, 2) as Square });
    setFb({ kind: 'info', text: hint ? t('pz_hintMove') : t('pz_hintPiece') });
    record(s2, 0, false);
  };

  const showSolution = async () => {
    if (!st || !puzzle) return;
    const s2 = withHint(st);
    record(s2, 0, false);
    // play the rest of the stored line (or the engine line after an alternative)
    const c = new Chess(st.fen);
    let rest: string[] = st.onBook ? puzzle.moves.slice(st.played.length) : (await evaluate(st.fen)).pv.slice(0, 2 * (st.totalSolverMoves - st.solverMovesDone) - 1);
    const my = gen.current;
    for (const u of rest) {
      await new Promise((r) => setTimeout(r, 600));
      if (my !== gen.current) return;
      try { playUci(c, u); } catch { break; }
      setFen(c.fen()); setLast([u.slice(0, 2) as Square, u.slice(2, 4) as Square]);
    }
    rest = [];
    setSt({ ...s2, fen: c.fen(), status: 'solved' });
    setFb({ kind: 'info', text: t('pz_failed') });
  };

  const skip = async () => {
    if (st && !recorded.current) await record(st, moved ? 0 : null, false);
    next();
  };

  if (none) return (
    <div className="screen"><div className="card">{t('pz_none')}</div><button className="btn" onClick={() => go({ name: 'puzzles' })}>{t('pz_title')}</button></div>
  );
  if (!puzzle) return <div className="screen"><div className="card muted">{t('pz_loading')}</div></div>;

  const goal = goalOf(puzzle);
  const goalText = goal.kind === 'mate' ? (goal.n ? t('pz_goal_mateN', { n: goal.n }) : t('pz_goal_mate')) : t(('pz_goal_' + goal.kind) as TKey);
  const solver = st?.solverColor ?? (new Chess(puzzle.fen).turn() === 'w' ? 'b' : 'w');
  const total = puzzle.moves.length / 2;
  const left = st ? st.totalSolverMoves - st.solverMovesDone : total;
  const exp = rating ? expectedScore(rating, puzzle) : null;
  const rel = exp === null ? null : exp > 0.75 ? 'pz_relEasy' : exp < 0.4 ? 'pz_relHard' : 'pz_relFair';
  const finished = st?.status === 'solved';
  const chess = new Chess(fen || puzzle.fen);

  return (
    <div className="screen play puzzle">
      <div className="card pz-top" data-testid="pz-top">
        <div><span className="muted tiny">{t('pz_myRating')}</span><b dir="ltr" data-testid="pz-user-rating">{rating ? fmtRating(rating) : '…'}</b>
          {change !== null && <span className={'pz-change ' + (change >= 0 ? 'up' : 'down')} dir="ltr" data-testid="pz-change">{change >= 0 ? '+' : ''}{Math.round(change)}</span>}
        </div>
        <div><span className="muted tiny">{t('pz_puzzleRating')}</span><b dir="ltr" data-testid="pz-puzzle-rating">{puzzle.rating}{puzzle.source === 'g' ? '?' : ''}</b>
          <bdi className="muted tiny" dir="ltr">{t(bandOf(puzzle.rating).key as TKey)}</bdi></div>
        <div><span className="muted tiny">{t('pz_difficulty')}</span><b>{rel ? t(rel as TKey) : '…'}</b>
          {exp !== null && <span className="muted tiny">{t('pz_expected', { p: Math.round(exp * 100) })}</span>}</div>
      </div>

      <div className="board-row">
        <Board
          fen={fen || puzzle.fen} orientation={solver}
          movable={st && !finished && !busy && chess.turn() === solver ? solver : null}
          targets={(sq) => legalTargets(chess, sq)}
          needsPromotion={(f, to) => isPromotion(chess, f, to)}
          onMove={onMove}
          lastMove={last}
          checkSquare={checkedKingSquare(chess)}
          arrows={hint?.to ? [{ from: hint.from, to: hint.to, color: '#3c9ae0' }] : []}
          highlights={hint ? [{ sq: hint.from, color: 'rgba(60,154,224,0.55)' }] : []}
          themeId={settings.boardTheme} pieceSet={settings.pieceSet}
          coordinates={settings.coordinates} showLegal={settings.showLegal}
          showLastMove={settings.showLastMove} animationMs={settings.animationMs}
        />
      </div>

      <div className={'status pz-fb ' + (fb?.kind ?? '')} data-testid="pz-feedback">
        {fb ? fb.text : st ? t('pz_yourTurn', { side: solver === 'w' ? t('pz_white') : t('pz_black') }) : ''}
      </div>

      <div className="card pz-info">
        <div className="facts">
          <div><span className="muted small">{t('pz_goal')}</span><b data-testid="pz-goal">{goalText}</b></div>
          <div><span className="muted small">{t('pz_solutionMoves')}</span><b dir="ltr" data-testid="pz-total">{total}</b></div>
          <div><span className="muted small">{t('pz_remaining')}</span><b dir="ltr" data-testid="pz-left">{left}</b></div>
        </div>
        <div className="row gap wrap pz-actions">
          {!finished && <button className="btn" onClick={doHint} disabled={!st || busy} data-testid="pz-hint">{t('pz_hint')}</button>}
          {!finished && st?.status === 'failed' && <button className="btn" onClick={() => { setSt(retry(st)); setFb(null); setFen(st.fen); }} data-testid="pz-retry">{t('pz_retry')}</button>}
          {!finished && st?.status === 'failed' && <button className="btn" onClick={showSolution} data-testid="pz-solution">{t('pz_showSolution')}</button>}
          {!finished && <button className="btn" onClick={skip} disabled={busy} data-testid="pz-skip">{t('pz_skip')}</button>}
          {finished && <button className="btn primary" onClick={next} data-testid="pz-next">{t('pz_next')}</button>}
        </div>
        {!finished && <p className="muted tiny">{t('pz_hintNote')} {t('pz_skipNote')}</p>}
      </div>

      {finished && (
        <div className="card pz-explain" data-testid="pz-explain">
          <h2>{st?.ratedResult === 1 ? t('pz_solved') : t('pz_failed')}</h2>
          <div className="muted small">{t('pz_ratedResult')}: {st?.ratedResult === 1 ? '✓' : st?.ratedResult === 0 ? '✗' : t('pz_unrated')}</div>
          <h3>{t('pz_solutionLine')}</h3>
          <p dir="ltr" className="pz-line">{solutionSan(puzzle).map((s, i) => (i % 2 === 0 ? <b key={i}>{s} </b> : <span key={i}>{s} </span>))}</p>
          {altUsed && <p className="muted small">{t('pz_correctAlt')}</p>}
          <h3>{t('pz_idea')}</h3>
          <ul className="bullets">
            <li>{goalText}</li>
            {ideasFor(puzzle.themes, L).map((x) => <li key={x.theme}><b>{x.name}:</b> {x.idea}</li>)}
          </ul>
          <div className="row gap wrap">{puzzle.themes.map((th) => <span className="pill" key={th}>{themeName(th, L)}</span>)}</div>
          <p className="muted tiny">{t('pz_source')}: {puzzle.source === 'g' ? t('pz_sourceGen') : puzzle.plays > 0 ? t('pz_sourceLichess', { id: puzzle.id, plays: puzzle.plays }) : t('pz_sourceLichessId', { id: puzzle.id })}</p>
        </div>
      )}
    </div>
  );
}

// ---------- statistics ----------
export function PuzzleStatsScreen() {
  const { t, settings, dataVersion } = useApp();
  const L = settings.lang;
  const [s, setS] = useState<PuzzleStats | null>(null);
  const [r, setR] = useState<PuzzleRatingState | null>(null);
  useEffect(() => {
    listAttempts().then((a) => setS(computeStats(a)));
    getPuzzleRating().then(setR);
  }, [dataVersion]);
  if (!s || !r) return <div className="screen"><div className="card muted">{t('pz_loading')}</div></div>;
  const strong = s.themes.filter((x) => x.rate >= 0.6).slice(0, 5);
  const weak = [...s.themes].reverse().filter((x) => x.rate < 0.6).slice(0, 5);
  const secs = (ms: number) => (ms < 10000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`);
  return (
    <div className="screen">
      <h1>{t('pz_stats')}</h1>
      <div className="card facts" data-testid="pz-stats">
        <div><span className="muted small">{t('pz_st_current')}</span><b dir="ltr">{fmtRating(r)}</b></div>
        <div><span className="muted small">{t('pz_st_peak')}</span><b dir="ltr">{Math.round(r.peak)}</b></div>
        <div><span className="muted small">{t('pz_st_solved')}</span><b dir="ltr" data-testid="pz-st-solved">{s.solved}</b></div>
        <div><span className="muted small">{t('pz_st_failed')}</span><b dir="ltr" data-testid="pz-st-failed">{s.failed}</b></div>
        <div><span className="muted small">{t('pz_st_skipped')}</span><b dir="ltr">{s.skipped}</b></div>
        <div><span className="muted small">{t('pz_st_rate')}</span><b dir="ltr">{s.successRate === null ? '—' : Math.round(s.successRate * 100) + '%'}</b></div>
        <div><span className="muted small">{t('pz_st_time')}</span><b dir="ltr">{s.avgTimeMs === null ? '—' : secs(s.avgTimeMs)}</b></div>
      </div>
      <div className="card">
        <h2>{t('pz_st_progress')}</h2>
        <div className="facts">
          {s.periods.map((p) => (
            <div key={p.key}><span className="muted small">{t(('pz_st_' + p.key) as TKey)}</span>
              <span>{t('pz_st_attempts', { n: p.n, s: p.solved })} · <b dir="ltr" className={p.change >= 0 ? 'up' : 'down'}>{p.change >= 0 ? '+' : ''}{Math.round(p.change)}</b></span></div>
          ))}
        </div>
        {s.history.length >= 2 && <RatingChart points={s.history.map((h) => h.rating)} label={t('pz_st_history')} />}
      </div>
      <div className="card">
        <h2>{t('pz_st_strong')}</h2>
        {strong.length ? <ul className="bullets">{strong.map((x) => <li key={x.theme}>{themeName(x.theme, L)} — <span dir="ltr">{Math.round(x.rate * 100)}% ({x.n})</span></li>)}</ul> : <p className="muted small">—</p>}
        <h2>{t('pz_st_weak')}</h2>
        {weak.length ? <ul className="bullets">{weak.map((x) => <li key={x.theme}>{themeName(x.theme, L)} — <span dir="ltr">{Math.round(x.rate * 100)}% ({x.n})</span></li>)}</ul> : <p className="muted small">—</p>}
        <p className="muted tiny">{t('pz_st_themesNote')}</p>
      </div>
      {s.rated === 0 && <div className="card muted">{t('pz_st_none')}</div>}
    </div>
  );
}

function RatingChart({ points, label }: { points: number[]; label: string }) {
  const W = 320, H = 120, pad = 6;
  const min = Math.min(...points), max = Math.max(...points);
  const span = Math.max(20, max - min);
  const xy = points.map((p, i) => [pad + (i / (points.length - 1)) * (W - 2 * pad), H - pad - ((p - min) / span) * (H - 2 * pad)]);
  return (
    <figure className="pz-chart" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" direction="ltr">
        <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" points={xy.map((p) => p.join(',')).join(' ')} />
        <text x={pad} y={12} fontSize="11" fill="var(--muted)">{Math.round(max)}</text>
        <text x={pad} y={H - 2} fontSize="11" fill="var(--muted)">{Math.round(min)}</text>
      </svg>
      <figcaption className="muted tiny">{label}</figcaption>
    </figure>
  );
}

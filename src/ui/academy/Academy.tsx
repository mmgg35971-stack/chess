import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { useApp } from '../AppContext';
import { Board } from '../board/Board';
import { Segmented } from '../screens/Play';
import { legalTargets, isPromotion, checkedKingSquare } from '../../lib/chess/game';
import { OPENINGS, openingById } from '../../lib/academy/defs';
import { INFO } from '../../lib/academy/info';
import { explainOpeningMove } from '../../lib/academy/explain';
import { stagePlies, isLearnerPly } from '../../lib/academy/stages';
import {
  makeQuiz, nextStage, quizDue, quizzesOf, recordQuiz, recordStageTest, stageRecords, allStageRecords, type OpeningData, type QuizItem,
} from '../../lib/academy/progress';
import { openingName } from '../../lib/analysis/book';
import { playMoveSound } from '../../lib/sound';
import type { OpeningQuiz, OpeningStageRecord } from '../../lib/storage/db';
import { TopicList } from '../lessons/Lessons';

// ---------- data ----------
const cache = new Map<string, Promise<OpeningData>>();
export function loadOpening(id: string): Promise<OpeningData> {
  if (!cache.has(id)) cache.set(id, fetch(`./data/academy/${id}.json`).then((r) => { if (!r.ok) throw new Error('academy ' + id); return r.json(); }));
  return cache.get(id)!;
}
type IndexRow = { id: string; lines: number; stages: number };
let idx: Promise<{ openings: IndexRow[] }> | null = null;
const loadIndex = () => (idx ??= fetch('./data/academy/index.json').then((r) => r.json()));

const fenAt = (sans: string[], n: number) => { const c = new Chess(); for (const s of sans.slice(0, n)) c.move(s); return c; };
const lastOf = (sans: string[], n: number): [Square, Square] | null => {
  if (n <= 0) return null;
  const c = fenAt(sans, n - 1); const m = c.move(sans[n - 1]); return [m.from as Square, m.to as Square];
};
/** "1.e4 e5 2.Nf3" style move list */
function moveList(sans: string[]) {
  return sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ');
}
/** name change at ply i (for the explanation "This is now: …") */
function nameAt(sans: string[], i: number): string | null {
  const now = openingName(sans.slice(0, i + 1)), before = openingName(sans.slice(0, i));
  return now && now.ply === i + 1 && now.name !== before?.name ? now.name : null;
}

function useBoardProps() {
  const { settings } = useApp();
  return {
    themeId: settings.boardTheme, pieceSet: settings.pieceSet, coordinates: settings.coordinates,
    showLegal: settings.showLegal, showLastMove: settings.showLastMove, animationMs: settings.animationMs,
  };
}

// ---------- home ----------
export function AcademyHome() {
  const { t, settings, go, dataVersion } = useApp();
  const L = settings.lang;
  const [side, setSide] = useState<'w' | 'b' | 'mg' | 'eg'>('w');
  const [index, setIndex] = useState<IndexRow[] | null>(null);
  const [recs, setRecs] = useState<OpeningStageRecord[]>([]);
  useEffect(() => { loadIndex().then((d) => setIndex(d.openings)); allStageRecords().then(setRecs); }, [dataVersion]);
  return (
    <div className="screen">
      <h1>{t('ac_title')}</h1>
      <Segmented value={side} onChange={(v) => setSide(v as 'w' | 'b' | 'mg' | 'eg')} options={[['w', t('ac_whiteShort')], ['b', t('ac_blackShort')], ['mg', t('ls_mg')], ['eg', t('ls_eg')]]} />
      {(side === 'mg' || side === 'eg') && <TopicList section={side} />}
      {(side === 'w' || side === 'b') && <div className="ac-list" data-testid="ac-list">
        {OPENINGS.filter((o) => o.side === side).map((o) => {
          const row = index?.find((r) => r.id === o.id);
          const mine = recs.filter((r) => r.openingId === o.id && r.uid);
          const done = mine.filter((r) => r.completedAt).length;
          const review = mine.filter((r) => r.needsReview).length;
          const n = row?.stages ?? 0;
          return (
            <button key={o.id} className="card ac-card" data-testid={'ac-' + o.id} onClick={() => go({ name: 'opening', id: o.id })}>
              <div className="row between">
                <b>{o.name[L]}</b><span className="pill" dir="ltr">{o.eco}</span>
              </div>
              <div className="muted small" dir="ltr">{o.name.en} · {moveList(o.main.split(' ').slice(0, 6))}</div>
              <div className="ac-bar"><span style={{ width: n ? `${(100 * done) / n}%` : 0 }} /></div>
              <div className="row between muted tiny">
                <span>{t('ac_progress', { d: done, n })}</span>
                {review > 0 && <span className="ac-review">{t('ac_needReview', { n: review })}</span>}
              </div>
            </button>
          );
        })}
      </div>}
      {(side === 'w' || side === 'b') && <p className="muted tiny">{t('ac_source')}</p>}
    </div>
  );
}

// ---------- opening page ----------
export function OpeningPage({ id }: { id: string }) {
  const { t, settings, go, dataVersion } = useApp();
  const L = settings.lang;
  const def = openingById(id)!;
  const info = INFO[id];
  const [data, setData] = useState<OpeningData | null>(null);
  const [recs, setRecs] = useState<Map<number, OpeningStageRecord>>(new Map());
  const [quizzes, setQuizzes] = useState<OpeningQuiz[]>([]);
  const [ply, setPly] = useState(0);
  const [page, setPage] = useState(0);
  const bp = useBoardProps();
  useEffect(() => {
    loadOpening(id).then((d) => { setData(d); stageRecords(id, d).then(setRecs); });
    quizzesOf(id).then(setQuizzes);
  }, [id, dataVersion]);
  const main = def.main.split(' ');
  const pos = useMemo(() => fenAt(main, ply), [ply, def.main]);
  const done = [...recs.values()].filter((r) => r.completedAt).length;
  const due = quizDue(done, quizzes);
  const next = data ? nextStage(data, recs) : 0;
  const firstTry = [...recs.values()].filter((r) => r.completedAt);
  const rate = firstTry.length ? `${Math.round((100 * firstTry.filter((r) => r.firstTry).length) / firstTry.length)}%` : '—';
  const review = [...recs.values()].filter((r) => r.needsReview).sort((a, b) => a.stage - b.stage);
  const PER = 40;

  return (
    <div className="screen">
      <div className="card">
        <div className="row between"><h1>{def.name[L]}</h1><span className="pill" dir="ltr">{def.eco}</span></div>
        <div className="muted small" dir="ltr">{def.name.en}</div>
        {data && <div className="muted small" data-testid="ac-stats">{t('ac_progress', { d: done, n: data.stages.length })} · {t('ac_stats', { done, rate })}</div>}
        <div className="row gap wrap" style={{ marginTop: 8 }}>
          {data && next < data.stages.length && !due && (
            <button className="btn primary" data-testid="ac-continue" onClick={() => go({ name: 'openingStage', id, stage: next })}>{done ? t('ac_continue') : t('ac_start')}</button>
          )}
          {due && <button className="btn primary" data-testid="ac-quiz" onClick={() => go({ name: 'openingQuiz', id })}>{t('ac_quiz')}</button>}
          {data && next >= data.stages.length && <span className="muted">{t('ac_allDone')}</span>}
        </div>
        {due && <p className="muted small">{t('ac_quizDue')}</p>}
      </div>

      <div className="card">
        <h2>{t('ac_mainLine')}</h2>
        <Board fen={pos.fen()} orientation={def.side} movable={null} targets={() => []} needsPromotion={() => false} onMove={() => false}
          lastMove={lastOf(main, ply)} checkSquare={checkedKingSquare(pos)} {...bp} />
        <div className="row gap" dir="ltr" style={{ marginTop: 8, justifyContent: 'center' }}>
          <button className="btn" onClick={() => setPly(0)} disabled={ply === 0}>⏮</button>
          <button className="btn" onClick={() => setPly(Math.max(0, ply - 1))} disabled={ply === 0} data-testid="ac-main-prev">◀</button>
          <button className="btn" onClick={() => setPly(Math.min(main.length, ply + 1))} disabled={ply === main.length} data-testid="ac-main-next">▶</button>
          <button className="btn" onClick={() => setPly(main.length)} disabled={ply === main.length}>⏭</button>
        </div>
        <p dir="ltr" className="small ac-moves">{main.map((s, i) => <span key={i} className={i === ply - 1 ? 'mv cur' : 'mv'} onClick={() => setPly(i + 1)}>{i % 2 === 0 ? `${i / 2 + 1}.` : ''}{s} </span>)}</p>
        {ply > 0 && (
          <ul className="bullets small" data-testid="ac-main-explain">
            {explainOpeningMove(fenAt(main, ply - 1).fen(), main[ply - 1], L, {
              note: info?.notes[ply - 1] ?? null, newName: nameAt(main, ply - 1),
              engine: isLearnerPly(ply - 1, def.side) ? data?.lines[0]?.eng[ply - 1] ?? null : null,
            }).map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        )}
      </div>

      {info && (
        <div className="card ac-info">
          <h2>{t('ac_history')}</h2><p>{info.history[L]}</p>
          <h2>{t('ac_idea')}</h2><p>{info.idea[L]}</p>
          <div className="ac-two">
            <div><h3>{t('ac_pros')}</h3><ul className="bullets">{info.pros.map((x, i) => <li key={i}>{x[L]}</li>)}</ul></div>
            <div><h3>{t('ac_cons')}</h3><ul className="bullets">{info.cons.map((x, i) => <li key={i}>{x[L]}</li>)}</ul></div>
          </div>
          <h3>{t('ac_plansW')}</h3><p>{info.plansWhite[L]}</p>
          <h3>{t('ac_plansB')}</h3><p>{info.plansBlack[L]}</p>
          <h3>{t('ac_structure')}</h3><p>{info.structure[L]}</p>
          <h3>{t('ac_mistakes')}</h3><ul className="bullets">{info.mistakes.map((x, i) => <li key={i}>{x[L]}</li>)}</ul>
          <h3>{t('ac_players')}</h3><p dir="ltr">{info.players.join(' · ')}</p>
        </div>
      )}

      {review.length > 0 && (
        <div className="card">
          <h2>{t('ac_reviewList')}</h2>
          <div className="row gap wrap">{review.map((r) => <button key={r.stage} className="btn" onClick={() => go({ name: 'openingStage', id, stage: r.stage })}>{t('ac_stage', { n: r.stage + 1 })}</button>)}</div>
        </div>
      )}

      {data && (
        <div className="card">
          <h2>{t('ac_stages')} <span className="muted small">({data.stages.length})</span></h2>
          <div className="ac-stages" data-testid="ac-stages">
            {data.stages.slice(page * PER, (page + 1) * PER).map((s, k) => {
              const i = page * PER + k;
              const r = recs.get(i);
              const open = i <= next && !(due && i === next);
              const ln = data.lines[s.line];
              return (
                <button key={i} className={'ac-stage' + (r?.completedAt ? ' done' : '') + (i === next ? ' cur' : '')} disabled={!open}
                  onClick={() => go({ name: 'openingStage', id, stage: i })} data-testid={'ac-stage-' + i}>
                  <span>{r?.completedAt ? '✓' : open ? '▶' : '🔒'} {t('ac_stage', { n: i + 1 })}{r?.needsReview ? ' •' : ''}</span>
                  <span className="muted tiny" dir="ltr">{ln.name}</span>
                </button>
              );
            })}
          </div>
          {data.stages.length > PER && (
            <div className="row gap" dir="ltr" style={{ justifyContent: 'center', marginTop: 8 }}>
              <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>◀</button>
              <span className="muted small" dir="ltr">{page + 1} / {Math.ceil(data.stages.length / PER)}</span>
              <button className="btn" disabled={(page + 1) * PER >= data.stages.length} onClick={() => setPage(page + 1)}>▶</button>
            </div>
          )}
          <h3>{t('ac_variations', { n: data.lines.length })}</h3>
          <ul className="ac-lines small" dir="ltr">{data.lines.slice(0, 30).map((l, i) => <li key={i}><b>{l.name}</b> <span className="muted">{moveList(l.sans)}</span></li>)}</ul>
          <p className="muted tiny">{t('ac_engineNote')}</p>
        </div>
      )}
    </div>
  );
}

// ---------- a stage: learn, then test ----------
export function StageScreen({ id, stage }: { id: string; stage: number }) {
  const { t, settings, go, bumpData } = useApp();
  const L = settings.lang;
  const def = openingById(id)!;
  const side = def.side;
  const bp = useBoardProps();
  const [data, setData] = useState<OpeningData | null>(null);
  const [mode, setMode] = useState<'learn' | 'test' | 'result'>('learn');
  const [ply, setPly] = useState(0); // number of plies on the board
  const [fb, setFb] = useState<{ kind: 'good' | 'bad' | 'info'; lines: string[] } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [arrow, setArrow] = useState<[Square, Square] | null>(null);
  const [lastRec, setLastRec] = useState<OpeningStageRecord | null>(null);
  const t0 = useRef(Date.now());
  const busy = useRef(false);
  useEffect(() => { loadOpening(id).then(setData); }, [id]);
  const st = data?.stages[stage];
  const line = st ? data!.lines[st.line] : null;
  useEffect(() => { if (st) { setPly(st.from); setMode('learn'); setMistakes(0); setFb(null); setArrow(null); } }, [st]);
  if (!data || !st || !line) return <div className="screen"><div className="card muted">…</div></div>;
  const sans = line.sans;
  const board = fenAt(sans, ply);
  const plies = stagePlies(st, side);
  const lastLearner = plies[plies.length - 1];
  const note = (i: number) => (line.source === 'main' ? INFO[id]?.notes[i] ?? null : null);
  const explain = (i: number) => explainOpeningMove(fenAt(sans, i).fen(), sans[i], L, {
    engine: isLearnerPly(i, side) ? line.eng[i] : null, note: note(i), newName: nameAt(sans, i),
  });
  const moveArrow = (i: number): [Square, Square] | null => { if (i >= sans.length) return null; const m = fenAt(sans, i).move(sans[i]); return [m.from as Square, m.to as Square]; };

  // learn mode: the current move to explain is sans[ply]
  const learnIdx = ply;
  const learnDone = mode === 'learn' && ply > st.to;
  const startTest = () => { setMode('test'); setPly(st.from); setMistakes(0); setFb({ kind: 'info', lines: [t('ac_testHint')] }); setArrow(null); t0.current = Date.now(); };

  const finishTest = async (m: number) => {
    const rec = await recordStageTest(id, stage, m, Date.now() - t0.current, st.uid);
    setLastRec(rec); setMode('result'); bumpData();
  };

  const onMove = (from: Square, to: Square, promotion?: string): boolean => {
    if (busy.current) return false;
    const c = fenAt(sans, ply);
    let mv;
    try { mv = c.move({ from, to, promotion }); } catch { return false; }
    const want = sans[ply];
    if (mode === 'learn') {
      if (mv.san !== want) return false;
      if (settings.sound) playMoveSound(mv.captured ? 'capture' : 'move');
      setPly(ply + 1);
      return true;
    }
    if (mv.san !== want) {
      // another known theory move from this position is not counted as a mistake
      const prefix = sans.slice(0, ply).join(' ');
      const other = data.lines.find((l) => l.sans.slice(0, ply).join(' ') === prefix && l.sans[ply] === mv.san);
      const reason = explain(ply);
      if (other) setFb({ kind: 'info', lines: [t('ac_alsoTheory', { san: mv.san, name: other.name, want }), t('ac_playIt')] });
      else { setMistakes((x) => x + 1); setFb({ kind: 'bad', lines: [t('ac_wrong', { san: want }), ...reason, t('ac_playIt')] }); }
      setArrow(moveArrow(ply));
      return false;
    }
    if (settings.sound) playMoveSound(mv.captured ? 'capture' : 'move');
    setArrow(null);
    setFb({ kind: 'good', lines: [t('ac_correct')] });
    const nextPly = ply + 1;
    setPly(nextPly);
    if (ply >= lastLearner) { finishTest(mistakes); return true; }
    // the opponent's reply
    busy.current = true;
    setTimeout(() => { busy.current = false; if (settings.sound) playMoveSound('move'); setPly(nextPly + 1); }, 500);
    return true;
  };

  const curIsLearner = isLearnerPly(ply, side);
  const movable = mode === 'test' ? (curIsLearner && ply <= lastLearner ? side : null) : mode === 'learn' && curIsLearner && ply <= st.to ? side : null;
  const arrows = mode === 'learn' && !learnDone ? [moveArrow(learnIdx)].filter(Boolean).map((a) => ({ from: a![0], to: a![1], color: isLearnerPly(learnIdx, side) ? '#3c9a3c' : '#e09a3c' })) : arrow ? [{ from: arrow[0], to: arrow[1], color: '#3c9ae0' }] : [];

  return (
    <div className="screen play">
      <div className="card ac-head">
        <div className="row between"><b>{def.name[L]} · {t('ac_stage', { n: stage + 1 })}</b><span className="pill">{mode === 'learn' ? t('ac_learn') : t('ac_test')}</span></div>
        <div className="muted tiny" dir="ltr">{line.name}{line.eco ? ` (${line.eco})` : ''}</div>
        <div className="muted tiny">{t('ac_learnerMoves', { n: plies.length })}</div>
      </div>
      <div className="board-row">
        <Board fen={board.fen()} orientation={side} movable={movable} targets={(sq) => legalTargets(board, sq)} needsPromotion={(f, to) => isPromotion(board, f, to)}
          onMove={onMove} lastMove={lastOf(sans, ply)} checkSquare={checkedKingSquare(board)} arrows={arrows} {...bp} />
      </div>
      <p className="small ac-moves" data-testid="ac-moves"><span className="muted">{t('ac_movesSoFar')}: </span><bdi dir="ltr">{moveList(sans.slice(0, ply)) || '—'}</bdi></p>

      {mode === 'learn' && (
        <div className="card" data-testid="ac-learn">
          {!learnDone ? (
            <>
              <h3>{isLearnerPly(learnIdx, side) ? t('ac_yourMove') : t('ac_reply')}: <span dir="ltr">{learnIdx % 2 === 0 ? `${learnIdx / 2 + 1}.` : `${Math.floor(learnIdx / 2) + 1}...`}{sans[learnIdx]}</span></h3>
              <ul className="bullets" data-testid="ac-explain">{explain(learnIdx).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          ) : <p>{t('ac_testHint')}</p>}
          <div className="row gap wrap">
            <button className="btn" disabled={ply <= st.from} onClick={() => setPly(ply - 1)}>{t('ac_prev')}</button>
            {!learnDone && <button className="btn" data-testid="ac-next" onClick={() => setPly(ply + 1)}>{t('ac_next')}</button>}
            {learnDone ? <button className="btn primary" data-testid="ac-start-test" onClick={startTest}>{t('ac_startTest')}</button>
              : <button className="btn" data-testid="ac-skip-learn" onClick={startTest}>{t('ac_skipLearn')}</button>}
          </div>
        </div>
      )}
      {mode === 'test' && fb && (
        <div className={'card ac-fb ' + fb.kind} data-testid="ac-feedback">
          <ul className="bullets">{fb.lines.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
      {mode === 'result' && (
        <div className="card" data-testid="ac-result">
          <h2>{mistakes === 0 ? t('ac_passed') : t('ac_failed', { n: mistakes })}</h2>
          <div className="row gap wrap">
            {mistakes > 0 && <button className="btn primary" data-testid="ac-retry" onClick={startTest}>{t('ac_retryTest')}</button>}
            {mistakes === 0 && stage + 1 < data.stages.length && <button className="btn primary" data-testid="ac-next-stage" onClick={async () => {
              const [recs, qs] = await Promise.all([stageRecords(id, data), quizzesOf(id)]);
              const doneN = [...recs.values()].filter((r) => r.completedAt).length;
              const nxt = nextStage(data, recs);
              go(quizDue(doneN, qs) ? { name: 'openingQuiz', id } : nxt < data.stages.length ? { name: 'openingStage', id, stage: nxt } : { name: 'opening', id });
            }}>{t('ac_nextStage')}</button>}
            <button className="btn" onClick={() => go({ name: 'opening', id })}>{t('ac_back')}</button>
          </div>
          {lastRec?.needsReview && mistakes === 0 && <p className="muted small">{t('ac_reviewList')} •</p>}
        </div>
      )}
    </div>
  );
}

// ---------- periodic review test ----------
export function QuizScreen({ id }: { id: string }) {
  const { t, settings, go, bumpData } = useApp();
  const L = settings.lang;
  const def = openingById(id)!;
  const bp = useBoardProps();
  const [data, setData] = useState<OpeningData | null>(null);
  const [items, setItems] = useState<QuizItem[]>([]);
  const [upto, setUpto] = useState(0);
  const [k, setK] = useState(0);
  const [results, setResults] = useState<{ stage: number; ok: boolean; uid?: string }[]>([]);
  const [shown, setShown] = useState<{ ok: boolean; lines: string[]; arrow?: [Square, Square] } | null>(null);
  const [done, setDone] = useState<OpeningQuiz | null>(null);
  const [played, setPlayed] = useState<string | null>(null);
  const start = async () => {
    const d = await loadOpening(id);
    const recs = await stageRecords(id, d);
    const completed = [...recs.values()].filter((r) => r.completedAt).map((r) => r.stage);
    setData(d); setItems(makeQuiz(d, completed)); setUpto(completed.length); setK(0); setResults([]); setShown(null); setDone(null); setPlayed(null);
  };
  useEffect(() => { start(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !items.length) return <div className="screen"><div className="card muted">…</div></div>;
  const it = items[k];
  const sans = data.lines[it?.line ?? 0].sans;
  const pos = it ? fenAt(sans, it.ply) : new Chess();
  const onMove = (from: Square, to: Square, promotion?: string) => {
    if (shown || done) return false;
    let mv;
    try { mv = new Chess(pos.fen()).move({ from, to, promotion }); } catch { return false; }
    const want = sans[it.ply];
    const prefix = sans.slice(0, it.ply).join(' ');
    const ok = mv.san === want || data.lines.some((l) => l.sans.slice(0, it.ply).join(' ') === prefix && l.sans[it.ply] === mv.san);
    const m = new Chess(pos.fen()).move(want);
    setResults((r) => [...r, { stage: it.stage, ok, uid: data.stages[it.stage].uid }]);
    if (ok) setPlayed(mv.after);
    setShown({ ok, lines: ok ? [t('ac_correct')] : [t('ac_wrong', { san: want }), ...explainOpeningMove(pos.fen(), want, L, { engine: data.lines[it.line].eng[it.ply] })], arrow: ok ? undefined : [m.from as Square, m.to as Square] });
    return ok;
  };
  const nextItem = async () => {
    setPlayed(null);
    if (k + 1 < items.length) { setK(k + 1); setShown(null); return; }
    const q = await recordQuiz(id, upto, results);
    setDone(q); bumpData();
  };
  return (
    <div className="screen play">
      <div className="card ac-head">
        <b>{t('ac_quizTitle', { name: def.name[L] })}</b>
        <div className="muted small">{t('ac_quizInfo', { n: items.length })}</div>
        <div className="muted small" dir="ltr" data-testid="ac-quiz-progress">{Math.min(k + 1, items.length)} / {items.length}</div>
      </div>
      <div className="board-row">
        <Board fen={played ?? pos.fen()} orientation={def.side} movable={shown || done ? null : def.side} targets={(sq) => legalTargets(pos, sq)} needsPromotion={(f, to) => isPromotion(pos, f, to)}
          onMove={onMove} lastMove={lastOf(sans, it.ply)} checkSquare={checkedKingSquare(pos)} arrows={shown?.arrow ? [{ from: shown.arrow[0], to: shown.arrow[1], color: '#3c9ae0' }] : []} {...bp} />
      </div>
      <p dir="ltr" className="small ac-moves">{moveList(sans.slice(0, it.ply))}</p>
      {shown && !done && (
        <div className={'card ac-fb ' + (shown.ok ? 'good' : 'bad')} data-testid="ac-quiz-feedback">
          <ul className="bullets">{shown.lines.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <button className="btn primary" onClick={nextItem} data-testid="ac-quiz-next">{t('ac_quizNext')}</button>
        </div>
      )}
      {done && (
        <div className="card" data-testid="ac-quiz-result">
          <h2>{t('ac_quizScore', { c: done.correct, n: done.items })}</h2>
          <p>{done.passed ? t('ac_quizPassed') : t('ac_quizFailed')}</p>
          <div className="row gap wrap">
            {!done.passed && <button className="btn primary" onClick={start}>{t('ac_quizRetry')}</button>}
            <button className="btn" onClick={() => go({ name: 'opening', id })} data-testid="ac-quiz-back">{t('ac_back')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { useApp } from '../AppContext';
import { Board } from '../board/Board';
import { legalTargets, isPromotion, checkedKingSquare } from '../../lib/chess/game';
import { TOPICS, lessonById, lessonsOf, topicById, type Lesson } from '../../lib/lessons/lessons';
import { recordStageTest, allStageRecords } from '../../lib/academy/progress';
import { judgeAlternative } from '../../lib/puzzles/solver';
import { isolateSan } from '../../lib/academy/explain';
import { getEngine } from '../../lib/engine/engine';
import { playMoveSound } from '../../lib/sound';
import { Dock } from '../Dock';
import type { OpeningStageRecord } from '../../lib/storage/db';

const KEY = (id: string) => 'lesson:' + id;
const startOf = (l: Lesson) => { const c = new Chess(l.fen); for (const m of (l.pre ?? '').split(' ').filter(Boolean)) c.move(m); return c; };
const posAt = (l: Lesson, n: number) => { const c = startOf(l); for (const m of l.moves.split(' ').slice(0, n)) c.move(m); return c; };
const evaluate = async (fen: string) => {
  const r = await getEngine().search(fen, { depth: 14, movetime: 1500 });
  const x = r.lines[0];
  return { cp: x?.score.cp, mate: x?.score.mate, pv: x?.pv ?? [] };
};

/** list of topics for one section (shown inside the Academy tab) */
export function TopicList({ section }: { section: 'mg' | 'eg' }) {
  const { t, settings, go, dataVersion } = useApp();
  const L = settings.lang;
  const [recs, setRecs] = useState<OpeningStageRecord[]>([]);
  useEffect(() => { allStageRecords().then(setRecs); }, [dataVersion]);
  return (
    <div className="ac-list" data-testid={'topics-' + section}>
      {TOPICS.filter((x) => x.section === section).map((tp) => {
        const ls = lessonsOf(tp.id);
        const done = ls.filter((l) => recs.some((r) => r.openingId === KEY(l.id) && r.completedAt)).length;
        return (
          <button key={tp.id} className="card ac-card" data-testid={'topic-' + tp.id} onClick={() => go({ name: 'topic', id: tp.id })}>
            <b>{tp.title[L]}</b>
            <div className="muted small">{tp.concept[L].slice(0, 110)}…</div>
            <div className="muted tiny">{ls.length ? t('ls_lessons', { d: done, n: ls.length }) : t('ls_practiceOnly')}</div>
          </button>
        );
      })}
      <p className="muted tiny">{t('ls_sourceNote')}</p>
    </div>
  );
}

export function TopicPage({ id }: { id: string }) {
  const { t, settings, go, dataVersion } = useApp();
  const L = settings.lang;
  const tp = topicById(id)!;
  const [recs, setRecs] = useState<OpeningStageRecord[]>([]);
  useEffect(() => { allStageRecords().then(setRecs); }, [dataVersion]);
  const ls = lessonsOf(id);
  return (
    <div className="screen">
      <div className="card" data-testid="topic-page">
        <h1>{tp.title[L]}</h1>
        <h3>{t('ls_concept')}</h3><p>{isolateSan(tp.concept[L])}</p>
        <h3>{t('ls_principles')}</h3><ul className="bullets">{tp.principles.map((p, i) => <li key={i}>{p[L]}</li>)}</ul>
        <h3>{t('ls_deter')}</h3><p>{isolateSan(tp.deter[L])}</p>
        <p className="muted small">{t('ls_idea')}: {tp.idea[L]}</p>
      </div>
      {ls.length > 0 && (
        <div className="card">
          <h2>{t('ls_guided')}</h2>
          <div className="ac-stages">
            {ls.map((l) => {
              const done = recs.some((r) => r.openingId === KEY(l.id) && r.completedAt);
              return (
                <button key={l.id} className={'ac-stage' + (done ? ' done' : '')} onClick={() => go({ name: 'lesson', id: l.id })} data-testid={'lesson-' + l.id}>
                  <span>{done ? '✓' : '▶'} {l.title[L]}</span>
                  <span className="muted tiny">{t(('ls_goal_' + l.goal) as 'ls_goal_win')}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="card">
        <h2>{t('ls_practice')}</h2>
        <p className="muted small">{t('ls_practiceNote')}</p>
        <button className="btn primary" onClick={() => go({ name: 'puzzle', cat: tp.practice })} data-testid="topic-practice">{t('ls_practiceStart')}</button>
      </div>
    </div>
  );
}

export function LessonScreen({ id }: { id: string }) {
  const { t, settings, go, bumpData } = useApp();
  const L = settings.lang;
  const lesson = lessonById(id)!;
  const topic = topicById(lesson.topic)!;
  const moves = useMemo(() => lesson.moves.split(' '), [lesson]);
  const learner = startOf(lesson).turn();
  const [mode, setMode] = useState<'learn' | 'test' | 'result'>('learn');
  const [ply, setPly] = useState(0);
  const [fb, setFb] = useState<{ kind: 'good' | 'bad' | 'info'; lines: string[] } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [arrow, setArrow] = useState<[Square, Square] | null>(null);
  const [busy, setBusy] = useState(false);
  const t0 = useRef(Date.now());
  const board = posAt(lesson, ply);
  const isLearner = (i: number) => posAt(lesson, i).turn() === learner;
  const lastLearner = moves.map((_, i) => i).filter(isLearner).pop()!;
  const arrowOf = (i: number): [Square, Square] | null => { if (i >= moves.length) return null; const m = posAt(lesson, i).move(moves[i]); return [m.from as Square, m.to as Square]; };
  const last = ply > 0 ? arrowOf(ply - 1) : null;
  const note = (i: number) => isolateSan(lesson.notes[i]?.[L] ?? '');
  const learnDone = mode === 'learn' && ply >= moves.length;
  const startTest = () => { setMode('test'); setPly(0); setMistakes(0); setArrow(null); setFb({ kind: 'info', lines: [t('ls_testHint')] }); t0.current = Date.now(); };

  const finish = async (m: number) => { await recordStageTest(KEY(id), 0, m, Date.now() - t0.current); bumpData(); setMode('result'); };

  const onMove = (from: Square, to: Square, promotion?: string): boolean => {
    if (busy) return false;
    const c = posAt(lesson, ply);
    let mv;
    try { mv = c.move({ from, to, promotion }); } catch { return false; }
    const want = moves[ply];
    if (mode === 'learn') { if (mv.san !== want) return false; if (settings.sound) playMoveSound(mv.captured ? 'capture' : 'move'); setPly(ply + 1); return true; }
    if (mv.san !== want) {
      setBusy(true);
      const goal = lesson.goal === 'mate' ? { kind: 'mate' as const } : lesson.goal === 'win' ? { kind: 'win' as const } : lesson.goal === 'draw' ? { kind: 'defend' as const } : { kind: 'best' as const };
      const left = moves.slice(ply).filter((_, k) => isLearner(ply + k)).length;
      const refUci = (() => { const m = posAt(lesson, ply).move(want); return m.from + m.to + (m.promotion ?? ''); })();
      judgeAlternative(posAt(lesson, ply).fen(), mv.from + mv.to + (mv.promotion ?? ''), refUci, goal, left, evaluate).then((v) => {
        setBusy(false);
        setArrow(arrowOf(ply));
        if (v.ok) setFb({ kind: 'info', lines: [t('ls_alsoGood', { san: mv.san, want }), t('ls_playIt')] });
        else { setMistakes((x) => x + 1); setFb({ kind: 'bad', lines: [t('ls_wrong', { san: want }), note(ply), t('ls_playIt')] }); }
      });
      return false;
    }
    if (settings.sound) playMoveSound(mv.captured ? 'capture' : 'move');
    setArrow(null);
    setFb({ kind: 'good', lines: [t('ls_correct'), note(ply)] });
    const nextPly = ply + 1;
    setPly(nextPly);
    if (ply >= lastLearner) { finish(mistakes); return true; }
    setBusy(true);
    setTimeout(() => { setBusy(false); if (settings.sound) playMoveSound('move'); setPly(nextPly + 1); setFb((f) => ({ kind: 'info', lines: [...(f?.lines ?? []), t('ls_reply', { san: moves[nextPly] }) + ' ' + note(nextPly)] })); }, 600);
    return true;
  };

  const movable = board.turn() === learner && ((mode === 'test' && ply <= lastLearner) || (mode === 'learn' && ply < moves.length)) && !busy ? learner : null;
  const arrows = mode === 'learn' && !learnDone ? [arrowOf(ply)].filter(Boolean).map((a) => ({ from: a![0], to: a![1], color: isLearner(ply) ? '#3c9a3c' : '#e09a3c' })) : arrow ? [{ from: arrow[0], to: arrow[1], color: '#3c9ae0' }] : [];

  return (
    <div className="screen play has-dock">
      <div className="card ac-head">
        <div className="row between"><b>{lesson.title[L]}</b><span className="pill">{mode === 'learn' ? t('ac_learn') : t('ac_test')}</span></div>
        <div className="muted tiny">{topic.title[L]} · {t(('ls_goal_' + lesson.goal) as 'ls_goal_win')} · {learner === 'w' ? t('pz_white') : t('pz_black')}</div>
      </div>
      <div className="board-row">
        <Board fen={board.fen()} orientation={learner} movable={movable} targets={(sq) => legalTargets(board, sq)} needsPromotion={(f, to) => isPromotion(board, f, to)}
          onMove={onMove} lastMove={last} checkSquare={checkedKingSquare(board)} arrows={arrows}
          themeId={settings.boardTheme} pieceSet={settings.pieceSet} coordinates={settings.coordinates} showLegal={settings.showLegal} showLastMove={settings.showLastMove} animationMs={settings.animationMs} />
      </div>
      {mode === 'learn' && (
        <Dock testId="ls-learn" resetKey={ply} title={!learnDone ? <b>{isLearner(ply) ? t('ac_yourMove') : t('ac_reply')}: <bdi dir="ltr">{moves[ply]}</bdi></b> : t('ls_testHint')}
          footer={<div className="row gap wrap">
            <button className="btn" disabled={ply === 0} onClick={() => setPly(ply - 1)}>{t('ac_prev')}</button>
            {!learnDone && <button className="btn primary" data-testid="ls-next" onClick={() => setPly(ply + 1)}>{t('ac_next')}</button>}
            {learnDone && <button className="btn primary" data-testid="ls-start-test" onClick={startTest}>{t('ac_startTest')}</button>}
          </div>}>
          {ply === 0 && <p>{isolateSan(lesson.intro[L])}</p>}
          {!learnDone && <p data-testid="ls-note">{note(ply)}</p>}
        </Dock>
      )}
      {mode === 'test' && fb && <Dock testId="ls-feedback" resetKey={fb} className={'ac-fb ' + fb.kind} title={<span className="muted">{t('ac_test')}</span>}><ul className="bullets">{fb.lines.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul></Dock>}
      {mode === 'result' && (
        <div className="card" data-testid="ls-result">
          <h2>{mistakes === 0 ? t('ac_passed') : t('ac_failed', { n: mistakes })}</h2>
          <div className="row gap wrap">
            {mistakes > 0 && <button className="btn primary" onClick={startTest} data-testid="ls-retry">{t('ac_retryTest')}</button>}
            <button className="btn" onClick={() => go({ name: 'puzzle', cat: topic.practice })}>{t('ls_practiceStart')}</button>
            <button className="btn" onClick={() => go({ name: 'topic', id: topic.id })} data-testid="ls-back">{t('ls_backTopic')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

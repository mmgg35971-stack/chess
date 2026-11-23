import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import { useApp } from '../AppContext';
import { Board, type Arrow } from '../board/Board';
import { MoveList, TIME_CONTROLS } from '../screens/Play';
import { EvalBar } from '../analysis/EvalBar';
import { Dock } from '../Dock';
import { CoachPortrait } from './Emblem';
import type { CoachSetup } from './CoachScreens';
import { coachById, coachLevel, coachTree, withMeasuredStyle } from '../../lib/coach/coaches';
import { bookMove, chooseHumanLike, realBookMove, type StyleTag } from '../../lib/coach/style';
import { coachMoveComment, planAdvice } from '../../lib/coach/voice';
import { getEngine, type SearchResult } from '../../lib/engine/engine';
import { engineThinkMs } from '../../lib/engine/timing';
import { toWhitePov, formatScore, type Score } from '../../lib/engine/uci';
import { evaluateMove, pvToSan, summarize, type MoveEval } from '../../lib/analysis/analyzer';
import { explain, LABEL_TEXT, LABEL_SYMBOL } from '../../lib/analysis/explain';
import { STRICTNESS, type MoveLabel } from '../../lib/analysis/classify';
import { moveFeatures } from '../../lib/analysis/features';
import { bookPlies, openingName } from '../../lib/analysis/book';
import { estimateRatings } from '../../lib/analysis/gameRating';
import {
  boardOutcome, checkedKingSquare, isPromotion, legalTargets, resignOutcome, timeoutOutcome,
  tryMove, uciToMove, type Color, type GameOutcome,
} from '../../lib/chess/game';
import { buildPgn, pgnDate } from '../../lib/chess/pgn';
import { gamesVsCoach, getSetting, recentCoachMoves, saveAnalysis, saveFinishedGame, setSetting } from '../../lib/storage/repo';
import { playMoveSound } from '../../lib/sound';
import { fmtClock, fmtDuration } from '../format';

interface Comment {
  id: number;
  ply: number;
  who: 'review' | 'coach';
  label?: MoveLabel;
  san?: string;
  lines: string[];
}

interface CoachSession {
  coachId: string;
  setup: CoachSetup;
  userColor: Color;
  sans: string[];
  startedAt: number;
  activeMs: number;
  clocks: { w: number; b: number } | null;
  seed: number;
}

interface Pending {
  fenBefore: string;
  move: Move;
  prev: Move | null;
  before: SearchResult['lines'];
  ply: number;
}

/** Coach think time: 2–5 s, longer in complex positions, shorter when its clock is low. */
function coachThinkMs(legal: number, gapCp: number | null, ply: number, clockMs: number | null, incMs: number) {
  const base = engineThinkMs({ legalMoves: legal, gapCp, ply, clockMs: null, incMs: 0 }); // 800..3500
  let ms = 2000 + ((base - 800) / 2700) * 3000;
  if (legal <= 1) ms = 1200;
  if (clockMs !== null) ms = Math.min(ms, engineThinkMs({ legalMoves: legal, gapCp, ply, clockMs, incMs }) + 1500, clockMs * 0.2);
  return Math.round(Math.max(600, Math.min(5000, ms)));
}

const BG_LIMITS = { depth: 13, movetime: 1800 };

/** Context for classifying the move at `ply`: book status and the opponent's previous move. */
function ctxFor(sans: string[], ply: number, evals: MoveEval[], rating = 1500) {
  const book = bookPlies(sans.slice(0, ply));
  return { rating, inBook: book[ply - 1] ?? false, prevEval: evals.find((e) => e.ply === ply - 1) ?? null };
}

export function CoachGame({ id, resume }: { id: string; resume?: boolean }) {
  const { t, settings, profile, go, bumpData } = useApp();
  const L = settings.lang;
  const coach = useMemo(() => withMeasuredStyle(coachById(id)!), [id]);
  /** the coach's real opening tree + its moves from the last games vs this user (anti-repetition) */
  const repertoire = useRef<{ tree?: Record<string, [string, number][]>; avoid: Set<string> }>({ avoid: new Set() });
  useEffect(() => {
    let live = true;
    (async () => {
      const [tree, avoid] = await Promise.all([coachTree(id).catch(() => undefined), recentCoachMoves(id, 3)]);
      if (live) repertoire.current = { tree, avoid };
    })();
    return () => { live = false; };
  }, [id]);
  const th = STRICTNESS[settings.strictness];

  const chess = useRef(new Chess());
  const [fen, setFen] = useState(chess.current.fen());
  const [session, setSession] = useState<CoachSession | null>(null);
  const sessionRef = useRef<CoachSession | null>(null);
  const [orientation, setOrientation] = useState<Color>('w');
  const [thinking, setThinking] = useState(false);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const commentId = useRef(0);
  const evalsRef = useRef<MoveEval[]>([]);
  const [evalsVersion, setEvalsVersion] = useState(0);
  const pending = useRef<Pending | null>(null);
  const bg = useRef<{ fen: string; promise: Promise<SearchResult>; result: SearchResult | null } | null>(null);
  const [bgResult, setBgResult] = useState<{ fen: string; result: SearchResult } | null>(null);
  const [clocks, setClocks] = useState<{ w: number; b: number } | null>(null);
  const clocksRef = useRef<{ w: number; b: number } | null>(null);
  const [hintStage, setHintStage] = useState(0);
  const [showLines, setShowLines] = useState(false);
  const gen = useRef(0);
  const finishing = useRef(false);
  const lastTick = useRef(Date.now());

  const userName = profile?.name || t('defaultName');
  const sync = () => setFen(chess.current.fen());
  const mode = session?.setup.mode ?? 'educational';
  const talk = mode !== 'competitive';

  const addComment = (c: Omit<Comment, 'id'>) =>
    setComments((list) => [{ ...c, id: ++commentId.current }, ...list].slice(0, 40));

  const persist = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || finishing.current) return;
    s.sans = chess.current.history();
    s.clocks = clocksRef.current ? { ...clocksRef.current } : null;
    await setSetting('coachSession', { ...s });
  }, []);

  /** Analyse the position while the user thinks (also evaluates the coach's last move). */
  const startBackground = useCallback(() => {
    const f = chess.current.fen();
    if (new Chess(f).isGameOver()) return;
    const engine = getEngine();
    const promise = engine.setOption('Skill Level', 20).then(() => engine.search(f, BG_LIMITS, { multipv: 3 }));
    const entry = { fen: f, promise, result: null as SearchResult | null };
    bg.current = entry;
    promise.then((r) => {
      entry.result = r;
      if (bg.current !== entry) return;
      setBgResult({ fen: f, result: r });
      const p = pending.current;
      if (p && p.move.after === f) {
        evalsRef.current.push(evaluateMove(p.fenBefore, p.move, p.prev, p.before, r.lines, p.ply, th, ctxFor(chess.current.history(), p.ply, evalsRef.current, 1500)));
        pending.current = null;
        setEvalsVersion((v) => v + 1);
      }
    });
  }, [th]);

  /** Lines for `f` from the background search (stopping it early if needed). */
  const linesFor = async (f: string) => {
    const b = bg.current;
    if (b && b.fen === f) {
      if (!b.result) getEngine().stop();
      const lines = (await b.promise).lines;
      // cut short by a quick move: re-check at the calibrated depth so the verdict is reliable
      if ((lines[0]?.depth ?? 0) >= 12 && lines.length >= 2) return lines;
    }
    return (await getEngine().search(f, { depth: 12, movetime: 1500 }, { multipv: 2 })).lines;
  };

  const finish = useCallback(async (o: GameOutcome) => {
    const s = sessionRef.current;
    if (!s || finishing.current) return;
    finishing.current = true;
    gen.current++;
    getEngine().stop();
    setThinking(false);
    setOutcome(o);
    if (settings.sound) playMoveSound('end');
    // the coach's last move, if the game ended right after it
    const p = pending.current;
    if (p && new Chess(p.move.after).isGameOver()) {
      evalsRef.current.push(evaluateMove(p.fenBefore, p.move, p.prev, p.before, [], p.ply, th, ctxFor(chess.current.history(), p.ply, evalsRef.current, 1500)));
      pending.current = null;
    }
    const coachName = `${coach.name.en} (coach simulation, level ${s.setup.level})`;
    const white = s.userColor === 'w' ? userName : coachName;
    const black = s.userColor === 'b' ? userName : coachName;
    const pgn = buildPgn(chess.current.history(), {
      Event: `Coach game (${s.setup.mode})`, Site: 'Chess Grandmaster Academy (offline)',
      Date: pgnDate(new Date(s.startedAt)), White: white, Black: black, Result: o.result,
      Termination: o.reason, TimeControl: s.setup.timeControl,
    });
    const gameId = await saveFinishedGame({
      pgn, white, black, userColor: s.userColor,
      opponent: { kind: 'coach', id: coach.id, level: s.setup.level },
      mode: s.setup.mode, result: o.result, reason: o.reason, plies: chess.current.history().length,
      startedAt: s.startedAt, endedAt: Date.now(), durationMs: s.activeMs, timeControl: s.setup.timeControl,
    });
    await saveAnalysis({
      gameId, kind: 'live', evals: [...evalsRef.current].sort((a, b) => a.ply - b.ply),
      depth: BG_LIMITS.depth, engine: getEngine().name, createdAt: Date.now(),
    });
    await setSetting('coachSession', null);
    setSavedId(gameId);
    setEvalsVersion((v) => v + 1);
    bumpData();
  }, [coach, settings.sound, th, userName, bumpData]);

  const checkEnd = () => {
    const o = boardOutcome(chess.current);
    if (o) finish(o);
    return !!o;
  };

  const applyClockIncrement = (mover: Color) => {
    const tc = TIME_CONTROLS[sessionRef.current!.setup.timeControl];
    if (tc && clocksRef.current) {
      clocksRef.current = { ...clocksRef.current, [mover]: clocksRef.current[mover] + tc.inc };
      setClocks(clocksRef.current);
    }
  };

  /** The coach plays from the current position. `analysis` = lines for this position (MultiPV). */
  const coachMove = useCallback(async (myGen: number, analysis: SearchResult['lines'] | null) => {
    const s = sessionRef.current!;
    const lvl = coachLevel(s.setup.level);
    const fenNow = chess.current.fen();
    const t0 = Date.now();
    const engine = getEngine();
    // Each level searches with its own depth/width (that is what the levels were calibrated with);
    // the full-strength level reuses the deep review search when there is one.
    let lines = lvl.level === 7 ? analysis : null;
    if (!lines) {
      await engine.setOption('Skill Level', 20);
      const legal = chess.current.moves().length;
      const multipv = Math.min(lvl.multipv === 0 ? 40 : lvl.multipv, legal);
      lines = (await engine.search(fenNow, { depth: lvl.depth }, { multipv })).lines;
      if (myGen !== gen.current) return;
    }
    const coachColor: Color = s.userColor === 'w' ? 'b' : 'w';
    let uci: string | null = null;
    let tag: StyleTag | 'book' = 'best';
    let pvAfter: string[] = [];
    const rep = repertoire.current;
    // 1) a move the real player chose in this exact position (weighted by how often), else
    // 2) the documented repertoire line, else 3) a human-like engine choice in the coach's style.
    // weaker levels leave the memorised repertoire sooner (a beginner does not know 12 moves of theory)
    const bookLimit = [8, 12, 16, 20, 24, 24, 24][lvl.level - 1];
    const inBook = chess.current.history().length < bookLimit;
    const book = !inBook ? null : realBookMove(rep.tree, fenNow, Math.random, rep.avoid)
      ?? (rep.tree ? null : bookMove(coach, chess.current.history(), coachColor, s.seed));
    if (book) {
      try {
        const m = new Chess(fenNow).move(book);
        if (m) { uci = m.from + m.to + (m.promotion ?? ''); tag = 'book'; pvAfter = lines.find((l) => l.pv[0] === uci)?.pv.slice(1) ?? []; }
      } catch { /* not legal here */ }
    }
    if (!uci) {
      const choice = chooseHumanLike(fenNow, lines, coach, lvl, Math.random, rep.avoid);
      if (!choice) return;
      uci = choice.uci; tag = choice.tag; pvAfter = choice.pv.slice(1);
    }
    const gap = lines.length >= 2 ? (lines[0].score.cp ?? 0) - (lines[1].score.cp ?? 0) : null;
    const target = coachThinkMs(chess.current.moves().length, gap, chess.current.history().length,
      clocksRef.current ? clocksRef.current[coachColor] : null, TIME_CONTROLS[s.setup.timeControl]?.inc ?? 0);
    const wait = target - (Date.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (myGen !== gen.current) return;

    const prev = chess.current.history({ verbose: true }).slice(-1)[0] ?? null;
    const before = chess.current.fen();
    const mv = tryMove(chess.current, uciToMove(uci));
    if (!mv) return;
    setThinking(false);
    applyClockIncrement(coachColor);
    if (settings.sound) playMoveSound(chess.current.inCheck() ? 'check' : mv.captured ? 'capture' : 'move');
    sync();
    pending.current = { fenBefore: before, move: mv, prev, before: lines, ply: chess.current.history().length };
    if (talk) {
      const f = moveFeatures(before, mv, pvAfter, prev);
      const threat = pvAfter.length >= 2 ? pvToSan(mv.after, pvAfter, 2)[1] : null;
      const threatMv = threat ? (() => { try { const c = new Chess(mv.after); c.move(pvToSan(mv.after, pvAfter, 1)[0]); return c.move(threat); } catch { return null; } })() : null;
      const lines2 = coachMoveComment(L, mv.san, tag, f, threatMv && (threatMv.captured || threatMv.san.includes('+')) ? threat : null);
      if (mode === 'educational') {
        const adv = planAdvice(L, chess.current.fen(), s.userColor);
        if (adv) lines2.push(adv);
      }
      addComment({ ply: chess.current.history().length, who: 'coach', san: mv.san, lines: lines2 });
    }
    if (checkEnd()) return;
    persist();
    startBackground();
  }, [coach, L, mode, talk, settings.sound, persist, startBackground]);

  // Start or resume.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = resume ? await getSetting<CoachSession | null>('coachSession', null) : null;
      const setup = saved?.setup ?? (await getSetting<CoachSetup>('coachSetup', { color: 'w', level: 3, mode: 'educational', timeControl: 'none' }));
      const userColor: Color = saved?.userColor ?? (setup.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color);
      const tc = TIME_CONTROLS[setup.timeControl];
      const s: CoachSession = saved ?? {
        coachId: id, setup, userColor, sans: [], startedAt: Date.now(), activeMs: 0,
        clocks: tc ? { w: tc.base, b: tc.base } : null, seed: await gamesVsCoach(id),
      };
      if (cancelled) return;
      const c = new Chess();
      for (const san of s.sans) c.move(san);
      chess.current = c;
      sessionRef.current = s;
      clocksRef.current = s.clocks;
      setClocks(s.clocks);
      setSession(s);
      setOrientation(s.userColor);
      sync();
      await getEngine().newGame();
      await setSetting('coachSession', s);
      if (c.turn() !== s.userColor) {
        setThinking(true);
        coachMove(gen.current, null);
      } else startBackground();
    })();
    return () => { cancelled = true; gen.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, resume]);

  // Clocks + active time.
  useEffect(() => {
    if (!session || outcome) return;
    lastTick.current = Date.now();
    const iv = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(now - lastTick.current, 1000);
      lastTick.current = now;
      if (document.hidden || !sessionRef.current) return;
      sessionRef.current.activeMs += dt;
      if (clocksRef.current) {
        const turn = chess.current.turn();
        const left = clocksRef.current[turn] - dt;
        clocksRef.current = { ...clocksRef.current, [turn]: Math.max(0, left) };
        setClocks(clocksRef.current);
        if (left <= 0) finish(timeoutOutcome(chess.current, turn));
      }
    }, 200);
    return () => clearInterval(iv);
  }, [session, outcome, finish]);

  const onUserMove = (from: Square, to: Square, promotion?: string) => {
    const s = sessionRef.current;
    if (!s || outcome || thinking || chess.current.turn() !== s.userColor) return false;
    const fenBefore = chess.current.fen();
    const prev = chess.current.history({ verbose: true }).slice(-1)[0] ?? null;
    const mv = tryMove(chess.current, { from, to, promotion });
    if (!mv) return false;
    setHintStage(0);
    setShowLines(false);
    applyClockIncrement(s.userColor);
    if (settings.sound) playMoveSound(chess.current.inCheck() ? 'check' : mv.captured ? 'capture' : 'move');
    sync();
    const ply = chess.current.history().length;
    const myGen = ++gen.current;
    setThinking(true);
    (async () => {
      const before = await linesFor(fenBefore);
      if (myGen !== gen.current) return;
      const over = new Chess(mv.after).isGameOver();
      let after: SearchResult['lines'] = [];
      if (!over) {
        const engine = getEngine();
        await engine.setOption('Skill Level', 20);
        const lvl = coachLevel(s.setup.level);
        after = (await engine.search(mv.after, { depth: Math.max(lvl.depth, 12), movetime: 2500 }, { multipv: 5 })).lines;
        if (myGen !== gen.current) return;
      }
      const ev = evaluateMove(fenBefore, mv, prev, before, after, ply, th, ctxFor(chess.current.history(), ply, evalsRef.current, profile?.rating ?? 1500));
      evalsRef.current.push(ev);
      setEvalsVersion((v) => v + 1);
      if (talk) {
        const sideScore = (sc: Score): Score => (s.userColor === 'w' ? sc : { cp: sc.cp !== undefined ? -sc.cp : undefined, mate: sc.mate !== undefined ? -sc.mate : undefined });
        const ex = explain({ lang: L, label: ev.label, played: ev.played, best: ev.best, bestSan: ev.bestSan, before: sideScore(ev.bestScore), after: sideScore(ev.playedScore), replySan: ev.replySan, phase: ev.phase });
        addComment({ ply, who: 'review', label: ev.label, san: mv.san, lines: [ex.headline, ...ex.reasons, ...(ex.better ? [ex.better] : [])] });
      }
      if (checkEnd()) return;
      persist();
      coachMove(myGen, after);
    })();
    return true;
  };

  const undo = () => {
    const s = sessionRef.current;
    if (!s || s.setup.mode !== 'training' || outcome) return;
    gen.current++;
    getEngine().stop();
    setThinking(false);
    chess.current.undo();
    if (chess.current.turn() !== s.userColor) chess.current.undo();
    const n = chess.current.history().length;
    evalsRef.current = evalsRef.current.filter((e) => e.ply <= n);
    pending.current = null;
    setComments((cs) => cs.filter((c) => c.ply <= n));
    setEvalsVersion((v) => v + 1);
    setHintStage(0);
    sync();
    persist();
    startBackground();
  };

  const resign = () => {
    const s = sessionRef.current;
    if (!s || outcome || !window.confirm(t('resignConfirm'))) return;
    finish(resignOutcome(s.userColor));
  };

  // ---------- render ----------
  const userColor = session?.userColor ?? 'w';
  const coachColor: Color = userColor === 'w' ? 'b' : 'w';
  const hist = chess.current.history({ verbose: true });
  const last = hist[hist.length - 1];
  const bgHere = bgResult && bgResult.fen === fen ? bgResult.result : null;
  const turn = new Chess(fen).turn();
  const liveScore: Score | null = bgHere?.lines[0]
    ? toWhitePov(bgHere.lines[0].score, turn)
    : evalsRef.current.length ? evalsRef.current[evalsRef.current.length - 1].playedScore : null;

  const arrows: Arrow[] = [];
  const highlights: { sq: Square; color: string }[] = [];
  const hintUci = bgHere?.lines[0]?.pv[0];
  if (mode === 'training' && hintStage > 0 && hintUci && turn === userColor) {
    highlights.push({ sq: hintUci.slice(0, 2) as Square, color: 'rgba(60,200,120,0.5)' });
    if (hintStage > 1 && settings.showArrows) arrows.push({ from: hintUci.slice(0, 2) as Square, to: hintUci.slice(2, 4) as Square });
  }

  const summary = outcome ? summarize(evalsRef.current) : null;
  void evalsVersion;

  const bar = (c: Color) => (
    <div className={'player-bar' + (!outcome && turn === c ? ' active' : '')}>
      <span className="row gap">
        {c === coachColor && <CoachPortrait coach={coach} size={28} round />}
        {c === userColor ? userName : `${coach.name[L]} · ${coachLevel(session?.setup.level ?? 3).label[L]}`}
      </span>
      {clocks && <span className="clock" data-testid={'clock-' + c}>{fmtClock(clocks[c])}</span>}
    </div>
  );
  const topColor: Color = orientation === 'w' ? 'b' : 'w';
  const renderComment = (c: Comment) => (
            <div key={c.id} className={'comment ' + c.who} data-testid={'comment-' + c.who}>
              {c.who === 'review' && c.label && (
                <span className={'lb lb-' + c.label}>{LABEL_SYMBOL[c.label]} {LABEL_TEXT[L][c.label]}</span>
              )}
              <span className="comment-san" dir="ltr">{c.san}</span>
              {c.lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          );

  return (
    <div className={'screen play' + (talk ? ' has-dock' : '')}>
      {bar(topColor)}
      <div className={'board-row' + (mode === 'training' ? ' with-bar' : '')}>
        {mode === 'training' && <EvalBar score={liveScore} orientation={orientation} />}
        <Board
          fen={fen} orientation={orientation}
          movable={!outcome && !thinking && session ? userColor : null}
          targets={(sq) => legalTargets(chess.current, sq)}
          needsPromotion={(f, to) => isPromotion(chess.current, f, to)}
          onMove={onUserMove}
          lastMove={last ? [last.from as Square, last.to as Square] : null}
          checkSquare={checkedKingSquare(chess.current)}
          arrows={arrows} highlights={highlights}
          themeId={settings.boardTheme} pieceSet={settings.pieceSet}
          coordinates={settings.coordinates} showLegal={settings.showLegal}
          showLastMove={settings.showLastMove} animationMs={settings.animationMs}
        />
      </div>
      {bar(topColor === 'w' ? 'b' : 'w')}

      <div className="status" data-testid="status">
        {!outcome && (thinking ? t('coachThinking') : turn === userColor ? t('yourMove') : '')}
        {outcome && (
          <strong data-testid="result">
            {outcome.result === '1/2-1/2' ? t('draw') : (outcome.result === '1-0') === (userColor === 'w') ? t('youWon') : t('youLost')}
            {' — '}{t(('reason_' + outcome.reason) as 'reason_checkmate')}
          </strong>
        )}
      </div>

      {talk && comments.length > 0 && (
        <Dock testId="coach-dock" resetKey={comments[0]?.id} title={<span className="row gap"><CoachPortrait coach={coach} size={22} round /><span className="muted">{t('coachSays')} — {t('simulation')}</span></span>}>
          <div className="comments-now" data-testid="comments-now">{comments.slice(0, 2).map(renderComment)}</div>
        </Dock>
      )}

      {!outcome && (
        <div className="row gap wrap">
          <button className="btn" onClick={() => setOrientation(orientation === 'w' ? 'b' : 'w')}>{t('flip')}</button>
          {mode === 'training' && (
            <>
              <button className="btn" onClick={() => setHintStage((h) => Math.min(2, h + 1))} disabled={thinking || turn !== userColor} data-testid="hint">{t('hint')}</button>
              <button className="btn" onClick={() => setShowLines((v) => !v)} data-testid="analyze-pos">{t('analyzePos')}</button>
              <button className="btn" onClick={undo} disabled={hist.length < 1}>{t('undo')}</button>
            </>
          )}
          <button className="btn danger" onClick={resign} data-testid="resign">{t('resign')}</button>
        </div>
      )}
      {mode === 'training' && hintStage > 0 && !outcome && (
        <p className="muted small" data-testid="hint-text">{hintUci ? (hintStage === 1 ? t('hintPiece') : t('hintArrow')) : t('noHintYet')}</p>
      )}
      {mode === 'training' && showLines && !outcome && (
        <div className="card" data-testid="top-lines">
          <div className="muted small">{t('topLines')}</div>
          {bgHere ? bgHere.lines.map((l, i) => (
            <div key={i} className="pv-line" dir="ltr">
              <b>{formatScore(toWhitePov(l.score, turn))}</b> {pvToSan(fen, l.pv, 6).join(' ')}
            </div>
          )) : <span className="muted small">{t('noHintYet')}</span>}
        </div>
      )}

      {outcome && summary && (
        <GameSummary
          summary={summary} evals={evalsRef.current} userColor={userColor} coachName={coach.name[L]} userRating={profile?.rating}
          plies={hist.length} durationMs={session?.activeMs ?? 0}
          onAnalyze={savedId ? () => go({ name: 'analysis', gameId: savedId }) : undefined}
          onAgain={() => go({ name: 'coach', id: coach.id })}
        />
      )}

      {talk && comments.length > 2 && (
        <div className="card comments" data-testid="comments">
          <div className="muted small">{t('commentHistory')}</div>
          {comments.slice(2).map(renderComment)}
        </div>
      )}

      <MoveList sans={chess.current.history()} title={t('moves')} />
    </div>
  );
}

export function GameSummary(p: {
  userRating?: number | null;
  summary: ReturnType<typeof summarize>;
  evals: MoveEval[];
  userColor: Color;
  coachName: string;
  plies: number;
  durationMs: number;
  onAnalyze?: () => void;
  onAgain?: () => void;
}) {
  const { t, settings } = useApp();
  const L = settings.lang;
  const me = p.summary[p.userColor];
  const them = p.summary[p.userColor === 'w' ? 'b' : 'w'];
  const mine = p.evals.filter((e) => e.color === p.userColor);
  const good = mine.filter((e) => e.label === 'brilliant' || e.label === 'great' || e.label === 'best').slice(0, 4);
  const bad = mine.filter((e) => e.label === 'mistake' || e.label === 'blunder').slice(0, 4);
  const missed = mine.filter((e) => e.label === 'missedWin').slice(0, 3);
  const phases = (['opening', 'middlegame', 'endgame'] as const).filter((ph) => me.byPhase[ph].moves >= 3);
  const weakest = [...phases].sort((a, b) => me.byPhase[b].errors - me.byPhase[a].errors)[0];
  const strongest = [...phases].sort((a, b) => me.byPhase[a].loss / me.byPhase[a].moves - me.byPhase[b].loss / me.byPhase[b].moves)[0];
  const mv = (e: MoveEval) => `${Math.ceil(e.ply / 2)}${e.color === 'w' ? '.' : '…'} ${e.san}`;
  const est = estimateRatings(p.evals, p.userColor === 'w' ? { w: p.userRating } : { b: p.userRating });
  const meR = est[p.userColor], themR = est[p.userColor === 'w' ? 'b' : 'w'];
  const sans = [...p.evals].sort((a, b) => a.ply - b.ply).map((e) => e.san);
  const op = openingName(sans);
  return (
    <div className="card summary" data-testid="summary">
      <h2>{t('summary')}</h2>
      <p>{p.plies} {t('plies')} · {t('duration')}: {fmtDuration(p.durationMs, t)}</p>
      {op && <p className="small"><span className="muted">{t('opening')}:</span> <span dir="ltr">{op.eco} {op.name}</span></p>}
      <div className="acc-row">
        <div><span className="muted small">{t('you')}</span><b data-testid="acc-user">{me.accuracy ?? '—'}%</b>
          <span className="small" data-testid="gr-user">{t('gameRating')}: {meR ? <b dir="ltr">{meR.rating} ±{meR.plusMinus}</b> : t('grNeedMoves')}</span></div>
        <div><span className="muted small">{p.coachName}</span><b>{them.accuracy ?? '—'}%</b>
          <span className="small">{t('gameRating')}: {themR ? <b dir="ltr">{themR.rating} ±{themR.plusMinus}</b> : t('grNeedMoves')}</span></div>
      </div>
      <p className="muted tiny">{t('gameRatingNote')}{!p.userRating && ' ' + t('gameRatingNoPrior')}</p>
      <LabelTable summary={p.summary} userColor={p.userColor} coachName={p.coachName} />
      {good.length > 0 && <p><b>{t('bestMoves')}:</b> <span dir="ltr">{good.map(mv).join(', ')}</span></p>}
      {bad.length > 0 && <p><b>{t('yourMistakes')}:</b> <span dir="ltr">{bad.map(mv).join(', ')}</span></p>}
      {missed.length > 0 && <p><b>{t('missedChances')}:</b> <span dir="ltr">{missed.map(mv).join(', ')}</span></p>}
      <h2>{t('strengthsWeak')}</h2>
      {bad.length === 0 && missed.length === 0 ? <p>{t('noErrors')}</p> : null}
      {strongest && phases.length > 1 && strongest !== weakest && <p>{t('strongPhase', { phase: t(('phase_' + strongest) as 'phase_opening') })}</p>}
      {weakest && me.byPhase[weakest].errors > 0 && <p>{t('weakPhase', { phase: t(('phase_' + weakest) as 'phase_opening') })}</p>}
      <div className="row gap wrap">
        {p.onAnalyze && <button className="btn primary" onClick={p.onAnalyze} data-testid="analyze-game">{t('analyzeGame')}</button>}
        {p.onAgain && <button className="btn" onClick={p.onAgain}>{t('newGame')}</button>}
      </div>
      <span hidden>{L}</span>
    </div>
  );
}

export function LabelTable({ summary, userColor, coachName, names }: { summary: ReturnType<typeof summarize>; userColor: Color; coachName: string; names?: { w: string; b: string } }) {
  const { t, settings } = useApp();
  const L = settings.lang;
  const labels: MoveLabel[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'missedWin', 'blunder'];
  const other: Color = userColor === 'w' ? 'b' : 'w';
  return (
    <table className="label-table" data-testid="label-table">
      <thead><tr><th>{t('label_counts')}</th><th>{names ? names[userColor] : t('you')}</th><th>{names ? names[other] : coachName}</th></tr></thead>
      <tbody>
        {labels.map((l) => (
          <tr key={l}>
            <td><span className={'lb lb-' + l}>{LABEL_SYMBOL[l]}</span> {LABEL_TEXT[L][l]}</td>
            <td>{summary[userColor].counts[l]}</td>
            <td>{summary[other].counts[l]}</td>
          </tr>
        ))}
        <tr><td><b>{t('accuracy')}</b></td><td><b>{summary[userColor].accuracy ?? '—'}%</b></td><td><b>{summary[other].accuracy ?? '—'}%</b></td></tr>
      </tbody>
    </table>
  );
}

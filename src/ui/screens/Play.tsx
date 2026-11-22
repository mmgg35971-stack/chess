import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { useApp } from '../AppContext';
import { Board } from '../board/Board';
import {
  boardOutcome, checkedKingSquare, isPromotion, legalTargets, resignOutcome,
  timeoutOutcome, tryMove, uciToMove, type Color, type GameOutcome,
} from '../../lib/chess/game';
import { buildPgn, pgnDate } from '../../lib/chess/pgn';
import { getEngine } from '../../lib/engine/engine';
import { ENGINE_LEVELS, levelConfig } from '../../lib/engine/levels';
import { engineThinkMs } from '../../lib/engine/timing';
import type { Score } from '../../lib/engine/uci';
import { clearSession, loadSession, saveFinishedGame, saveSession } from '../../lib/storage/repo';
import type { GameMode, Session } from '../../lib/storage/db';
import { playMoveSound } from '../../lib/sound';
import { fmtClock, fmtDuration } from '../format';
import { saveTextFile, stamp } from '../../lib/files';

export const TIME_CONTROLS: Record<string, { base: number; inc: number } | null> = {
  none: null,
  '5+0': { base: 5 * 60e3, inc: 0 },
  '10+0': { base: 10 * 60e3, inc: 0 },
  '15+10': { base: 15 * 60e3, inc: 10e3 },
  '30+0': { base: 30 * 60e3, inc: 0 },
};

interface Setup {
  color: Color | 'random';
  level: number;
  mode: GameMode;
  timeControl: string;
}

export function Play({ resume }: { resume?: boolean }) {
  const { t, settings, profile, go, bumpData } = useApp();
  const chess = useRef(new Chess());
  const [fen, setFen] = useState(chess.current.fen());
  const [phase, setPhase] = useState<'setup' | 'playing' | 'over'>('setup');
  const [setup, setSetup] = useState<Setup>({ color: 'w', level: 3, mode: 'competitive', timeControl: 'none' });
  const [session, setSession] = useState<Session | null>(null);
  const [orientation, setOrientation] = useState<Color>('w');
  const [thinking, setThinking] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [savedPgn, setSavedPgn] = useState('');
  const [savedId, setSavedId] = useState<number | null>(null);
  const [clocks, setClocks] = useState<{ w: number; b: number } | null>(null);
  const gen = useRef(0); // invalidates stale engine replies (undo / resign / new game)
  const sessionRef = useRef<Session | null>(null);
  const clocksRef = useRef<{ w: number; b: number } | null>(null);
  const lastTick = useRef(Date.now());
  const finishing = useRef(false);

  const userName = profile?.name || t('defaultName');
  const sync = () => setFen(chess.current.fen());

  useEffect(() => {
    getEngine().whenReady().then(() => setEngineReady(true));
  }, []);

  // Resume an unfinished game saved after the last move.
  useEffect(() => {
    if (!resume) return;
    loadSession().then((s) => {
      if (!s) return;
      const c = new Chess();
      for (const san of s.sanMoves) c.move(san);
      chess.current = c;
      sessionRef.current = s;
      setSession(s);
      clocksRef.current = s.clocks;
      setClocks(s.clocks);
      setOrientation(s.userColor);
      setPhase('playing');
      sync();
      if (c.turn() !== s.userColor) engineMove(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume]);

  const persist = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    s.sanMoves = chess.current.history();
    s.clocks = clocksRef.current ? { ...clocksRef.current } : null;
    await saveSession({ ...s });
  }, []);

  const finish = useCallback(async (o: GameOutcome) => {
    const s = sessionRef.current;
    if (!s || finishing.current) return;
    finishing.current = true;
    gen.current++;
    setOutcome(o);
    setPhase('over');
    setThinking(false);
    if (settings.sound) playMoveSound('end');
    const lvl = `Stockfish level ${s.level}`;
    const white = s.userColor === 'w' ? userName : lvl;
    const black = s.userColor === 'b' ? userName : lvl;
    const now = Date.now();
    const pgn = buildPgn(chess.current.history(), {
      Event: s.mode === 'training' ? 'Training game' : 'Casual game',
      Site: 'Chess Grandmaster Academy (offline)',
      Date: pgnDate(new Date(s.startedAt)),
      White: white,
      Black: black,
      Result: o.result,
      Termination: o.reason,
      TimeControl: s.timeControl,
    });
    setSavedPgn(pgn);
    const gid = await saveFinishedGame({
      pgn, white, black, userColor: s.userColor,
      opponent: { kind: 'engine', level: s.level },
      mode: s.mode, result: o.result, reason: o.reason,
      plies: chess.current.history().length,
      startedAt: s.startedAt, endedAt: now, durationMs: s.activeMs,
      timeControl: s.timeControl,
    });
    setSavedId(gid);
    bumpData();
  }, [settings.sound, t, userName, bumpData]);

  const afterMove = useCallback((captured: boolean) => {
    const s = sessionRef.current!;
    const mover: Color = chess.current.turn() === 'w' ? 'b' : 'w';
    const tc = TIME_CONTROLS[s.timeControl];
    if (tc && clocksRef.current) {
      clocksRef.current = { ...clocksRef.current, [mover]: clocksRef.current[mover] + tc.inc };
      setClocks(clocksRef.current);
    }
    if (settings.sound) playMoveSound(chess.current.inCheck() ? 'check' : captured ? 'capture' : 'move');
    sync();
    const o = boardOutcome(chess.current);
    if (o) {
      finish(o);
      return true;
    }
    persist();
    return false;
  }, [finish, persist, settings.sound]);

  const engineMove = useCallback(async (s: Session) => {
    const myGen = ++gen.current;
    setThinking(true);
    const startedAt = Date.now();
    const cfg = levelConfig(s.level);
    const engine = getEngine();
    await engine.setOption('Skill Level', cfg.skill);
    const res = await engine.search(chess.current.fen(), cfg.limits, { multipv: 2 });
    if (myGen !== gen.current) return; // game changed while thinking
    // Spend a realistic amount of time on the move (its own clock keeps running).
    const tc = TIME_CONTROLS[s.timeControl];
    const target = engineThinkMs({
      legalMoves: chess.current.moves().length,
      gapCp: res.lines.length >= 2 ? scoreCp(res.lines[0].score) - scoreCp(res.lines[1].score) : null,
      ply: chess.current.history().length,
      clockMs: clocksRef.current ? clocksRef.current[chess.current.turn()] : null,
      incMs: tc?.inc ?? 0,
    });
    const wait = target - (Date.now() - startedAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (myGen !== gen.current) return;
    setThinking(false);
    if (!res.bestmove) return;
    const mv = tryMove(chess.current, uciToMove(res.bestmove));
    if (mv) afterMove(!!mv.captured);
  }, [afterMove]);

  // Clocks + active-time accounting.
  useEffect(() => {
    if (phase !== 'playing') return;
    lastTick.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(now - lastTick.current, 1000);
      lastTick.current = now;
      if (document.hidden) return;
      const s = sessionRef.current;
      if (!s) return;
      s.activeMs += dt;
      if (clocksRef.current) {
        const turn = chess.current.turn();
        const left = clocksRef.current[turn] - dt;
        clocksRef.current = { ...clocksRef.current, [turn]: Math.max(0, left) };
        setClocks(clocksRef.current);
        if (left <= 0) finish(timeoutOutcome(chess.current, turn));
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, finish]);

  const start = async () => {
    const userColor: Color = setup.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color;
    const tc = TIME_CONTROLS[setup.timeControl];
    chess.current = new Chess();
    finishing.current = false;
    const s: Session = {
      id: 'current', sanMoves: [], userColor, level: setup.level, mode: setup.mode,
      timeControl: setup.timeControl, clocks: tc ? { w: tc.base, b: tc.base } : null,
      startedAt: Date.now(), activeMs: 0, undoCount: 0,
    };
    sessionRef.current = s;
    clocksRef.current = s.clocks;
    setClocks(s.clocks);
    setSession(s);
    setOutcome(null);
    setOrientation(userColor);
    setPhase('playing');
    sync();
    await saveSession(s);
    await getEngine().newGame();
    if (userColor === 'b') engineMove(s);
  };

  const onUserMove = (from: Square, to: Square, promotion?: string) => {
    const s = sessionRef.current;
    if (!s || phase !== 'playing' || thinking || chess.current.turn() !== s.userColor) return false;
    const mv = tryMove(chess.current, { from, to, promotion });
    if (!mv) return false;
    const over = afterMove(!!mv.captured);
    if (!over) engineMove(s);
    return true;
  };

  const undo = () => {
    const s = sessionRef.current;
    if (!s || s.mode !== 'training') return;
    gen.current++;
    if (thinking) getEngine().stop();
    setThinking(false);
    // Undo back to the user's turn (engine reply + user's move).
    chess.current.undo();
    if (chess.current.turn() !== s.userColor) chess.current.undo();
    s.undoCount++;
    sync();
    persist();
  };

  const resign = () => {
    const s = sessionRef.current;
    if (!s || !window.confirm(t('resignConfirm'))) return;
    if (thinking) getEngine().stop();
    finish(resignOutcome(s.userColor));
  };

  const hist = chess.current.history({ verbose: true });
  const last = hist[hist.length - 1];
  const userColor = session?.userColor ?? 'w';
  const boardEl = (
    <Board
      fen={fen}
      orientation={orientation}
      movable={phase === 'playing' && !thinking ? userColor : null}
      targets={(sq) => legalTargets(chess.current, sq)}
      needsPromotion={(f, to) => isPromotion(chess.current, f, to)}
      onMove={onUserMove}
      lastMove={last ? [last.from as Square, last.to as Square] : null}
      checkSquare={checkedKingSquare(chess.current)}
      themeId={settings.boardTheme}
      pieceSet={settings.pieceSet}
      coordinates={settings.coordinates}
      showLegal={settings.showLegal}
      showLastMove={settings.showLastMove}
      animationMs={settings.animationMs}
    />
  );

  if (phase === 'setup') {
    return (
      <div className="screen">
        <h1>{t('newGame')}</h1>
        <div className="card">
          <div className="field">
            <span>{t('yourColor')}</span>
            <Segmented value={setup.color} onChange={(v) => setSetup({ ...setup, color: v as Setup['color'] })}
              options={[['w', t('white')], ['b', t('black')], ['random', t('random')]]} />
          </div>
          <label className="field">
            <span>{t('level')}: {setup.level}</span>
            <input type="range" min={1} max={ENGINE_LEVELS.length} value={setup.level} aria-label={t('level')}
              onChange={(e) => setSetup({ ...setup, level: Number(e.target.value) })} />
          </label>
          <p className="muted small">{t('levelNote')}</p>
          <label className="field">
            <span>{t('timeControl')}</span>
            <select value={setup.timeControl} onChange={(e) => setSetup({ ...setup, timeControl: e.target.value })}>
              {Object.keys(TIME_CONTROLS).map((k) => <option key={k} value={k}>{k === 'none' ? t('noClock') : k}</option>)}
            </select>
          </label>
          <div className="field">
            <span>{t('mode')}</span>
            <Segmented value={setup.mode} onChange={(v) => setSetup({ ...setup, mode: v as GameMode })}
              options={[['competitive', t('competitive')], ['training', t('training')]]} />
          </div>
          <button className="btn primary wide" onClick={start} disabled={!engineReady} data-testid="start-game">
            {engineReady ? t('start') : t('engineLoading')}
          </button>
        </div>
      </div>
    );
  }

  const opp = `Stockfish · ${t('level')} ${session?.level}`;
  const oppColor: Color = userColor === 'w' ? 'b' : 'w';
  const topColor: Color = orientation === 'w' ? 'b' : 'w';
  const playerBar = (c: Color) => (
    <div className={'player-bar' + (phase === 'playing' && chess.current.turn() === c ? ' active' : '')}>
      <span>{c === userColor ? userName : opp}</span>
      {clocks && <span className="clock" data-testid={'clock-' + c}>{fmtClock(clocks[c])}</span>}
    </div>
  );

  return (
    <div className="screen play">
      {playerBar(topColor)}
      {boardEl}
      {playerBar(topColor === 'w' ? 'b' : 'w')}
      <div className="status" data-testid="status">
        {phase === 'playing' && (thinking ? t('thinking') : chess.current.turn() === userColor ? t('yourMove') : '')}
        {phase === 'over' && outcome && (
          <strong data-testid="result">
            {outcome.result === '1/2-1/2' ? t('draw') : (outcome.result === '1-0') === (userColor === 'w') ? t('youWon') : t('youLost')}
            {' — '}{t(('reason_' + outcome.reason) as any)}
          </strong>
        )}
      </div>
      {phase === 'playing' && (
        <div className="row gap">
          <button className="btn" onClick={() => setOrientation(orientation === 'w' ? 'b' : 'w')}>{t('flip')}</button>
          {session?.mode === 'training' && <button className="btn" onClick={undo} disabled={hist.length < 1}>{t('undo')}</button>}
          <button className="btn danger" onClick={resign} data-testid="resign">{t('resign')}</button>
        </div>
      )}
      {phase === 'over' && (
        <div className="card">
          <h2>{t('gameOver')}</h2>
          <p>{hist.length} {t('plies')} · {t('duration')}: {fmtDuration(session?.activeMs ?? 0, t)}</p>
          <div className="row gap wrap">
            {savedId && <button className="btn primary" onClick={() => go({ name: 'analysis', gameId: savedId })} data-testid="analyze-game">{t('analyzeGame')}</button>}
            <button className="btn" onClick={() => { setPhase('setup'); clearSession(); }}>{t('newGame')}</button>
            <button className="btn" onClick={() => saveTextFile(`game-${stamp()}.pgn`, savedPgn, 'application/x-chess-pgn')}>{t('exportPgn')}</button>
            <button className="btn" onClick={() => go({ name: 'home' })}>{t('backHome')}</button>
          </div>
        </div>
      )}
      <MoveList sans={chess.current.history()} title={t('moves')} />
      <span hidden data-testid="opp-color">{oppColor}</span>
    </div>
  );
}

function scoreCp(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 10000 - s.mate : -10000 - s.mate;
  return s.cp ?? 0;
}

export function MoveList({ sans, title, current, onPick }: { sans: string[]; title: string; current?: number; onPick?: (ply: number) => void }) {
  const rows = [];
  for (let i = 0; i < sans.length; i += 2) {
    rows.push(
      <div className="mv-row" key={i}>
        <span className="mv-n">{i / 2 + 1}.</span>
        <span className={'mv' + (current === i + 1 ? ' cur' : '')} onClick={() => onPick?.(i + 1)}>{sans[i]}</span>
        <span className={'mv' + (current === i + 2 ? ' cur' : '')} onClick={() => onPick?.(i + 2)}>{sans[i + 1] ?? ''}</span>
      </div>,
    );
  }
  return (
    <div className="card moves" dir="ltr" data-testid="moves">
      <div className="muted small">{title}</div>
      <div className="mv-grid">{rows}</div>
    </div>
  );
}

export function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

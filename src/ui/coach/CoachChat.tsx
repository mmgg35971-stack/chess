import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { useApp } from '../AppContext';
import { Board } from '../board/Board';
import { CoachPortrait } from './Emblem';
import { Segmented } from '../screens/Play';
import { coachById, coachGameStats } from '../../lib/coach/coaches';
import { getSetting, setSetting } from '../../lib/storage/repo';
import { getEngine } from '../../lib/engine/engine';
import { formatScore, toWhitePov } from '../../lib/engine/uci';
import { fetchGz } from '../../lib/puzzles/store';
import { getPuzzleRating, attemptedIds } from '../../lib/puzzles/progress';
import { themeName } from '../../lib/puzzles/explain';
import { checkedKingSquare } from '../../lib/chess/game';
import { topicById, lessonById } from '../../lib/lessons/lessons';
import { openingById } from '../../lib/academy/defs';
import { bookIndex, type BookIndex } from '../../lib/ai/books';
import { knowledgeIndex, type KnowledgeIndex } from '../../lib/ai/knowledge';
import { AiError, PROVIDERS, needsKey, defaultHttp, listModels, loadAiConfig, saveAiConfig, chat, type AiConfig, type Http, type Msg, type ProviderId } from '../../lib/ai/client';
import { buildSystemPrompt, runTurn, puzzleQuery, type AnalyseResult } from '../../lib/ai/agent';
import { localReply, matchConcepts } from '../../lib/ai/local-coach';
import { parseReply, type Segment } from '../../lib/ai/tags';
import { puzzleStore } from '../puzzles/Puzzles';
import type { Puzzle } from '../../lib/puzzles/categories';
import type { TKey } from '../../i18n';

interface ChatMsg { role: 'user' | 'coach'; text: string; at: number; error?: boolean; topic?: string; note?: string }

const loadBooks = () => bookIndex((p) => fetchGz('./data/books/', p));
const loadKnowledge = () => knowledgeIndex((p) => fetchGz('./data/books/', p));
const HISTORY = 14;

function useBoardProps() {
  const { settings } = useApp();
  return { themeId: settings.boardTheme, pieceSet: settings.pieceSet, coordinates: settings.coordinates, showLegal: false, showLastMove: true, animationMs: settings.animationMs };
}

/** Stockfish check used by the coach's analyse_position tool and the "check" button. */
export async function analyseFen(fen: string, depth = 14): Promise<AnalyseResult | null> {
  try {
    const g = new Chess(fen);
    const stm = g.turn();
    const r = await getEngine().search(fen, { depth }, { multipv: 3 });
    if (!r.lines.length) return null;
    const best = r.lines.map((l) => {
      const c = new Chess(fen);
      const out: string[] = [];
      for (const u of l.pv.slice(0, 8)) {
        try { out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; }
      }
      return out;
    });
    return { eval: formatScore(toWhitePov(r.lines[0].score, stm)), best, sideToMove: stm };
  } catch { return null; }
}

/**
 * In Arabic text, Latin runs (moves like 1.e4 e5, citations like "(Lasker, Chess Strategy, 1915)") are
 * isolated so the bidi algorithm does not scramble their order.
 */
const LATIN = /(\([^()\u0600-\u06FF]*[A-Za-z][^()\u0600-\u06FF]*\)|[A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ+#=.\-–,:'’…/ ]*[A-Za-z0-9À-ÿ+#)])/g;
function Isolated({ text }: { text: string }) {
  if (!/[\u0600-\u06FF]/.test(text)) return /[A-Za-z]/.test(text) ? <bdi dir="ltr">{text}</bdi> : <>{text}</>;
  return <>{text.split(LATIN).map((p, i) => (i % 2 ? <bdi key={i} dir="ltr">{p}</bdi> : <Fragment key={i}>{p}</Fragment>))}</>;
}

// ---------- text with **bold** and simple bullets ----------
function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((ln, i) => {
        const bullet = /^\s*[-•*]\s+/.test(ln);
        const body = ln.replace(/^\s*[-•*]\s+/, '').replace(/^#+\s*/, '');
        const parts = body.split(/(\*\*[^*]+\*\*)/g).map((p, k) => p.startsWith('**') && p.endsWith('**') ? <b key={k}><Isolated text={p.slice(2, -2)} /></b> : <Isolated key={k} text={p} />);
        if (!body.trim()) return <div key={i} className="ch-gap" />;
        return bullet ? <div key={i} className="ch-li">• {parts}</div> : <p key={i}>{parts}</p>;
      })}
    </>
  );
}

function BoardSeg({ seg }: { seg: Extract<Segment, { kind: 'board' }> }) {
  const { t } = useApp();
  const bp = useBoardProps();
  const [ev, setEv] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pos = useMemo(() => new Chess(seg.fen), [seg.fen]);
  const check = async () => {
    setBusy(true);
    const r = await analyseFen(seg.fen);
    setBusy(false);
    setEv(r ? t('ch_eval', { e: r.eval, best: r.best[0]?.slice(0, 3).join(' ') ?? '—' }) : '—');
  };
  return (
    <div className="ch-board" data-testid="ch-board">
      <Board fen={seg.fen} orientation={seg.flip ? 'b' : 'w'} movable={null} targets={() => []} needsPromotion={() => false} onMove={() => false}
        arrows={seg.arrows.map(([from, to]) => ({ from: from as Square, to: to as Square }))} checkSquare={checkedKingSquare(pos)} {...bp} />
      {seg.caption && <div className="ch-cap">{seg.caption}</div>}
      <div className="row gap wrap">
        <button className="btn small" onClick={check} disabled={busy}>{busy ? '…' : t('ch_check')}</button>
        {ev && <span className="small" dir="ltr">{ev}</span>}
      </div>
    </div>
  );
}

function LineSeg({ seg }: { seg: Extract<Segment, { kind: 'line' }> }) {
  const { t } = useApp();
  const bp = useBoardProps();
  const [i, setI] = useState(seg.sans.length);
  const fen = seg.fens[i];
  const last = useMemo(() => {
    if (i === 0) return null;
    const g = new Chess(seg.fens[i - 1]);
    const m = g.move(seg.sans[i - 1]);
    return [m.from, m.to] as [Square, Square];
  }, [i, seg]);
  const startNo = Number(seg.fen.split(' ')[5] || 1), blackFirst = seg.fen.split(' ')[1] === 'b';
  const label = (k: number) => {
    const ply = k + (blackFirst ? 1 : 0);
    const no = startNo + Math.floor(ply / 2);
    return ply % 2 === 0 ? `${no}.` : k === 0 ? `${no}…` : '';
  };
  return (
    <div className="ch-board" data-testid="ch-line">
      <Board fen={fen} orientation={blackFirst ? 'b' : 'w'} movable={null} targets={() => []} needsPromotion={() => false} onMove={() => false}
        lastMove={last} checkSquare={checkedKingSquare(new Chess(fen))} {...bp} />
      {seg.caption && <div className="ch-cap">{seg.caption}</div>}
      <div className="ch-moves" dir="ltr">
        {seg.sans.map((s, k) => (
          <button key={k} className={'ch-mv' + (k + 1 === i ? ' on' : '')} onClick={() => setI(k + 1)}>{label(k)}{s}</button>
        ))}
      </div>
      <div className="row gap" dir="ltr" style={{ justifyContent: 'center' }}>
        <button className="btn small" onClick={() => setI(0)} disabled={i === 0}>⏮</button>
        <button className="btn small" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} data-testid="ch-prev">◀</button>
        <span className="small muted">{t('ch_step', { i, n: seg.sans.length })}</span>
        <button className="btn small" onClick={() => setI(Math.min(seg.sans.length, i + 1))} disabled={i === seg.sans.length} data-testid="ch-next">▶</button>
        <button className="btn small" onClick={() => setI(seg.sans.length)} disabled={i === seg.sans.length}>⏭</button>
      </div>
      {seg.bad && <div className="small muted">{t('ch_badMove', { san: seg.bad })}</div>}
    </div>
  );
}

function PuzzlesSeg({ seg }: { seg: Extract<Segment, { kind: 'puzzles' }> }) {
  const { t, go, settings } = useApp();
  const [list, setList] = useState<{ row: number; puzzle: Puzzle }[] | null>(null);
  const q = useMemo(() => puzzleQuery(seg.theme), [seg.theme]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [r, seen] = await Promise.all([getPuzzleRating(), attemptedIds()]);
        const res = await puzzleStore.pickMany(q.cat, r.rating, seg.n, { themes: q.themes, attempted: seen });
        if (live) setList(res);
      } catch { if (live) setList([]); }
    })();
    return () => { live = false; };
  }, [q, seg.n]);
  if (!list) return <div className="ch-puzzles muted small">…</div>;
  if (!list.length) return <div className="ch-puzzles muted small">{t('ch_puzzlesNone')}</div>;
  const open = (k: number) => go({ name: 'puzzle', cat: q.cat, rows: list.slice(k).map((x) => x.row) });
  return (
    <div className="ch-puzzles" data-testid="ch-puzzles">
      <div className="small"><b>{t('ch_puzzles')}</b>{q.themes ? ` — ${themeName(q.themes[0], settings.lang)}` : ''}</div>
      <div className="ch-pz-row">
        {list.map((x, k) => (
          <button key={x.puzzle.id} className="ch-pz" onClick={() => open(k)} data-testid="ch-pz">
            <span dir="ltr">{x.puzzle.rating}</span>
            <span className="tiny muted">{x.puzzle.themes.filter((th) => th !== 'short' && th !== 'middlegame' && th !== 'endgame' && th !== 'opening').slice(0, 2).map((th) => themeName(th, settings.lang)).join('، ')}</span>
          </button>
        ))}
      </div>
      <button className="btn small primary" onClick={() => open(0)}>{t('ch_playAll')}</button>
    </div>
  );
}

function LinkSeg({ seg }: { seg: Extract<Segment, { kind: 'link' }> }) {
  const { t, go, settings } = useApp();
  const L = settings.lang;
  const item = seg.type === 'topic' ? topicById(seg.id) : seg.type === 'lesson' ? lessonById(seg.id) : null;
  const op = seg.type === 'opening' ? openingById(seg.id) : null;
  const title = item ? item.title[L] : op ? op.name[L] : null;
  if (!title) return null;
  return (
    <button className="ch-link" onClick={() => go(seg.type === 'opening' ? { name: 'opening', id: seg.id } : seg.type === 'topic' ? { name: 'topic', id: seg.id } : { name: 'lesson', id: seg.id })}>
      <span className="pill">{t(('ch_link_' + seg.type) as TKey)}</span> {title} ›
    </button>
  );
}

function CoachReply({ text, onAsk }: { text: string; onAsk: (q: string) => void }) {
  const { t } = useApp();
  const segs = useMemo(() => parseReply(text), [text]);
  return (
    <>
      {segs.map((s, i) => {
        switch (s.kind) {
          case 'text': return <RichText key={i} text={s.text} />;
          case 'board': return <BoardSeg key={i} seg={s} />;
          case 'line': return <LineSeg key={i} seg={s} />;
          case 'puzzles': return <PuzzlesSeg key={i} seg={s} />;
          case 'link': return <LinkSeg key={i} seg={s} />;
          case 'ask': return <button key={i} className="ch-chip ch-ask" onClick={() => onAsk(s.q)} data-testid="ch-ask">{s.q} ›</button>;
          case 'invalid': return <div key={i} className="small muted">{t('ch_badPos')}</div>;
        }
      })}
    </>
  );
}

function errorText(e: unknown, t: ReturnType<typeof useApp>['t']) {
  if (e instanceof AiError) return e.kind === 'server' ? `${t('ch_err_server')} ${e.message.slice(0, 200)}` : t(('ch_err_' + e.kind) as TKey);
  return `${t('ch_err_server')} ${String((e as Error)?.message ?? e).slice(0, 200)}`;
}

let httpP: Promise<Http> | null = null;
const http = () => (httpP ??= defaultHttp());

export function CoachChat({ id }: { id: string }) {
  const { t, go, settings, profile } = useApp();
  const L = settings.lang;
  const coach = coachById(id)!;
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [cfg] = useState<AiConfig>(() => loadAiConfig());
  const [books, setBooks] = useState<BookIndex | null>(null);
  const [kn, setKn] = useState<KnowledgeIndex | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const key = 'chat:' + id;
  const hasKey = !needsKey(cfg.provider) || !!cfg.apiKey;

  useEffect(() => { getSetting<ChatMsg[]>(key, []).then(setMsgs); loadBooks().then(setBooks).catch(() => {}); loadKnowledge().then(setKn).catch(() => {}); }, [key]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, busy]);

  const save = (m: ChatMsg[]) => { setMsgs(m); setSetting(key, m.slice(-200)); };

  const send = async (text: string, base = msgs) => {
    const q = text.trim();
    if (!q || busy) return;
    const withQ = [...base, { role: 'user' as const, text: q, at: Date.now() }];
    save(withQ);
    setInput('');
    setBusy(t('ch_thinking'));
    const lastTopic = [...base].reverse().find((m) => m.role === 'coach' && m.topic)?.topic;
    const offline = async (note?: string) => {
      const kx = await loadKnowledge();
      const r = await localReply({ question: q, lang: L, coach, stats: coachGameStats(id), kx, lastTopic, analyse: (f) => analyseFen(f) });
      save([...withQ, { role: 'coach', text: r.text, at: Date.now(), topic: r.topic, note }]);
    };
    try {
      if (cfg.provider === 'local') { await offline(); return; }
      const [ix, kx, pr] = await Promise.all([loadBooks(), loadKnowledge(), getPuzzleRating().catch(() => null)]);
      let system = buildSystemPrompt({
        coach, stats: coachGameStats(id), lang: L, userName: profile?.name, userRating: profile?.rating ?? null,
        puzzleRating: pr ? Math.round(pr.rating) : null, books: ix.data.books,
        network: { concepts: kx.data.concepts.length, refs: kx.data.refs.length, coachRefs: kx.data.refs.filter((r) => r.coaches.includes(id)) },
      });
      const history: Msg[] = withQ.filter((m) => !m.error).slice(-HISTORY).map((m) => m.role === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text });
      if (cfg.provider === 'free') {
        // the free service may not support tools: give it the matching concepts up front instead
        const ctx = matchConcepts(q, kx, 2).map((m) => kx.view(m.c));
        system += `

TOOLS ARE NOT AVAILABLE in this mode. Here are the concepts from the knowledge network that match the question (use them as your main source and name their source books):
${JSON.stringify(ctx)}`;
        try {
          const r = await chat(cfg, await http(), system, history, []);
          if (!r.text.trim()) throw new AiError('server', 'empty');
          save([...withQ, { role: 'coach', text: r.text.trim(), at: Date.now() }]);
        } catch {
          await offline(t('ch_freeFallback'));
        }
        return;
      }
      const answer = await runTurn({ cfg, http: await http(), system, history, tools: { books: loadBooks, knowledge: loadKnowledge, analyse: (f) => analyseFen(f) }, onStatus: setBusy, lang: L });
      save([...withQ, { role: 'coach', text: answer, at: Date.now() }]);
    } catch (e) {
      save([...withQ, { role: 'coach', text: errorText(e, t), at: Date.now(), error: true }]);
    } finally {
      setBusy(null);
    }
  };

  const retry = () => {
    const lastUser = [...msgs].reverse().findIndex((m) => m.role === 'user');
    if (lastUser < 0) return;
    const idx = msgs.length - 1 - lastUser;
    send(msgs[idx].text, msgs.slice(0, idx));
  };

  const clear = () => { if (confirm(t('ch_clearConfirm'))) save([]); };
  const sugg: TKey[] = ['ch_sug1', 'ch_sug2', 'ch_sug3', 'ch_sug4'];

  return (
    <div className="screen chat-screen">
      <div className="card ch-head">
        <CoachPortrait coach={coach} size={48} round />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{coach.name[L]}</h2>
          <div className="tiny muted" data-testid="ch-mode">{cfg.provider === 'local' ? t('ch_offline') : `${t('ch_online')} · ${t(('ai_p_' + cfg.provider) as TKey)}`}</div>
        </div>
        <button className="btn small" onClick={() => go({ name: 'aiSettings' })} aria-label={t('ch_settings')} data-testid="ch-settings">⚙</button>
        {msgs.length > 0 && <button className="btn small" onClick={clear} aria-label={t('ch_clear')} title={t('ch_clear')} data-testid="ch-clear">🗑</button>}
      </div>

      <button className="ch-info-toggle small" onClick={() => setShowInfo(!showInfo)} data-testid="ch-info">ⓘ {t('ch_honest')}</button>
      {showInfo && (
        <div className="card small" data-testid="ch-info-body">
          <p>{t('ch_honestBody', { name: coach.name[L], n: books?.data.books.length ?? 7, c: kn?.data.concepts.length ?? 150, r: kn?.data.refs.length ?? 220 })}</p>
          {kn && (
            <details data-testid="ch-network">
              <summary>{t('ch_network', { c: kn.data.concepts.length, r: kn.data.refs.length })}</summary>
              <ul className="bullets" dir="ltr">{[...kn.data.refs].sort((a, b) => a.author.localeCompare(b.author)).map((b) => <li key={b.id}>{b.author}, <i>{b.title}</i> ({b.year})</li>)}</ul>
            </details>
          )}
          {books && (
            <details>
              <summary>{t('ch_books')}</summary>
              <ul className="bullets" dir="ltr">{books.data.books.map((b) => <li key={b.id}>{b.author}, <i>{b.title}</i> ({b.year})</li>)}</ul>
            </details>
          )}
          <p className="muted">{t('ch_privacy')}</p>
        </div>
      )}

      {!hasKey && (
        <div className="card" data-testid="ch-nokey">
          <p>{t('ch_noKey')}</p>
          <button className="btn primary" onClick={() => go({ name: 'aiSettings' })}>{t('ch_addKey')}</button>
        </div>
      )}

      <div className="ch-list" data-testid="ch-list">
        {msgs.length === 0 && hasKey && (
          <div className="ch-sugg">
            <p className="muted small">{t('ch_openHint')}</p>
            {sugg.map((k) => <button key={k} className="ch-chip" onClick={() => send(t(k))} data-testid="ch-sugg">{t(k)}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={'ch-msg ' + (m.role === 'user' ? 'me' : 'coach') + (m.error ? ' err' : '')} data-testid={m.role === 'user' ? 'ch-user' : 'ch-coach'}>
            {m.note && <div className="tiny muted">{m.note}</div>}
            {m.role === 'coach' && !m.error ? <CoachReply text={m.text} onAsk={(q) => send(q)} /> : <p>{m.text}</p>}
            {m.error && i === msgs.length - 1 && <button className="btn small" onClick={retry}>{t('ch_retry')}</button>}
          </div>
        ))}
        {busy && <div className="ch-msg coach typing" data-testid="ch-busy"><span className="dots"><i /><i /><i /></span> <span className="small muted">{busy}</span></div>}
        <div ref={endRef} />
      </div>

      <form className="ch-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('ch_placeholder')} rows={1} disabled={!hasKey}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} data-testid="ch-input" />
        <button className="btn primary" type="submit" disabled={!hasKey || !!busy || !input.trim()} data-testid="ch-send">{t('ch_send')}</button>
      </form>
    </div>
  );
}

// ---------- settings ----------
export function AiSettings() {
  const { t, toast } = useApp();
  const [c, setC] = useState<AiConfig>(() => loadAiConfig());
  const [show, setShow] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [msg, setMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const p = PROVIDERS[c.provider];

  const setProvider = (v: string) => {
    const id = v as ProviderId;
    setC({ ...c, provider: id, model: PROVIDERS[id].model || (id === 'openai' ? c.model : ''), baseUrl: id === 'openai' ? (c.provider === 'openai' ? c.baseUrl : PROVIDERS.openai.baseUrl) : PROVIDERS[id].baseUrl });
    setModels([]); setMsg('');
  };
  const save = () => { saveAiConfig({ ...c, apiKey: c.apiKey.trim(), model: c.model.trim(), baseUrl: c.baseUrl.trim() }); toast(t('ai_saved')); };
  const fetchModels = async () => {
    setBusy(true); setMsg('');
    try { setModels(await listModels(c, await http())); } catch (e) { setMsg(errorText(e, t)); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true); setMsg('');
    try { await chat({ ...c, apiKey: c.apiKey.trim() }, await http(), 'Reply with the single word OK.', [{ role: 'user', content: 'ping' }], []); setMsg(t('ai_testOk')); }
    catch (e) { setMsg(errorText(e, t)); }
    setBusy(false);
  };

  return (
    <div className="screen">
      <div className="card">
        <h2>{t('ai_title')}</h2>
        <p className="small muted">{t('ch_privacy')}</p>
        <div className="field col"><span>{t('ai_provider')}</span>
          <div className="ai-providers" role="radiogroup">
            {(['local', 'free', 'gemini', 'anthropic', 'openai'] as ProviderId[]).map((id) => (
              <label key={id} className={'ai-prov' + (c.provider === id ? ' on' : '')} data-testid={'ai-p-' + id}>
                <input type="radio" name="ai-provider" checked={c.provider === id} onChange={() => setProvider(id)} />
                <span><b>{t(('ai_p_' + id) as TKey)}</b><br /><span className="tiny muted">{t(('ai_pd_' + id) as TKey)}</span></span>
              </label>
            ))}
          </div>
        </div>
        {c.provider === 'free' && <p className="small">{t('ai_freeNote')}</p>}
        {c.provider === 'gemini' && <p className="small">{t('ai_geminiNote')}</p>}
        {p.keyUrl && <p className="small">{t('ai_getKey')} <span dir="ltr" className="selectable">{p.keyUrl}</span></p>}
        {c.provider === 'openai' && (
          <label className="field col"><span>{t('ai_baseUrl')}</span>
            <input dir="ltr" value={c.baseUrl} onChange={(e) => setC({ ...c, baseUrl: e.target.value })} data-testid="ai-base" />
          </label>
        )}
        {c.provider !== 'local' && c.provider !== 'free' && <>
        <label className="field col"><span>{t('ai_key')}</span>
          <div className="row gap">
            <input dir="ltr" type={show ? 'text' : 'password'} value={c.apiKey} onChange={(e) => setC({ ...c, apiKey: e.target.value })} autoComplete="off" style={{ flex: 1 }} data-testid="ai-key" />
            <button className="btn small" type="button" onClick={() => setShow(!show)}>{show ? t('ai_hide') : t('ai_show')}</button>
          </div>
        </label>
        <label className="field col"><span>{t('ai_model')}</span>
          <input dir="ltr" value={c.model} onChange={(e) => setC({ ...c, model: e.target.value })} list="ai-models" data-testid="ai-model" />
          <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        {models.length > 0 && (
          <select dir="ltr" value={models.includes(c.model) ? c.model : ''} onChange={(e) => setC({ ...c, model: e.target.value })}>
            <option value="">—</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        </>}
        <div className="row gap wrap" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={save} data-testid="ai-save">{t('ai_save')}</button>
          {c.provider !== 'local' && <button className="btn" onClick={test} disabled={busy} data-testid="ai-test">{t('ai_test')}</button>}
          {c.provider !== 'local' && c.provider !== 'free' && <button className="btn" onClick={fetchModels} disabled={busy}>{t('ai_fetchModels')}</button>}
          {c.apiKey && <button className="btn" onClick={() => { const n = { ...c, apiKey: '' }; setC(n); saveAiConfig(n); }}>{t('ai_removeKey')}</button>}
        </div>
        {msg && <p className="small" data-testid="ai-msg">{msg}</p>}
      </div>
    </div>
  );
}

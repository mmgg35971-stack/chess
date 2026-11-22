import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { COACHES, COACH_LEVELS, coachById, coachGameStats, type CoachProfile } from '../../lib/coach/coaches';
import { CoachPortrait } from './Emblem';
import { Icon } from '../icons';
import { Segmented, TIME_CONTROLS } from '../screens/Play';
import { getSetting, setSetting } from '../../lib/storage/repo';
import type { GameMode } from '../../lib/storage/db';
import type { Lang } from '../../lib/settings';

export interface CoachSetup {
  color: 'w' | 'b' | 'random';
  level: number;
  mode: GameMode;
  timeControl: string;
}

function fmtYmd(d: string, lang: Lang) {
  const decade = d.match(/^(\d{3})0s$/);
  if (decade) return lang === 'ar' ? `سبعينيات القرن العشرين`.replace('سبعينيات', ({ '196': 'ستينيات', '197': 'سبعينيات', '198': 'ثمانينيات', '199': 'تسعينيات' } as Record<string, string>)[decade[1]] ?? decade[0]) : d;
  const parts = d.split('-').map(Number);
  if (parts.length === 1 || isNaN(parts[1])) return d;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] || 1));
  return date.toLocaleDateString(lang === 'ar' ? 'ar' : 'en', parts[2] ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' } : { year: 'numeric', month: 'long', timeZone: 'UTC' });
}

function RatingLine({ coach }: { coach: CoachProfile }) {
  const { t, settings } = useApp();
  const r = coach.rating;
  return (
    <span className="muted small">
      {r.kind === 'current' ? t('currentRating') : t('lastRating')}: <b dir="ltr">{r.value}</b> ({t('ratingAsOf')} {fmtYmd(r.asOf, settings.lang)})
    </span>
  );
}

export function Coaches() {
  const { t, go, settings } = useApp();
  const L = settings.lang;
  return (
    <div className="screen">
      <h1>{t('nav_coaches')}</h1>
      <p className="muted small">{t('coachesIntro')}</p>
      {COACHES.map((c) => (
        <div key={c.id} className="card coach-card" role="button" onClick={() => go({ name: 'coach', id: c.id })} data-testid={'coach-' + c.id}>
          <CoachPortrait coach={c} size={56} />
          <div>
            <strong>{c.name[L]}</strong> <img className="flag" src={`./flags/${c.federation.flag}.svg`} alt={c.federation.label[L]} />
            <div className="small">{c.style[L]}</div>
            <RatingLine coach={c} />
          </div>
          <Icon name="play" />
        </div>
      ))}
      <div className="card coach-card" onClick={() => go({ name: 'play' })} role="button" data-testid="coach-stockfish">
        <span className="emblem">SF</span>
        <div>
          <strong>Stockfish</strong>
          <div className="muted small">{t('stockfishCard')} · 1–8</div>
        </div>
        <Icon name="play" />
      </div>
    </div>
  );
}

export function CoachDetail({ id }: { id: string }) {
  const { t, go, settings } = useApp();
  const L = settings.lang;
  const coach = coachById(id)!;
  const [setup, setSetup] = useState<CoachSetup>({ color: 'w', level: 3, mode: 'educational', timeControl: 'none' });
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    getSetting<CoachSetup | null>('coachSetup', null).then((s) => s && setSetup(s));
    getSetting<{ coachId: string } | null>('coachSession', null).then((s) => setHasSession(!!s && s.coachId === id));
  }, [id]);

  const start = async () => {
    await setSetting('coachSetup', setup);
    await setSetting('coachSession', null);
    go({ name: 'coachGame', id });
  };

  return (
    <div className="screen">
      <div className="card coach-hero">
        <div className="portrait-box">
          <CoachPortrait coach={coach} size={120} />
          <span className="muted tiny">{t('portraitNote')}</span>
        </div>
        <div>
          <h1>{coach.name[L]}</h1>
          <div className="muted small" dir="ltr">{coach.fullName}</div>
          <span className="pill">{t('simulation')}</span>
        </div>
      </div>

      <div className="card facts">
        <div><span className="muted small">{t('nationality')}</span><span><img className="flag" src={`./flags/${coach.federation.flag}.svg`} alt="" /> {coach.federation.label[L]}</span></div>
        <div><span className="muted small">{t('born')}</span><span>{fmtYmd(coach.born.date, L)} — {coach.born.place[L]}</span></div>
        {coach.died && <div><span className="muted small">{t('died')}</span><span>{fmtYmd(coach.died.date, L)} — {coach.died.place[L]}</span></div>}
        <div>
          <span className="muted small">{coach.rating.kind === 'current' ? t('currentRating') : t('lastRating')}</span>
          <span><b dir="ltr">{coach.rating.value}</b> ({t('ratingAsOf')} {fmtYmd(coach.rating.asOf, L)}){coach.rating.note && <span className="muted small"> — {coach.rating.note[L]}</span>}</span>
        </div>
        <div><span className="muted small">{t('peakRating')}</span><span><b dir="ltr">{coach.peak.value}</b> ({fmtYmd(coach.peak.asOf, L)})</span></div>
      </div>

      <div className="card">
        <h2>{t('biography')}</h2>
        <p>{coach.bio[L]}</p>
        <ul className="bullets">{coach.achievements.map((a, i) => <li key={i}>{a[L]}</li>)}</ul>
        <h2>{t('playStyle')}</h2>
        <p>{coach.style[L]}</p>
        <div className="row gap wrap">{coach.strengths.map((s, i) => <span key={i} className="pill">{s[L]}</span>)}</div>
      </div>

      <RealGamesCard id={coach.id} />

      <div className="card">
        <h2>{t('playCoach')}</h2>
        <div className="field"><span>{t('yourColor')}</span>
          <Segmented value={setup.color} onChange={(v) => setSetup({ ...setup, color: v as CoachSetup['color'] })}
            options={[['w', t('white')], ['b', t('black')], ['random', t('random')]]} />
        </div>
        <div className="field"><span>{t('difficulty')}</span>
          <select value={String(setup.level)} onChange={(e) => setSetup({ ...setup, level: Number(e.target.value) })} data-testid="coach-level" aria-label={t('difficulty')}>
            {COACH_LEVELS.map((l) => (
              <option key={l.level} value={l.level}>
                {l.level} · {l.label[L]}{l.targetRating ? ` (${t('levelApprox')} ${l.targetRating})` : ''}
              </option>
            ))}
          </select>
          <span className="muted small">{t('coachLevelNote')}</span>
        </div>
        <div className="field"><span>{t('mode')}</span>
          <Segmented value={setup.mode} onChange={(v) => setSetup({ ...setup, mode: v as GameMode })}
            options={[['educational', t('mode_educational')], ['competitive', t('mode_competitive')], ['training', t('mode_training')]]} />
          <span className="muted small">{t(('modeHelp_' + setup.mode) as 'modeHelp_educational')}</span>
        </div>
        <label className="field"><span>{t('timeControl')}</span>
          <select value={setup.timeControl} onChange={(e) => setSetup({ ...setup, timeControl: e.target.value })}>
            {Object.keys(TIME_CONTROLS).map((k) => <option key={k} value={k}>{k === 'none' ? t('noClock') : k}</option>)}
          </select>
        </label>
        <div className="row gap wrap">
          <button className="btn primary" onClick={start} data-testid="start-coach">{t('start')}</button>
          {hasSession && <button className="btn" onClick={() => go({ name: 'coachGame', id, resume: true })}>{t('resumeCoach')}</button>}
        </div>
      </div>

      <div className="card">
        <p className="muted small">{t('simulationNote')}</p>
        <div className="muted small" dir="ltr">{t('sources')}: {coach.sources.join(' · ')}</div>
      </div>
    </div>
  );
}

function RealGamesCard({ id }: { id: string }) {
  const { t, settings } = useApp();
  const st = coachGameStats(id);
  if (!st) return null;
  const fill = (s: string) => s.replace('{n}', String(st.games)).replace('{from}', st.from ?? '?').replace('{to}', st.to ?? '?');
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div className="card" data-testid="real-games">
      <h2>{t('realGames')}</h2>
      <p className="muted small">{fill(t('realGamesNote'))}</p>
      {st.games < 100 && <p className="muted small">{fill(t('realGamesFew'))}</p>}
      <div className="facts">
        <div><span className="muted small">{t('statScore')}</span><span dir="ltr">{st.score.win} / {st.score.draw} / {st.score.loss}</span></div>
        <div><span className="muted small">{t('statAcpl')}</span><span dir="ltr">{st.acpl}</span></div>
        <div><span className="muted small">{t('statBest')}</span><span dir="ltr">{pct(st.bestMoveRate)}</span></div>
        <div><span className="muted small">{t('statSac')}</span><span dir="ltr">{st.soundSacrificePer100}</span></div>
        <div><span className="muted small">{t('statChecks')}</span><span dir="ltr">{pct(st.checkRate)}</span></div>
        <div><span className="muted small">{t('statQueens')}</span><span dir="ltr">{pct(st.queenTradeRate)}</span></div>
      </div>
      {st.topOpenings.length > 0 && (
        <>
          <h3>{t('statOpenings')}</h3>
          <ul className="bullets" dir="ltr">{st.topOpenings.map((o) => <li key={o.name}>{o.name} — {o.n}</li>)}</ul>
        </>
      )}
      <span className="muted tiny" dir="ltr" data-lang={settings.lang}>Data: kinairi/chess-data (GPL-3.0)</span>
    </div>
  );
}

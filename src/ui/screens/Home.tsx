import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { allActivity, listActivity, listGames, loadSession } from '../../lib/storage/repo';
import { playStats, type PlayStats } from '../../lib/stats';
import type { Activity } from '../../lib/storage/db';
import { fmtDate, fmtDateTime, fmtDuration } from '../format';
import { Icon } from '../icons';
import { Avatar } from './Settings';

export function Home() {
  const { t, profile, go, settings, dataVersion } = useApp();
  const [stats, setStats] = useState<PlayStats | null>(null);
  const [recent, setRecent] = useState<Activity[]>([]);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    (async () => {
      const [games, act, rec, sess] = await Promise.all([listGames(), allActivity(), listActivity(8), loadSession()]);
      setStats(playStats(games, act));
      setRecent(rec);
      setHasSession(!!sess);
    })();
  }, [dataVersion]);

  return (
    <div className="screen">
      <div className="card profile-card">
        <Avatar name={profile?.name ?? ''} src={profile?.avatar} size={64} />
        <div>
          <h1 data-testid="profile-name">{profile?.name}</h1>
          {profile && <div className="muted small">{t('memberSince')} {fmtDate(profile.createdAt, settings.lang)}</div>}
        </div>
      </div>

      {stats && (
        <div className="stats-grid" data-testid="stats">
          <Stat label={t('games')} value={stats.games} />
          <Stat label={t('wins')} value={stats.wins} />
          <Stat label={t('losses')} value={stats.losses} />
          <Stat label={t('draws')} value={stats.draws} />
          <Stat label={t('winRate')} value={stats.winRate === null ? '—' : `${stats.winRate}%`} />
          <Stat label={t('trainingTime')} value={fmtDuration(stats.trainingMs, t)} />
          <Stat label={t('playRating')} value={t('notYet')} small />
          <Stat label={t('puzzleRating')} value={t('notYet')} small />
        </div>
      )}

      <div className="row gap wrap">
        {hasSession && (
          <button className="btn primary" onClick={() => go({ name: 'play', resume: true })} data-testid="resume">
            <Icon name="play" /> {t('resume')}
          </button>
        )}
        <button className={'btn' + (hasSession ? '' : ' primary')} onClick={() => go({ name: 'play' })} data-testid="play-engine">
          <Icon name="play" /> {t('playEngine')}
        </button>
        <button className="btn" onClick={() => go({ name: 'games' })} data-testid="open-history">
          <Icon name="analysis" /> {t('history')}
        </button>
      </div>

      <div className="card">
        <h2>{t('recent')}</h2>
        {recent.length === 0 && <p className="muted">{t('noActivity')}</p>}
        <ul className="list" data-testid="recent">
          {recent.map((a) => (
            <li key={a.id} onClick={() => a.refId && a.type === 'game' && go({ name: 'games', openId: a.refId })}>
              <span><bdi>{a.summary}</bdi> {a.result && <span dir="ltr" className="res">{a.result}</span>}</span>
              <span className="muted small">{fmtDateTime(a.at, settings.lang)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="stat">
      <div className={small ? 'stat-v sm' : 'stat-v'}>{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}

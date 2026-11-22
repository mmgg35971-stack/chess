import { useApp } from '../AppContext';
import { Icon } from '../icons';

export function Coaches() {
  const { t, go } = useApp();
  return (
    <div className="screen">
      <h1>{t('nav_coaches')}</h1>
      <div className="card coach-card" onClick={() => go({ name: 'play' })} role="button" data-testid="coach-stockfish">
        <span className="emblem">SF</span>
        <div>
          <strong>Stockfish</strong>
          <div className="muted small">{t('stockfishCard')} · 1–8</div>
        </div>
        <Icon name="play" />
      </div>
      <Soon text={t('coachesSoon')} badge={t('phase3')} />
    </div>
  );
}

export function Puzzles() {
  const { t } = useApp();
  return (
    <div className="screen">
      <h1>{t('nav_puzzles')}</h1>
      <Soon text={t('puzzlesSoon')} badge={t('phase4')} />
    </div>
  );
}

export function Openings() {
  const { t } = useApp();
  return (
    <div className="screen">
      <h1>{t('nav_openings')}</h1>
      <Soon text={t('openingsSoon')} badge={t('phase4')} />
    </div>
  );
}

function Soon({ text, badge }: { text: string; badge: string }) {
  return (
    <div className="card soon">
      <span className="pill">{badge}</span>
      <p>{text}</p>
    </div>
  );
}

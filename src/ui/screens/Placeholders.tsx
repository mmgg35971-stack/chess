import { useApp } from '../AppContext';

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

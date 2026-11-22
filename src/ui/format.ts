import type { T } from '../i18n';
import type { Lang } from '../lib/settings';

export function fmtDuration(ms: number, t: T): string {
  if (ms > 0 && ms < 60000) return `${Math.round(ms / 1000)}${t('seconds')}`;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}${t('hours')} ${m}${t('minutes')}` : `${m}${t('minutes')}`;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDate(ts: number, lang: Lang): string {
  return new Date(ts).toLocaleDateString(lang === 'ar' ? 'ar' : 'en', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function fmtDateTime(ts: number, lang: Lang): string {
  return new Date(ts).toLocaleString(lang === 'ar' ? 'ar' : 'en', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

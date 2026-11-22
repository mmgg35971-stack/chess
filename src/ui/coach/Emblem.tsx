import { useState } from 'react';
import type { CoachProfile } from '../../lib/coach/coaches';

/** Original emblem for each coach: colours + monogram + a symbol of the style. Not a likeness. */
const SYMBOLS: Record<CoachProfile['symbol'], string> = {
  hourglass: 'M-9 -12 H9 M-9 12 H9 M-7 -12 C-7 -3 7 -3 7 0 C7 3 -7 3 -7 12 M7 -12 C7 -3 -7 -3 -7 0 C-7 3 7 3 7 12',
  bolt: 'M2 -13 L-7 2 H0 L-3 13 L7 -3 H0 Z',
  target: 'M0 -11 A11 11 0 1 0 0.01 -11 M0 -6 A6 6 0 1 0 0.01 -6 M0 -1.5 A1.5 1.5 0 1 0 0.01 -1.5',
  comet: 'M5 -5 A5 5 0 1 0 5.01 -5 M1 3 L-12 12 M-1 0 L-12 4 M3 5 L-5 13',
  flame: 'M0 -13 C6 -6 9 -1 8 5 C7 11 2 13 0 13 C-2 13 -7 11 -8 5 C-9 -1 -4 -4 -3 -9 C-1 -5 0 -3 2 -2 C3 -6 2 -10 0 -13 Z',
  diamond: 'M0 -12 L10 -2 L0 12 L-10 -2 Z M-10 -2 H10 M-4 -12 L-5 -2 L0 12 M4 -12 L5 -2 L0 12',
  chevrons: 'M-10 2 L0 -8 L10 2 M-10 11 L0 1 L10 11',
};

export function Emblem({ coach, size = 56 }: { coach: CoachProfile; size?: number }) {
  const id = 'g-' + coach.id;
  const filled = coach.symbol === 'bolt' || coach.symbol === 'flame';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={coach.name.en} className="emblem-svg">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={coach.color[0]} />
          <stop offset="1" stopColor={coach.color[1]} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="16" fill={`url(#${id})`} />
      <g transform="translate(46 18) scale(0.62)" stroke="rgba(255,255,255,0.9)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        fill={filled ? 'rgba(255,255,255,0.9)' : 'none'}>
        <path d={SYMBOLS[coach.symbol]} />
      </g>
      <text x="22" y="47" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif" letterSpacing="0.5">
        {coach.monogram}
      </text>
    </svg>
  );
}

/**
 * The coach's portrait from the project's asset pack (AI-generated, illustrative).
 * Falls back to the emblem if the image cannot load.
 */
export function CoachPortrait({ coach, size = 56, round = false }: { coach: CoachProfile; size?: number; round?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed || !coach.portrait) return <Emblem coach={coach} size={size} />;
  return (
    <img
      className={'coach-portrait' + (round ? ' round' : '')}
      src={coach.portrait}
      alt={coach.name.en}
      width={size}
      height={round ? size : Math.round(size * 1.3)}
      style={{ borderColor: coach.color[0] }}
      onError={() => setFailed(true)}
      data-testid="coach-portrait"
    />
  );
}

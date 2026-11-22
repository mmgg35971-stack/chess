import { formatScore, winProbability, type Score } from '../../lib/engine/uci';

/** Vertical evaluation bar (White at the bottom unless flipped). */
export function EvalBar({ score, orientation }: { score: Score | null; orientation: 'w' | 'b' }) {
  const wp = score ? winProbability(score) : 0.5;
  const whiteShare = Math.round(wp * 1000) / 10;
  const label = score ? formatScore(score) : '…';
  const whiteBottom = orientation === 'w';
  return (
    <div className="evalbar" aria-label={'eval ' + label} data-testid="evalbar" dir="ltr">
      <div className="evalbar-black" style={{ flexBasis: `${100 - whiteShare}%`, order: whiteBottom ? 0 : 1 }} />
      <div className="evalbar-white" style={{ flexBasis: `${whiteShare}%`, order: whiteBottom ? 1 : 0 }} />
      <span className={'evalbar-label ' + (wp >= 0.5 ? (whiteBottom ? 'bottom dark' : 'top dark') : whiteBottom ? 'top light' : 'bottom light')}>{label}</span>
    </div>
  );
}

/** Small evaluation graph over the whole game. */
export function EvalGraph({ curve, current, onPick }: { curve: Score[]; current: number; onPick?: (i: number) => void }) {
  if (curve.length < 2) return null;
  const W = 300, H = 60;
  const pts = curve.map((s, i) => [(i / (curve.length - 1)) * W, (1 - winProbability(s)) * H]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = d + ` L${W} ${H} L0 ${H} Z`;
  const cx = (current / (curve.length - 1)) * W;
  return (
    <svg className="evalgraph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" direction="ltr"
      onClick={(e) => {
        if (!onPick) return;
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        onPick(Math.round(((e.clientX - r.left) / r.width) * (curve.length - 1)));
      }}>
      <rect width={W} height={H} fill="#30333c" />
      <path d={area} fill="#e9e6df" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#8a8f9b" strokeWidth="0.6" strokeDasharray="3 3" />
      <line x1={cx} x2={cx} y1="0" y2={H} stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}

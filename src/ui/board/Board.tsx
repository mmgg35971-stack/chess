import { useMemo, useRef, useState } from 'react';
import type { Square } from 'chess.js';
import { boardTheme, type PieceSet } from '../../lib/settings';

export interface Arrow {
  from: Square;
  to: Square;
  color?: string;
}

export interface BoardProps {
  fen: string;
  orientation: 'w' | 'b';
  /** colour the user may move, or null for a read-only board */
  movable: 'w' | 'b' | null;
  /** legal destination squares for a piece */
  targets: (from: Square) => Square[];
  needsPromotion: (from: Square, to: Square) => boolean;
  onMove: (from: Square, to: Square, promotion?: string) => boolean;
  lastMove?: [Square, Square] | null;
  checkSquare?: Square | null;
  arrows?: Arrow[];
  themeId: string;
  pieceSet: PieceSet;
  coordinates: boolean;
  showLegal: boolean;
  showLastMove: boolean;
  label?: string;
}

const FILES = 'abcdefgh';
const S = 100; // square size in SVG units (board = 800)

interface PieceOn {
  sq: Square;
  code: string; // e.g. "wK"
}

function parseFen(fen: string): PieceOn[] {
  const out: PieceOn[] = [];
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        out.push({ sq: (FILES[f] + (8 - r)) as Square, code: color + ch.toUpperCase() });
        f++;
      }
    }
  });
  return out;
}

export function Board(p: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<{ from: Square; x: number; y: number; moved: boolean } | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const theme = boardTheme(p.themeId);
  const pieces = useMemo(() => parseFen(p.fen), [p.fen]);
  const flip = p.orientation === 'b';
  const pieceAt = (sq: Square) => pieces.find((x) => x.sq === sq);

  const xy = (sq: Square) => {
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]) - 1;
    return flip ? { x: (7 - f) * S, y: r * S } : { x: f * S, y: (7 - r) * S };
  };

  const pointToSvg = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * 800, y: ((clientY - rect.top) / rect.height) * 800 };
  };

  const squareAt = (x: number, y: number): Square | null => {
    if (x < 0 || y < 0 || x >= 800 || y >= 800) return null;
    let f = Math.floor(x / S);
    let r = 7 - Math.floor(y / S);
    if (flip) {
      f = 7 - f;
      r = 7 - r;
    }
    return (FILES[f] + (r + 1)) as Square;
  };

  const selTargets = selected ? p.targets(selected) : [];

  const attempt = (from: Square, to: Square) => {
    if (!p.targets(from).includes(to)) return false;
    if (p.needsPromotion(from, to)) {
      setPromo({ from, to });
      return true;
    }
    const ok = p.onMove(from, to);
    if (ok) setSelected(null);
    return ok;
  };

  const ownPiece = (sq: Square | null) =>
    !!sq && !!p.movable && pieceAt(sq)?.code[0] === p.movable;

  const onDown = (e: React.PointerEvent) => {
    if (!p.movable || promo) return;
    const pt = pointToSvg(e.clientX, e.clientY);
    const sq = squareAt(pt.x, pt.y);
    if (!sq) return;
    if (selected && selected !== sq && selTargets.includes(sq)) {
      attempt(selected, sq);
      return;
    }
    if (ownPiece(sq)) {
      setSelected(sq);
      setDrag({ from: sq, x: pt.x, y: pt.y, moved: false });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else {
      setSelected(null);
    }
  };

  const onMoveEv = (e: React.PointerEvent) => {
    if (!drag) return;
    const pt = pointToSvg(e.clientX, e.clientY);
    const moved = drag.moved || Math.hypot(pt.x - drag.x, pt.y - drag.y) > 12;
    setDrag({ ...drag, x: pt.x, y: pt.y, moved });
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const pt = pointToSvg(e.clientX, e.clientY);
    const sq = squareAt(pt.x, pt.y);
    if (drag.moved && sq && sq !== drag.from) attempt(drag.from, sq);
    setDrag(null);
  };

  const pieceHref = (code: string) => `./pieces/${p.pieceSet}/${code}.svg`;

  const squares = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const sq = (FILES[f] + (r + 1)) as Square;
      const { x, y } = xy(sq);
      const isLight = (f + r) % 2 === 1;
      squares.push(<rect key={sq} x={x} y={y} width={S} height={S} fill={isLight ? theme.light : theme.dark} />);
    }

  const highlight = (sq: Square, fill: string, key: string) => {
    const { x, y } = xy(sq);
    return <rect key={key} x={x} y={y} width={S} height={S} fill={fill} />;
  };

  const coords = [];
  if (p.coordinates) {
    for (let i = 0; i < 8; i++) {
      const fileSq = (FILES[i] + (flip ? 8 : 1)) as Square;
      const fxy = xy(fileSq);
      const fLight = (i + (flip ? 7 : 0)) % 2 === 1;
      coords.push(
        <text key={'f' + i} x={fxy.x + S - 6} y={fxy.y + S - 6} textAnchor="end" fontSize="20" fontWeight="600"
          fill={fLight ? theme.dark : theme.light}>{FILES[i]}</text>,
      );
      const rankSq = ((flip ? 'h' : 'a') + (i + 1)) as Square;
      const rxy = xy(rankSq);
      const rLight = ((flip ? 7 : 0) + i) % 2 === 1;
      coords.push(
        <text key={'r' + i} x={rxy.x + 6} y={rxy.y + 22} fontSize="20" fontWeight="600"
          fill={rLight ? theme.dark : theme.light}>{i + 1}</text>,
      );
    }
  }

  const arrowEls = (p.arrows ?? []).map((a, i) => {
    const A = xy(a.from), B = xy(a.to);
    const x1 = A.x + S / 2, y1 = A.y + S / 2, x2 = B.x + S / 2, y2 = B.y + S / 2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const color = a.color ?? 'rgba(30,140,90,0.8)';
    return (
      <g key={'a' + i} opacity={0.85}>
        <line x1={x1} y1={y1} x2={x2 - ux * 30} y2={y2 - uy * 30} stroke={color} strokeWidth={16} strokeLinecap="round" />
        <polygon
          points={`${x2},${y2} ${x2 - ux * 40 - uy * 26},${y2 - uy * 40 + ux * 26} ${x2 - ux * 40 + uy * 26},${y2 - uy * 40 - ux * 26}`}
          fill={color}
        />
      </g>
    );
  });

  return (
    <div className="board-wrap" dir="ltr">
      <svg
        ref={svgRef}
        className="board"
        viewBox="0 0 800 800"
        role="img"
        aria-label={p.label ?? 'chessboard'}
        data-fen={p.fen}
        onPointerDown={onDown}
        onPointerMove={onMoveEv}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
        style={{ touchAction: 'none' }}
      >
        {squares}
        {p.showLastMove && p.lastMove && p.lastMove.map((sq, i) => highlight(sq, 'rgba(255,214,64,0.42)', 'lm' + i))}
        {selected && highlight(selected, 'rgba(70,160,255,0.45)', 'sel')}
        {p.checkSquare && (
          <circle cx={xy(p.checkSquare).x + S / 2} cy={xy(p.checkSquare).y + S / 2} r={46} fill="rgba(230,40,40,0.55)" />
        )}
        {coords}
        {pieces.map((pc) => {
          if (drag?.moved && drag.from === pc.sq) return null;
          const { x, y } = xy(pc.sq);
          return <image key={pc.sq + pc.code} href={pieceHref(pc.code)} x={x} y={y} width={S} height={S} data-sq={pc.sq} data-piece={pc.code} />;
        })}
        {p.showLegal &&
          selTargets.map((sq) => {
            const { x, y } = xy(sq);
            const cap = !!pieceAt(sq);
            return cap ? (
              <circle key={'t' + sq} cx={x + S / 2} cy={y + S / 2} r={44} fill="none" stroke="rgba(20,20,20,0.35)" strokeWidth={8} />
            ) : (
              <circle key={'t' + sq} cx={x + S / 2} cy={y + S / 2} r={15} fill="rgba(20,20,20,0.32)" />
            );
          })}
        {arrowEls}
        {drag?.moved && pieceAt(drag.from) && (
          <image href={pieceHref(pieceAt(drag.from)!.code)} x={drag.x - S * 0.6} y={drag.y - S * 0.8} width={S * 1.2} height={S * 1.2} pointerEvents="none" />
        )}
        {promo && (() => {
          const color = pieceAt(promo.from)!.code[0];
          const { x } = xy(promo.to);
          const top = xy(promo.to).y < 400;
          return (
            <g>
              <rect x={0} y={0} width={800} height={800} fill="rgba(0,0,0,0.45)" onPointerDown={(e) => { e.stopPropagation(); setPromo(null); }} />
              {['q', 'r', 'b', 'n'].map((pc, i) => {
                const y = top ? i * S : 800 - (i + 1) * S;
                return (
                  <g key={pc} onPointerDown={(e) => {
                    e.stopPropagation();
                    const { from, to } = promo;
                    setPromo(null);
                    if (p.onMove(from, to, pc)) setSelected(null);
                  }} data-promo={pc} style={{ cursor: 'pointer' }}>
                    <rect x={x} y={y} width={S} height={S} fill="#f4f4f4" stroke="#333" strokeWidth={2} />
                    <image href={pieceHref(color + pc.toUpperCase())} x={x} y={y} width={S} height={S} />
                  </g>
                );
              })}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

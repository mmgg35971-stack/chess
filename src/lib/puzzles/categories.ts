// Puzzle categories from the project spec (7.1–7.3), defined from Lichess themes and from the
// material on the board. Every predicate is documented so the counts shown in the app are real.

export interface Puzzle {
  id: string;
  /** position before the opponent's first move (Lichess convention) */
  fen: string;
  /** UCI moves: [opponent move, solver, reply, solver, ...] */
  moves: string[];
  rating: number;
  rd: number;
  popularity: number;
  plays: number;
  themes: string[];
  /** material of the solving position, solver first, e.g. "KRPPvKR" */
  material: string;
  source: 'l' | 'g';
}

export const solverMoves = (p: Puzzle) => p.moves.length / 2;

const TACTIC_THEMES = ['fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'hangingPiece', 'trappedPiece', 'deflection',
  'attraction', 'clearance', 'interference', 'xRayAttack', 'intermezzo', 'capturingDefender'];
const MATE_PATTERNS = ['backRankMate', 'smotheredMate', 'hookMate', 'arabianMate', 'anastasiaMate', 'dovetailMate', 'bodenMate', 'doubleBishopMate'];

const has = (p: Puzzle, ...t: string[]) => t.some((x) => p.themes.includes(x));
const sides = (p: Puzzle) => { const [a, b] = p.material.split('v'); return { me: a, them: b }; };
const pieces = (s: string) => s.replace(/[KP]/g, '');
const pawns = (s: string) => (s.match(/P/g) ?? []).length;

export interface Category { id: string; test: (p: Puzzle) => boolean }
export interface Section { id: string; categories: Category[] }

/** 7.2 — endgames by material (only puzzles tagged as endgame by Lichess, or generated endgames). */
const isEnd = (p: Puzzle) => has(p, 'endgame');
export const ENDGAME: Category[] = [
  { id: 'eg_kpk', test: (p) => isEnd(p) && pieces(sides(p).me) === '' && sides(p).them === 'K' && pawns(sides(p).me) >= 1 },
  { id: 'eg_pawn', test: (p) => isEnd(p) && pieces(sides(p).me) === '' && pieces(sides(p).them) === '' },
  { id: 'eg_kqk', test: (p) => isEnd(p) && sides(p).me.startsWith('KQ') && pieces(sides(p).me) === 'Q' && sides(p).them === 'K' },
  { id: 'eg_krk', test: (p) => isEnd(p) && pieces(sides(p).me) === 'R' && sides(p).them === 'K' },
  { id: 'eg_bishop', test: (p) => isEnd(p) && /^B+$/.test(pieces(sides(p).me)) && /^B*$/.test(pieces(sides(p).them)) },
  { id: 'eg_knight', test: (p) => isEnd(p) && /^N+$/.test(pieces(sides(p).me)) && /^N*$/.test(pieces(sides(p).them)) },
  { id: 'eg_rr', test: (p) => isEnd(p) && pieces(sides(p).me) === 'R' && pieces(sides(p).them) === 'R' },
  { id: 'eg_queen', test: (p) => isEnd(p) && pieces(sides(p).me) === 'Q' && /^Q?$/.test(pieces(sides(p).them)) && sides(p).them !== 'K' },
  { id: 'eg_minor', test: (p) => isEnd(p) && /^[BN]+$/.test(pieces(sides(p).me) + pieces(sides(p).them)) && /B/.test(pieces(sides(p).me) + pieces(sides(p).them)) && /N/.test(pieces(sides(p).me) + pieces(sides(p).them)) },
  { id: 'eg_multi', test: (p) => isEnd(p) && (pieces(sides(p).me).length >= 2 || pieces(sides(p).them).length >= 2) },
];

/** 7.3 — mates by mating material, by length and by pattern. */
const isMate = (p: Puzzle) => has(p, 'mate');
export const MATE: Category[] = [
  { id: 'm_kq', test: (p) => isMate(p) && pieces(sides(p).me) === 'Q' && sides(p).them === 'K' },
  { id: 'm_kr', test: (p) => isMate(p) && pieces(sides(p).me) === 'R' && sides(p).them === 'K' },
  { id: 'm_kbn', test: (p) => isMate(p) && pieces(sides(p).me) === 'BN' && sides(p).them === 'K' },
  ...[1, 2, 3, 4, 5].map((n) => ({ id: `m_in${n}`, test: (p: Puzzle) => has(p, `mateIn${n}`) })),
  { id: 'm_patterns', test: (p) => has(p, ...MATE_PATTERNS) },
];

/** 7.1 — main sections. */
export const MAIN: Category[] = [
  { id: 'c_random', test: () => true },
  { id: 'c_tactics', test: (p) => has(p, ...TACTIC_THEMES) },
  { id: 'c_endgame', test: isEnd },
  { id: 'c_mate', test: isMate },
  { id: 'c_defense', test: (p) => has(p, 'defensiveMove', 'equality') },
  { id: 'c_attack', test: (p) => has(p, 'kingsideAttack', 'queensideAttack', 'attackingF2F7', 'exposedKing') },
  { id: 'c_sacrifice', test: (p) => has(p, 'sacrifice') },
  { id: 'c_best', test: (p) => has(p, 'quietMove', 'oneMove') && !isMate(p) },
  { id: 'c_middlegame', test: (p) => has(p, 'middlegame') },
  { id: 'c_advanced', test: (p) => p.rating >= 1900 && (has(p, 'long', 'veryLong') || p.themes.filter((t) => TACTIC_THEMES.includes(t)).length >= 2) },
];

export const SECTIONS: Section[] = [
  { id: 's_main', categories: MAIN },
  { id: 's_endgame', categories: ENDGAME },
  { id: 's_mate', categories: MATE },
];
export const ALL_CATEGORIES = [...MAIN, ...ENDGAME, ...MATE];
export const categoryById = (id: string) => ALL_CATEGORIES.find((c) => c.id === id) ?? MAIN[0];

/** Themes that we explain after solving, and that the stats screen groups by. */
export const EXPLAINED_THEMES = [...TACTIC_THEMES, ...MATE_PATTERNS, 'sacrifice', 'quietMove', 'defensiveMove', 'promotion',
  'advancedPawn', 'zugzwang', 'kingsideAttack', 'queensideAttack', 'exposedKing', 'attackingF2F7', 'mate', 'enPassant', 'underPromotion', 'castling', 'equality'];

export function fromRow(r: (string | number)[]): Puzzle {
  return {
    id: String(r[0]), fen: String(r[1]), moves: String(r[2]).split(' '), rating: Number(r[3]), rd: Number(r[4]),
    popularity: Number(r[5]), plays: Number(r[6]), themes: String(r[7]).split(' ').filter(Boolean), material: String(r[8]),
    source: r[9] === 'g' ? 'g' : 'l',
  };
}

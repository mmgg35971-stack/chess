export type Lang = 'ar' | 'en';
export type Theme = 'dark' | 'light' | 'sepia';

export interface BoardTheme {
  id: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'green', light: '#ebecd0', dark: '#779556' },
  { id: 'walnut', light: '#ecd9b9', dark: '#b07f55' },
  { id: 'forest', light: '#e8edc9', dark: '#6f9161' },
  { id: 'ocean', light: '#dfe7ef', dark: '#5f84a8' },
  { id: 'slate', light: '#d9dbe0', dark: '#7a8090' },
  { id: 'rose', light: '#f1dfd8', dark: '#b8746a' },
];

export const PIECE_SETS = ['chessnut', 'cburnett', 'merida'] as const;
export type PieceSet = (typeof PIECE_SETS)[number];

export interface Settings {
  /** settings schema version (for one-time migrations) */
  v: number;
  lang: Lang;
  theme: Theme;
  boardTheme: string;
  pieceSet: PieceSet;
  coordinates: boolean;
  showLastMove: boolean;
  showLegal: boolean;
  showArrows: boolean;
  sound: boolean;
  animationMs: number;
  analysisDepth: number;
  analysisMoveTimeMs: number;
  strictness: 'lenient' | 'standard' | 'strict';
  autoAnalyze: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  v: 3,
  lang: 'ar',
  theme: 'dark',
  boardTheme: 'green',
  pieceSet: 'chessnut',
  coordinates: true,
  showLastMove: true,
  showLegal: true,
  showArrows: true,
  sound: true,
  animationMs: 250,
  analysisDepth: 12,
  analysisMoveTimeMs: 2000,
  strictness: 'standard',
  autoAnalyze: false,
};

export function boardTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}

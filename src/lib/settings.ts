export type Lang = 'ar' | 'en';
export type Theme = 'dark' | 'light';

export interface BoardTheme {
  id: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'walnut', light: '#ecd9b9', dark: '#b07f55' },
  { id: 'forest', light: '#e8edc9', dark: '#6f9161' },
  { id: 'ocean', light: '#dfe7ef', dark: '#5f84a8' },
  { id: 'slate', light: '#d9dbe0', dark: '#7a8090' },
  { id: 'rose', light: '#f1dfd8', dark: '#b8746a' },
];

export const PIECE_SETS = ['cburnett', 'merida'] as const;
export type PieceSet = (typeof PIECE_SETS)[number];

export interface Settings {
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
  lang: 'ar',
  theme: 'dark',
  boardTheme: 'walnut',
  pieceSet: 'cburnett',
  coordinates: true,
  showLastMove: true,
  showLegal: true,
  showArrows: true,
  sound: true,
  animationMs: 250,
  analysisDepth: 14,
  analysisMoveTimeMs: 1500,
  strictness: 'standard',
  autoAnalyze: false,
};

export function boardTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}

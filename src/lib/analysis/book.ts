import { Chess } from 'chess.js';
import data from '../../data/openings.json';

/** Opening theory from lichess-org/chess-openings (CC0): ~3,900 named lines. */
const BOOK = new Set<string>((data as { book: string[] }).book);
const NAMES = (data as unknown as { names: Record<string, [string, string]> }).names;

export function isBookPosition(c: Chess): boolean {
  return BOOK.has(c.hash());
}

/** For each ply (1-based index), whether the game is still in book after that move. */
export function bookPlies(sans: string[]): boolean[] {
  const c = new Chess();
  const out: boolean[] = [];
  let still = true;
  for (const s of sans) {
    c.move(s);
    still = still && BOOK.has(c.hash());
    out.push(still);
  }
  return out;
}

/** Deepest named opening reached by the game. */
export function openingName(sans: string[]): { eco: string; name: string; ply: number } | null {
  const c = new Chess();
  let best: { eco: string; name: string; ply: number } | null = null;
  sans.forEach((s, i) => {
    c.move(s);
    const n = NAMES[c.hash()];
    if (n) best = { eco: n[0], name: n[1], ply: i + 1 };
  });
  return best;
}

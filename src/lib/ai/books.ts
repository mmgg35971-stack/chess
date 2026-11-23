// Searchable library of the public-domain chess books shipped with the app (scripts/ai/build-books.py).
// The coach chat searches it with BM25 so the model answers from passages it was actually given.

export interface BookMeta { id: string; author: string; title: string; year: number; focus: string[]; source: string; passages: number }
export interface BookFile { v: number; books: BookMeta[]; chunks: [number, string, string][] }
export interface Passage { book: BookMeta; heading: string; text: string; score: number; index: number }

const STOP = new Set('a an the of to in on at by for and or but is are was were be been it its this that these those with as from which who whom his her he she him they them their we our you your i me my not no so if then than there here into out up down can will would should may might must shall do does did has have had what when where why how all any some such very more most other only also just about over after before'.split(' '));

/** Lowercase word stems: drops stop words and common English endings so "pawns"/"pawn", "attacking"/"attack" match. */
export function tokens(s: string): string[] {
  const out: string[] = [];
  for (let w of s.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/)) {
    if (w.length < 2 || STOP.has(w)) continue;
    if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
    else if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) w = w.slice(0, -2);
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    out.push(w);
  }
  return out;
}

// Modern words the old books spell differently (descriptive notation and period vocabulary).
const SYNONYMS: Record<string, string[]> = {
  knight: ['kt'], castl: ['castle'], castle: ['castl'], endgame: ['end', 'ending'], ending: ['endgame'],
  middlegame: ['middle'], fianchetto: ['fianchetto'], isolani: ['isolat'], isolat: ['isolani'],
  sacrifice: ['sacrific'], sacrific: ['sacrifice'], combination: ['combin'], opposition: ['oppos'],
};

export class BookIndex {
  private df = new Map<string, number>();
  private tf: Map<string, number>[] = [];
  private len: number[] = [];
  private avg = 1;
  constructor(public data: BookFile) {
    for (const [, h, t] of data.chunks) {
      const m = new Map<string, number>();
      const toks = tokens(h + ' ' + t);
      for (const w of toks) m.set(w, (m.get(w) ?? 0) + 1);
      for (const w of m.keys()) this.df.set(w, (this.df.get(w) ?? 0) + 1);
      this.tf.push(m);
      this.len.push(toks.length);
    }
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.len.length);
  }

  /** BM25 search; `focus` keeps passages of books about that subject (opening, endgame, history…). */
  search(query: string, k = 4, focus?: string): Passage[] {
    const q = new Set<string>();
    for (const w of tokens(query)) { q.add(w); for (const s of SYNONYMS[w] ?? []) q.add(s); }
    if (!q.size) return [];
    const N = this.tf.length, k1 = 1.2, b = 0.75;
    const scores: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const bk = this.data.books[this.data.chunks[i][0]];
      if (focus && !bk.focus.includes(focus)) continue;
      let s = 0;
      for (const w of q) {
        const f = this.tf[i].get(w);
        if (!f) continue;
        const idf = Math.log(1 + (N - (this.df.get(w) ?? 0) + 0.5) / ((this.df.get(w) ?? 0) + 0.5));
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * this.len[i] / this.avg));
      }
      if (s > 0) scores.push([s, i]);
    }
    scores.sort((a, b) => b[0] - a[0]);
    return scores.slice(0, k).map(([score, i]) => {
      const [bi, heading, text] = this.data.chunks[i];
      return { book: this.data.books[bi], heading, text, score, index: i };
    });
  }
}

let loaded: Promise<BookIndex> | null = null;
/** Loads and indexes the library once (≈700 KB compressed). */
export function bookIndex(fetchBytes: (path: string) => Promise<Uint8Array>): Promise<BookIndex> {
  loaded ??= fetchBytes('books.pz').then((b) => new BookIndex(JSON.parse(new TextDecoder().decode(b)) as BookFile));
  loaded.catch(() => { loaded = null; });
  return loaded;
}

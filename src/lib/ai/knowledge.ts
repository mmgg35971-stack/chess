// The coach's knowledge network (scripts/ai/build-knowledge.ts): ~150 concepts written in our own words,
// each linked to the reference works its ideas come from (≈220 books) and to related concepts, with
// example positions checked by Stockfish. Searched with BM25 by the search_knowledge tool.
import { Bm25 } from './books';

export interface KRef { id: string; author: string; title: string; year: number; areas: string[]; coaches: string[]; ideas: string[] }
export interface KExample { fen?: string; moves?: string; claim?: string; note: string; arrows?: string; marks?: string }
export interface KConcept {
  id: string; area: string; title: { ar: string; en: string }; refs: string[]; rel: string[]; pz?: string;
  summary: string; ideas: string[]; how: string[]; mistakes: string[]; examples: KExample[];
  ar?: { aka: string[]; summary: string; ideas: string[]; how: string[]; mistakes: string[]; notes: string[] };
}
export interface KnowledgeFile { v: number; refs: KRef[]; concepts: KConcept[] }

export class KnowledgeIndex {
  private bm: Bm25;
  private refBm: Bm25;
  readonly refById = new Map<string, KRef>();
  readonly byId = new Map<string, KConcept>();
  constructor(public data: KnowledgeFile) {
    for (const r of data.refs) this.refById.set(r.id, r);
    for (const c of data.concepts) this.byId.set(c.id, c);
    // concept text weighs the title twice; reference ideas are indexed too, so "Nimzowitsch blockade" finds both
    this.bm = new Bm25(data.concepts.map((c) => [c.title.en, c.title.en, c.id.replace(/-/g, ' '), c.summary, ...c.ideas, ...c.how, ...c.mistakes,
      ...c.refs.map((r) => { const x = this.refById.get(r); return x ? `${x.author} ${x.title}` : ''; })].join(' ')));
    this.refBm = new Bm25(data.refs.map((r) => `${r.author} ${r.title} ${r.ideas.join(' ')}`));
  }

  search(query: string, k = 3, area?: string): KConcept[] {
    const keep = area ? (i: number) => this.data.concepts[i].area === area : undefined;
    return this.bm.search(query, k, keep).map(([, i]) => this.data.concepts[i]);
  }

  searchRefs(query: string, k = 3): KRef[] {
    return this.refBm.search(query, k).map(([, i]) => this.data.refs[i]);
  }

  /** What the model receives for one concept: the idea, the books it comes from, links and examples. */
  view(c: KConcept) {
    return {
      id: c.id, area: c.area, title: c.title.en, summary: c.summary,
      keyIdeas: c.ideas, howToPlay: c.how, commonMistakes: c.mistakes,
      sources: c.refs.map((r) => this.refById.get(r)).filter(Boolean).map((r) => `${r!.author}, ${r!.title} (${r!.year})`),
      related: c.rel.map((r) => ({ id: r, title: this.byId.get(r)?.title.en })),
      examples: c.examples.map((e) => ({ fen: e.fen, moves: e.moves, arrows: e.arrows, marks: e.marks, verified: e.claim ? `Stockfish-checked: ${e.claim}` : e.moves ? 'legal line' : undefined, note: e.note })),
      puzzleTheme: c.pz,
    };
  }
}

let loaded: Promise<KnowledgeIndex> | null = null;
export function knowledgeIndex(fetchBytes: (path: string) => Promise<Uint8Array>): Promise<KnowledgeIndex> {
  loaded ??= fetchBytes('knowledge.pz').then((b) => new KnowledgeIndex(JSON.parse(new TextDecoder().decode(b)) as KnowledgeFile));
  loaded.catch(() => { loaded = null; });
  return loaded;
}

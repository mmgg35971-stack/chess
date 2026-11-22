// Splits an opening's theory lines into learning stages (spec 8.4): each stage shows a position,
// then teaches 3–6 of the learner's moves together with the expected replies.

export interface Line { name: string; eco: string; sans: string[]; source: 'main' | 'extra' | 'lichess' }
export interface Stage {
  /** index of the line in the opening's line list */
  line: number;
  /** plies [0, from) are played on the board before the stage starts */
  from: number;
  /** last ply of the stage (inclusive) */
  to: number;
  /** learner plies of the stage that are new (not taught by an earlier stage) */
  fresh: number[];
}

export const isLearnerPly = (ply: number, side: 'w' | 'b') => (ply % 2 === 0) === (side === 'w');

/**
 * Lines are taught in order. A stage covers the part of a line that earlier lines did not, in chunks
 * of at most 5 learner moves (6 when only one would be left over). A chunk with fewer than 3 learner
 * moves starts earlier, repeating known moves as revision, so every stage asks for at least 3
 * (unless the whole line is shorter).
 */
export function buildStages(lines: Line[], side: 'w' | 'b', minMoves = 3, chunk = 5): Stage[] {
  const known = new Set<string>(); // "san san san" prefixes taught so far (ending in a learner move)
  const stages: Stage[] = [];
  lines.forEach((ln, li) => {
    const learner = ln.sans.map((_, i) => i).filter((i) => isLearnerPly(i, side));
    const fresh = learner.filter((i) => !known.has(ln.sans.slice(0, i + 1).join(' ')));
    if (!fresh.length || learner.length < minMoves) return;
    // split the fresh learner plies into chunks
    const groups: number[][] = [];
    for (let k = 0; k < fresh.length; k += chunk) groups.push(fresh.slice(k, k + chunk));
    if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(...groups.pop()!);
    for (const g of groups) {
      // extend backwards with already-known learner plies until there are at least `minMoves`
      let firstIdx = learner.indexOf(g[0]);
      let count = g.length + (learner.indexOf(g[g.length - 1]) - learner.indexOf(g[0]) + 1 - g.length);
      while (count < minMoves && firstIdx > 0) { firstIdx--; count++; }
      const firstPly = learner[firstIdx];
      const lastPly = g[g.length - 1];
      stages.push({ line: li, from: firstPly, to: Math.min(lastPly + 1, ln.sans.length - 1), fresh: g });
      for (const p of g) known.add(ln.sans.slice(0, p + 1).join(' '));
    }
  });
  return stages;
}

/** learner plies a stage asks for */
export const stagePlies = (s: Stage, side: 'w' | 'b') => {
  const out: number[] = [];
  for (let i = s.from; i <= s.to; i++) if (isLearnerPly(i, side)) out.push(i);
  return out;
};

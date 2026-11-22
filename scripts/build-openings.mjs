import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(new URL('../package.json', import.meta.url));
const { Chess } = require('chess.js');
const names = {};       // position hash -> [eco, name]
const book = new Set(); // every position on a named line
let lines = 0;
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const rows = readFileSync(new URL(`./openings/open_${f}.tsv`, import.meta.url), 'utf8').trim().split('\n').slice(1);
  for (const r of rows) {
    const [eco, name, pgn] = r.split('\t');
    const c = new Chess();
    const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
    try { for (const s of sans) { c.move(s); book.add(c.hash()); } } catch (e) { console.error('bad', eco, name); continue; }
    const k = c.hash();
    // keep the most specific (longest) name for a position
    if (!names[k] || name.length > names[k][1].length) names[k] = [eco, name];
    lines++;
  }
}
mkdirSync(new URL('../src/data', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/data/openings.json', import.meta.url), JSON.stringify({ source: 'lichess-org/chess-openings (CC0)', book: [...book], names }));
console.log('lines', lines, 'book positions', book.size, 'named', Object.keys(names).length);

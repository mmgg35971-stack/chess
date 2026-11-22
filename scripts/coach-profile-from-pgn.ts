// Usage: npx tsx scripts/coach-profile-from-pgn.ts games.pgn "Tal" > tal-profile.json
// Only use PGN files whose licence allows reuse, and record the source in DATA_SOURCES.md.
import { readFileSync } from 'node:fs';
import { profileFromPgn } from '../src/lib/coach/profileFromPgn';

const [file, player] = process.argv.slice(2);
if (!file || !player) {
  console.error('usage: coach-profile-from-pgn.ts <file.pgn> <player name>');
  process.exit(1);
}
const p = profileFromPgn(readFileSync(file, 'utf8'), player);
console.log(JSON.stringify(p, null, 2));
console.error(`${p.games} games for "${player}" (${p.asWhite} white / ${p.asBlack} black). ` +
  (p.games < 200 ? 'Fewer than 200 games: say so wherever this profile is used.' : ''));

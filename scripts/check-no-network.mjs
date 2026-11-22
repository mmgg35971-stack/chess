// Fails the build if the bundled app references any external http(s) host.
// Allowed: XML/SVG namespace URIs and licence/documentation strings that are never fetched.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = [
  /^http:\/\/www\.w3\.org\//,
  /^https?:\/\/(www\.)?gnu\.org\//,
  /^https?:\/\/fsf\.org\//,
  /^https?:\/\/reactjs\.org\/docs\/error-decoder/,
  /^https?:\/\/react\.dev\/errors/,
  /^https?:\/\/github\.com\/nmrugg\/stockfish\.js/,
  /^https?:\/\/(www\.)?stockfishchess\.org/,
  /^https?:\/\/dexie\.org\//,
  /^https?:\/\/localhost/,
  // Credits in the Stockfish.js licence header comment:
  /^https:\/\/github\.com\/official-stockfish\/Stockfish$/,
  /^https:\/\/tests\.stockfishchess\.org\/nns\?network_name=/,
  // Help links inside Dexie error message strings (shown, never requested):
  /^https:\/\/tinyurl\.com\/y2uuvskb$/,
  /^http:\/\/bit\.ly\/2kdckMn$/,
];
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css|svg)$/.test(f)) files.push(p);
  }
})('dist');

const bad = new Map();
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
    if (!ALLOWED.some((r) => r.test(m[0]))) bad.set(m[0], f);
  }
}
if (bad.size) {
  console.error('External URLs found in build (review each):');
  for (const [u, f] of bad) console.error('  ', u, '←', f);
  process.exit(1);
}
console.log(`check-no-network: ${files.length} files, no external URLs`);

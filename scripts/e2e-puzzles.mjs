// End-to-end test of the puzzles (spec 7) in Chrome at phone size, offline (every non-local request blocked).
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Chess } from 'chess.js';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const PORT = 4323;
const BASE = `http://localhost:${PORT}/`;
mkdirSync('test-shots', { recursive: true });

// puzzle lookup by the position shown on the board (after the opponent's set-up move)
// the library has ~1M puzzles in gzip chunks: find a puzzle by the id the page shows
const texts = readdirSync('public/data/puzzles').filter((x) => /^\d+\.gz$/.test(x)).map((f) => gunzipSync(readFileSync('public/data/puzzles/' + f)).toString());
function byId(id) {
  for (const t of texts) {
    const i = t.startsWith(id + '|') ? 0 : t.indexOf('\n' + id + '|');
    if (i < 0) continue;
    const line = t.slice(i === 0 ? 0 : i + 1, t.indexOf('\n', i + 1) < 0 ? undefined : t.indexOf('\n', i + 1));
    const [pid, fen, moves, rating] = line.split('|');
    return { id: pid, fen, moves: moves.split(' '), rating: +rating };
  }
  return null;
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
process.on('exit', () => server.kill());
await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes(String(PORT)) && r()));

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const external = [];
await ctx.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === 'localhost' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
  external.push(u.href);
  return route.abort();
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let passed = 0;
const step = async (name, fn) => {
  try { await fn(); passed++; console.log('✓', name); }
  catch (e) {
    console.log('✗', name, '\n   ', e.message.split('\n')[0]); process.exitCode = 1;
    await page.screenshot({ path: `test-shots/fail-pz-${passed}.png`, fullPage: true }).catch(() => {});
    console.log('    feedback:', await page.getByTestId('pz-feedback').textContent({ timeout: 1000 }).catch(() => '-'), '| fen:', await boardFen().catch(() => '-'));
  }
};
const expectTrue = (v, msg) => { if (!v) throw new Error(msg); };

const boardFen = () => page.locator('svg.board').getAttribute('data-fen');
async function sqXY(sq, orientation) {
  const box = await page.locator('svg.board').boundingBox();
  const f = 'abcdefgh'.indexOf(sq[0]), r = Number(sq[1]) - 1;
  const col = orientation === 'w' ? f : 7 - f, row = orientation === 'w' ? 7 - r : r;
  const s = box.width / 8;
  return { x: box.x + col * s + s / 2, y: box.y + row * s + s / 2 };
}
async function drag(uci, orientation) {
  const a = await sqXY(uci.slice(0, 2), orientation), b = await sqXY(uci.slice(2, 4), orientation);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
}
/** waits for the set-up move, returns the puzzle shown (skipping ones that need a promotion) */
async function currentPuzzle() {
  for (let i = 0; i < 8; i++) {
    let f = null, p = null;
    for (let w = 0; w < 60 && !p; w++) {
      await page.waitForTimeout(250);
      const ready = /دورك/.test((await page.getByTestId('pz-feedback').textContent()) ?? '');
      if (!ready) continue;
      f = await boardFen();
      const q = byId(await page.getByTestId('pz-top').getAttribute('data-puzzle-id'));
      // the board must show the position after the set-up move
      if (q) { const c = new Chess(q.fen); const m = q.moves[0]; c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }); if (c.fen() === f) p = q; }
    }
    if (p && !p.moves.some((u, k) => k % 2 === 1 && u.length === 5)) return { ...p, color: f.split(' ')[1] };
    await page.getByTestId('pz-skip').click();
    await page.waitForTimeout(900);
  }
  throw new Error('no suitable puzzle');
}
const ratingNum = async () => Number((await page.getByTestId('pz-user-rating').textContent()).replace(/[^\d]/g, ''));

await page.goto(BASE);
await page.waitForSelector('[data-testid=nav-puzzles]');

await step('puzzle home: rating 1000, spec sections with real counts', async () => {
  await page.getByTestId('nav-puzzles').click();
  await page.getByTestId('pz-cat-c_random').waitFor();
  const r = await page.getByTestId('pz-home-rating').textContent();
  expectTrue(r.includes('1000'), 'starting rating: ' + r);
  for (const id of ['c_tactics', 'c_endgame', 'c_mate', 'c_defense', 'c_attack', 'c_sacrifice', 'c_best', 'c_middlegame', 'c_advanced',
    'eg_kpk', 'eg_kqk', 'eg_krk', 'eg_rr', 'm_kq', 'm_kr', 'm_kbn', 'm_in1', 'm_in5', 'm_patterns']) {
    const b = page.getByTestId('pz-cat-' + id);
    expectTrue(!(await b.isDisabled()), id + ' has puzzles');
  }
  const txt = await page.locator('.screen').textContent();
  expectTrue(txt.includes('Glicko-2'), 'rating note');
  await page.screenshot({ path: 'test-shots/20-puzzles-home.png', fullPage: true });
});

let p1;
await step('solve a mate-in-1: info above/below the board, rating goes up, idea explained', async () => {
  await page.getByTestId('pz-cat-m_in1').click();
  p1 = await currentPuzzle();
  const top = await page.getByTestId('pz-top').textContent();
  expectTrue(top.includes('1000') && top.includes(String(p1.rating)), 'top bar: ' + top);
  expectTrue((await page.getByTestId('pz-goal').textContent()).includes('مات'), 'goal');
  expectTrue((await page.getByTestId('pz-total').textContent()) === '1' && (await page.getByTestId('pz-left').textContent()) === '1', 'move counts');
  await page.screenshot({ path: 'test-shots/21-puzzle.png', fullPage: true });
  await drag(p1.moves[1], p1.color);
  if (!(await page.getByTestId('pz-explain').waitFor({ timeout: 4000 }).then(() => true).catch(() => false))) {
    // fallback: tap the piece, then the target square
    const a = await sqXY(p1.moves[1].slice(0, 2), p1.color), b = await sqXY(p1.moves[1].slice(2, 4), p1.color);
    await page.mouse.click(a.x, a.y); await page.mouse.click(b.x, b.y);
  }
  await page.getByTestId('pz-explain').waitFor({ timeout: 15000 });
  expectTrue((await page.getByTestId('pz-feedback').textContent()).includes('صحيح'), 'feedback correct');
  const ch = await page.getByTestId('pz-change').textContent();
  expectTrue(ch.startsWith('+'), 'rating change ' + ch);
  expectTrue((await ratingNum()) > 1000, 'rating up');
  const ex = await page.getByTestId('pz-explain').textContent();
  expectTrue(ex.includes('الفكرة') && ex.includes('Lichess'), 'explanation: ' + ex.slice(0, 120));
  await page.screenshot({ path: 'test-shots/22-puzzle-solved.png', fullPage: true });
});

await step('a wrong move fails the puzzle (rating down), retry and solution are offered', async () => {
  const before = await ratingNum();
  await page.getByTestId('pz-next').click();
  const p = await currentPuzzle();
  const c = new Chess(await boardFen());
  const wrong = c.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? '')).find((u) => {
    if (u === p.moves[1] || u.length === 5) return false;
    const x = new Chess(c.fen()); x.move({ from: u.slice(0, 2), to: u.slice(2, 4) }); return !x.isCheckmate();
  });
  await drag(wrong, p.color);
  await page.getByTestId('pz-retry').waitFor({ timeout: 45000 });
  expectTrue((await page.getByTestId('pz-feedback').textContent()).includes('ليست'), 'wrong feedback');
  await page.waitForFunction(() => document.querySelector('[data-testid=pz-change]')?.textContent?.startsWith('-'), null, { timeout: 5000 });
  expectTrue((await ratingNum()) < before, 'rating down');
  await page.getByTestId('pz-solution').click();
  await page.getByTestId('pz-explain').waitFor({ timeout: 15000 });
  expectTrue((await page.getByTestId('pz-explain').textContent()).includes('✗'), 'rated as failed');
});

await step('hint highlights the piece and counts as failed; skip without a move is unrated', async () => {
  await page.getByTestId('pz-next').click();
  const p = await currentPuzzle();
  await page.getByTestId('pz-hint').click();
  expectTrue((await page.getByTestId('pz-feedback').textContent()).includes('حرّك'), 'hint text');
  await drag(p.moves[1], p.color);
  await page.getByTestId('pz-explain').waitFor({ timeout: 15000 });
  expectTrue((await page.getByTestId('pz-explain').textContent()).includes('✗'), 'hint → failed for rating');
  await page.getByTestId('pz-next').click();
  await currentPuzzle();
  const r0 = await ratingNum();
  await page.getByTestId('pz-skip').click();
  await currentPuzzle();
  expectTrue((await ratingNum()) === r0, 'skip without a move keeps the rating');
});

await step('statistics: rating, solved/failed, progress', async () => {
  await page.getByTestId('nav-puzzles').click();
  await page.getByTestId('pz-stats').click();
  await page.getByTestId('pz-stats').waitFor();
  expectTrue((await page.getByTestId('pz-st-solved').textContent()) === '1', 'solved 1');
  expectTrue((await page.getByTestId('pz-st-failed').textContent()) === '2', 'failed 2');
  const txt = await page.locator('.screen').textContent();
  expectTrue(txt.includes('اليوم') && txt.includes('3 محاولة'), 'daily progress: ' + txt.slice(0, 300));
  await page.screenshot({ path: 'test-shots/23-puzzle-stats.png', fullPage: true });
});

await step('home shows the puzzle rating', async () => {
  await page.getByTestId('nav-home').click();
  const s = await page.getByTestId('stats').textContent();
  expectTrue(/\d{3,4}\?/.test(s), 'provisional puzzle rating on home: ' + s);
});

await step('no request left the device; no page errors', async () => {
  expectTrue(external.length === 0, 'external: ' + external.join(', '));
  expectTrue(errors.length === 0, 'errors: ' + errors.join(' | '));
});

console.log(`\n${passed} puzzle steps passed`);
await browser.close();
server.kill();
process.exit(process.exitCode ?? 0);

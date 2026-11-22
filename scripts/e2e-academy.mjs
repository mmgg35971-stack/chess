// End-to-end test of the Openings Academy (spec 8) in Chrome at phone size, offline.
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const PORT = 4324;
const BASE = `http://localhost:${PORT}/`;
mkdirSync('test-shots', { recursive: true });
const italian = JSON.parse(readFileSync('public/data/academy/italian.json', 'utf8'));
const key = (fen) => fen.split(' ').slice(0, 4).join(' ');
const theory = new Map(); // position → acceptable learner moves (uci)
for (const l of italian.lines) {
  const c = new Chess();
  l.sans.forEach((s, i) => {
    if (i % 2 === 0) { const m = new Chess(c.fen()).move(s); const k = key(c.fen()); if (!theory.has(k)) theory.set(k, new Set()); theory.get(k).add(m.from + m.to); }
    c.move(s);
  });
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
  external.push(u.href); return route.abort();
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let passed = 0;
const step = async (name, fn) => {
  try { await fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n   ', e.message.split('\n')[0]); process.exitCode = 1; await page.screenshot({ path: `test-shots/fail-ac-${passed}.png`, fullPage: true }).catch(() => {}); }
};
const expectTrue = (v, msg) => { if (!v) throw new Error(msg); };
const boardFen = () => page.locator('svg.board').first().getAttribute('data-fen');
async function sqXY(sq) {
  const box = await page.locator('svg.board').first().boundingBox();
  const f = 'abcdefgh'.indexOf(sq[0]), r = Number(sq[1]) - 1, s = box.width / 8;
  return { x: box.x + f * s + s / 2, y: box.y + (7 - r) * s + s / 2 };
}
async function drag(from, to) {
  const a = await sqXY(from), b = await sqXY(to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
}
const sanToUci = (fen, san) => { const m = new Chess(fen).move(san); return [m.from, m.to]; };
/** plays the stage test from the board (white), optionally one wrong move first */
async function playTest(stageIdx, { wrongFirst = false } = {}) {
  const st = italian.stages[stageIdx], sans = italian.lines[st.line].sans;
  let wrongDone = !wrongFirst;
  for (let i = st.from; i <= st.to; i++) {
    if (i % 2 === 1) continue;
    await page.waitForFunction((f) => document.querySelector('svg.board')?.getAttribute('data-fen')?.split(' ')[1] === 'w', null, { timeout: 8000 });
    const fen = await boardFen();
    if (!wrongDone) {
      const legal = new Chess(fen).moves({ verbose: true }).filter((m) => !theory.get(key(fen))?.has(m.from + m.to));
      await drag(legal[0].from, legal[0].to);
      await page.getByTestId('ac-feedback').waitFor();
      expectTrue((await page.getByTestId('ac-feedback').textContent()).includes(sans[i]), 'wrong-move feedback names the move');
      wrongDone = true;
    }
    const [a, b] = sanToUci(fen, sans[i]);
    await drag(a, b);
    await page.waitForTimeout(650);
  }
  await page.getByTestId('ac-result').waitFor({ timeout: 8000 });
}

await page.goto(BASE);
await page.waitForSelector('[data-testid=nav-openings]');

await step('academy home: >10 openings for White and for Black', async () => {
  await page.getByTestId('nav-openings').click();
  await page.getByTestId('ac-list').waitFor();
  const w = await page.locator('.ac-card').count();
  await page.getByRole('radio', { name: 'افتتاحيات الأسود' }).click();
  const b = await page.locator('.ac-card').count();
  expectTrue(w > 10 && b > 10, `white ${w}, black ${b}`);
  await page.screenshot({ path: 'test-shots/30-academy-black.png', fullPage: true });
  await page.getByRole('radio', { name: 'افتتاحيات الأبيض' }).click();
});

await step('opening page: ECO, history, plans, players, main line with explanations, stages', async () => {
  await page.getByTestId('ac-italian').click();
  await page.getByTestId('ac-stages').waitFor();
  const txt = await page.locator('.screen').textContent();
  for (const s of ['C50', 'نبذة تاريخية', 'غريكو', 'خطط الأبيض', 'Greco', 'المرحلة 1']) expectTrue(txt.includes(s), 'missing ' + s);
  for (let i = 0; i < 5; i++) await page.getByTestId('ac-main-next').click();
  const ex = await page.getByTestId('ac-main-explain').textContent();
  expectTrue(ex.includes('f7') && ex.includes('Stockfish'), 'Bc4 explanation: ' + ex);
  expectTrue(await page.getByTestId('ac-stage-1').isDisabled(), 'stage 2 locked before stage 1');
  await page.screenshot({ path: 'test-shots/31-opening-page.png', fullPage: true });
});

await step('stage 1: learn each move with arrows and reasons, then a test', async () => {
  await page.getByTestId('ac-continue').click();
  await page.getByTestId('ac-learn').waitFor();
  const first = await page.getByTestId('ac-explain').textContent();
  expectTrue(first.length > 20, 'explanation shown');
  let n = 0;
  while (await page.getByTestId('ac-next').isVisible()) { await page.getByTestId('ac-next').click(); n++; if (n > 20) break; }
  expectTrue(n >= 5, 'stepped through the moves: ' + n);
  await page.screenshot({ path: 'test-shots/32-stage-learn.png', fullPage: true });
  await page.getByTestId('ac-start-test').click();
  await playTest(0, { wrongFirst: true });
  expectTrue((await page.getByTestId('ac-result').textContent()).includes('أعد الاختبار'), 'one mistake → retake required');
  await page.getByTestId('ac-retry').click();
  await playTest(0);
  expectTrue((await page.getByTestId('ac-result').textContent()).includes('أتقنت'), 'clean run → mastered');
});

await step('stages 2–10, then the review test of 7–15 positions', async () => {
  for (let s = 1; s < 10; s++) {
    await page.getByTestId('ac-next-stage').click();
    await page.getByTestId('ac-skip-learn').click();
    await playTest(s);
  }
  await page.getByTestId('ac-next-stage').click();
  await page.getByTestId('ac-quiz-progress').waitFor();
  const total = Number((await page.getByTestId('ac-quiz-progress').textContent()).split('/')[1]);
  expectTrue(total >= 7 && total <= 15, 'quiz size ' + total);
  for (let k = 0; k < total; k++) {
    const fen = await boardFen();
    const ok = [...(theory.get(key(fen)) ?? [])][0];
    expectTrue(ok, 'known position');
    await drag(ok.slice(0, 2), ok.slice(2, 4));
    await page.getByTestId('ac-quiz-next').click();
  }
  const res = await page.getByTestId('ac-quiz-result').textContent();
  expectTrue(res.includes(`${total} من ${total}`) && res.includes('نجحت'), 'quiz result: ' + res);
  await page.getByTestId('ac-quiz-back').click();
  const stats = await page.getByTestId('ac-stats').textContent();
  expectTrue(stats.includes('10 من'), 'progress saved: ' + stats);
  await page.screenshot({ path: 'test-shots/33-opening-progress.png', fullPage: true });
});

await step('no request left the device; no page errors', async () => {
  expectTrue(external.length === 0, 'external: ' + external.join(', '));
  expectTrue(errors.length === 0, 'errors: ' + errors.join(' | '));
});
console.log(`\n${passed} academy steps passed`);
await browser.close(); server.kill(); process.exit(process.exitCode ?? 0);

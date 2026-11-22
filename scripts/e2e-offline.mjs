// End-to-end test in Chrome at phone size with every non-local request blocked.
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Chess } from 'chess.js';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const PORT = 4321;
const BASE = `http://localhost:${PORT}/`;
mkdirSync('test-shots', { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
process.on('exit', () => server.kill());
await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes(String(PORT)) && r()));

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
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
page.on('dialog', async (d) => (d.type() === 'prompt' ? d.accept('') : d.accept()));

let passed = 0;
const step = async (name, fn) => {
  try { await fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n   ', e.message.split('\n')[0]); process.exitCode = 1; }
};
const expectTrue = (v, msg) => { if (!v) throw new Error(msg); };

const fen = () => page.locator('svg.board').getAttribute('data-fen');
async function clickSq(sq, orientation = 'w') {
  const box = await page.locator('svg.board').boundingBox();
  const f = 'abcdefgh'.indexOf(sq[0]), r = Number(sq[1]) - 1;
  const col = orientation === 'w' ? f : 7 - f, row = orientation === 'w' ? 7 - r : r;
  const s = box.width / 8;
  return { x: box.x + col * s + s / 2, y: box.y + row * s + s / 2 };
}
async function tap(sq) { const p = await clickSq(sq); await page.mouse.click(p.x, p.y); }
async function dragMove(from, to) {
  const a = await clickSq(from), b = await clickSq(to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
}
async function waitTurn(color) {
  await page.waitForFunction((c) => document.querySelector('svg.board')?.getAttribute('data-fen')?.split(' ')[1] === c, color, { timeout: 20000 });
}
async function startGame({ level, mode }) {
  await page.getByTestId('nav-home').click();
  await page.getByTestId('play-engine').click();
  await page.locator('input[type=range]').fill(String(level));
  if (mode === 'training') await page.getByRole('radio').nth(4).click();
  await page.getByTestId('start-game').click({ timeout: 20000 });
  await page.locator('svg.board').waitFor();
}

await step('app loads, local profile created, Arabic RTL by default', async () => {
  await page.goto(BASE);
  await page.getByTestId('profile-name').waitFor();
  expectTrue((await page.getByTestId('profile-name').textContent()) === 'لاعب', 'default name');
  expectTrue((await page.locator('html').getAttribute('dir')) === 'rtl', 'rtl');
  await page.screenshot({ path: 'test-shots/01-home-empty.png' });
});

await step('rename profile in settings', async () => {
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('name-input').fill('سارة');
  await page.getByTestId('save-name').click();
  await page.getByTestId('nav-home').click();
  await page.getByText('سارة').first().waitFor();
});

await step('tap-move and drag-move are legal-only; engine replies', async () => {
  await startGame({ level: 1, mode: 'training' });
  await tap('e2'); await tap('e5'); // illegal: nothing happens
  expectTrue((await fen()).startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP'), 'illegal move rejected');
  await tap('e2'); await tap('e4');
  const animating = await page.evaluate(() => document.getAnimations().length);
  expectTrue(animating > 0, 'piece slide animation should be running');
  const t0 = Date.now();
  await waitTurn('w');
  const replyMs = Date.now() - t0;
  console.log(`   engine replied after ${replyMs} ms`);
  expectTrue(replyMs >= 700 && replyMs < 4500, 'engine reply time should look human: ' + replyMs);
  expectTrue((await fen()).includes('4P3'), 'e4 played');
  await dragMove('g1', 'f3');
  await waitTurn('w');
  expectTrue((await fen()).split(' ')[0].includes('5N2'), 'Nf3 by drag');
  await page.screenshot({ path: 'test-shots/02-play.png' });
});

await step('undo in training mode returns to the user turn', async () => {
  const before = (await page.getByTestId('moves').textContent()).length;
  await page.getByRole('button', { name: 'تراجع' }).click();
  await waitTurn('w');
  const plies = new Chess(); // count via fen fullmove
  expectTrue((await page.getByTestId('moves').textContent()).length < before, 'move list shorter');
  expectTrue((await fen()).split(' ')[5] === '2', 'back to move 2');
});

await step('unfinished game survives a reload and resumes', async () => {
  const f = await fen();
  await page.reload();
  await page.getByTestId('resume').click();
  await page.locator('svg.board').waitFor();
  await page.waitForFunction((x) => document.querySelector('svg.board')?.getAttribute('data-fen') === x, f, { timeout: 10000 });
});

await step('play legal moves until engine replies 6 times, then resign', async () => {
  for (let i = 0; i < 6; i++) {
    await waitTurn('w');
    const c = new Chess(await fen());
    const m = c.moves({ verbose: true }).find((x) => !x.promotion) ?? c.moves({ verbose: true })[0];
    await tap(m.from); await tap(m.to);
    if (m.promotion) await page.locator('[data-promo=q]').click();
    if (c.isGameOver()) break;
  }
  await page.getByTestId('resign').click();
  await page.getByTestId('result').waitFor();
  expectTrue((await page.getByTestId('result').textContent()).includes('خسرت'), 'loss shown');
  const saved = await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('chess-academy');
    r.onsuccess = () => {
      const q = r.result.transaction('games').objectStore('games').getAll();
      q.onsuccess = () => res(q.result.map((g) => ({ result: g.result, userColor: g.userColor, reason: g.reason, tail: g.pgn.trim().slice(-12), hdr: (g.pgn.match(/\[Result "([^"]+)"\]/) || [])[1] })));
      q.onerror = rej;
    };
    r.onerror = rej;
  }));
  console.log('   saved:', JSON.stringify(saved));
  expectTrue(saved.length === 1 && saved[0].result === '0-1' && saved[0].hdr === '0-1' && saved[0].tail.endsWith('0-1'), 'saved result must be 0-1');
  await page.screenshot({ path: 'test-shots/03-result.png' });
});

await step('stats come from the real game; history replay works', async () => {
  await page.getByTestId('nav-home').click();
  await page.getByTestId('stats').locator('.stat-v').first().waitFor();
  const vals = await page.getByTestId('stats').locator('.stat-v').allTextContents();
  // order: games, wins, losses, draws, win rate, ...
  expectTrue(vals[0] === '1' && vals[1] === '0' && vals[2] === '1' && vals[3] === '0' && vals[4] === '0%', 'stats: ' + vals.join(' | '));
  await page.getByTestId('open-history').click();
  await page.getByTestId('game-list').locator('li').first().click();
  const end = await fen();
  await page.getByTestId('prev').click();
  expectTrue((await fen()) !== end, 'prev changes position');
  const hdr = await page.locator('.res').first().evaluate((e) => ({ text: e.textContent, dir: getComputedStyle(e).direction }));
  expectTrue(hdr.text === '0-1' && hdr.dir === 'ltr', 'result isolated LTR: ' + JSON.stringify(hdr));
  await page.screenshot({ path: 'test-shots/04-replay.png' });
});

await step('with a 5+0 clock the engine spends its own time', async () => {
  await page.getByTestId('nav-home').click();
  await page.getByTestId('play-engine').click();
  await page.locator('input[type=range]').fill('1');
  await page.locator('select').selectOption('5+0');
  await page.getByTestId('start-game').click();
  await page.locator('svg.board').waitFor();
  await tap('e2'); await tap('e4');
  await waitTurn('w');
  for (let i = 0; i < 3; i++) {
    await waitTurn('w');
    const c = new Chess(await fen());
    const m = c.moves({ verbose: true }).find((x) => !x.promotion);
    await tap(m.from); await tap(m.to);
  }
  await waitTurn('w');
  const black = await page.getByTestId('clock-b').textContent();
  const [mm, ss] = black.split(':').map(Number);
  const used = 300 - (mm * 60 + ss);
  console.log(`   engine clock ${black} after 4 moves (used ~${used}s)`);
  expectTrue(used >= 3, 'engine should have used clock time, used ' + used + 's');
  await page.getByTestId('resign').click();
  await page.getByTestId('result').waitFor();
});

await step('UI stays responsive while the engine thinks (level 8)', async () => {
  await startGame({ level: 8, mode: 'competitive' });
  await tap('d2'); await tap('d4');
  const frames = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; performance.now() - t0 < 1000 ? requestAnimationFrame(loop) : res(n); };
    requestAnimationFrame(loop);
  }));
  const thinking = await page.getByTestId('status').textContent();
  expectTrue(frames > 40, `only ${frames} frames/s while thinking`);
  console.log(`   ${frames} frames in 1s while "${thinking}"`);
  await waitTurn('w');
});

await step('English switches to LTR', async () => {
  await page.getByTestId('nav-settings').click();
  await page.getByRole('radio', { name: 'English', exact: true }).click();
  expectTrue((await page.locator('html').getAttribute('dir')) === 'ltr', 'ltr');
  await page.getByText('Delete all my data').waitFor();
  await page.screenshot({ path: 'test-shots/05-settings-en.png', fullPage: true });
  await page.getByRole('radio', { name: 'العربية' }).click();
});

await step('no request ever left the device; no page errors', async () => {
  expectTrue(external.length === 0, 'external requests: ' + external.join(', '));
  expectTrue(errors.length === 0, 'page errors: ' + errors.join(' | '));
});

console.log(`\n${passed} steps passed`);
await browser.close();
server.kill();
process.exit(process.exitCode ?? 0);

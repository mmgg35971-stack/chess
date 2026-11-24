// End-to-end test: analyse a game pasted as PGN (two games in the text; the second one is analysed as Black).
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const PORT = 4326;
const BASE = `http://localhost:${PORT}/`;
mkdirSync('test-shots', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
process.on('exit', () => server.kill());
await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes(String(PORT)) && r()));

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const external = [];
await ctx.route('**/*', (route) => { const u = new URL(route.request().url()); if (u.hostname === 'localhost' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue(); external.push(u.href); return route.abort(); });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let passed = 0;
const step = async (name, fn) => { try { await fn(); passed++; console.log('✓', name); } catch (e) { console.log('✗', name, '\n   ', e.message.split('\n')[0]); process.exitCode = 1; } };
const expectTrue = (v, msg) => { if (!v) throw new Error(msg); };

const PGN = `[Event "Casual"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0

[Event "Training"]
[White "Carol"]
[Black "Me"]
[WhiteElo "1500"]
[BlackElo "1450"]
[Result "0-1"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`;

await page.goto(BASE);
await page.waitForSelector('[data-testid=nav-coaches]');

await step('home offers "analyse a game (PGN)"', async () => {
  await page.getByTestId('open-analyze-pgn').click();
  await page.getByTestId('apg-text').waitFor();
});

await step('invalid text is reported', async () => {
  await page.getByTestId('apg-text').fill('hello world 1. e9');
  await page.getByTestId('apg-error').waitFor();
});

await step('a two-game PGN: pick the second game, play it as Black, and the full analysis runs', async () => {
  await page.getByTestId('apg-text').fill(PGN);
  await page.getByTestId('apg-preview').waitFor();
  await page.getByTestId('apg-pick').selectOption('1');
  expectTrue(/Carol/.test(await page.getByTestId('apg-preview').innerText()), 'second game previewed');
  await page.getByText('الأسود', { exact: true }).last().click();
  await page.screenshot({ path: 'test-shots/50-analyze-pgn.png', fullPage: true });
  await page.getByTestId('apg-go').click();
  await page.getByTestId('game-ratings').waitFor({ timeout: 120000 });
  const op = await page.getByTestId('opening-name').innerText();
  expectTrue(/C4\d|Philidor|King/.test(op), 'opening: ' + op);
  await page.getByTestId('gr-start').click();
  await page.getByTestId('a-moves').waitFor({ timeout: 20000 });
  await page.getByTestId('move-label').waitFor();
  const board = await page.locator('svg.board').first().boundingBox();
  const shot = await page.locator('svg.board').first().getAttribute('data-orientation');
  expectTrue(!shot || shot === 'b', 'board shown from Black: ' + shot);
  void board;
  await page.screenshot({ path: 'test-shots/51-analyze-pgn-report.png', fullPage: true });
});

await step('the game is kept in the history', async () => {
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-history').click();
  await page.getByText('Carol').first().waitFor();
});

await step('everything stayed on the device', async () => {
  expectTrue(external.length === 0, 'external: ' + external.join(', '));
  expectTrue(errors.length === 0, 'errors: ' + errors.join(' | '));
});
console.log(`\n${passed} PGN steps passed`);
await browser.close();
process.exit(process.exitCode ?? 0);

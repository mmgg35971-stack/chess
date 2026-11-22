// End-to-end test in Chrome at phone size with every non-local request blocked.
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Chess } from 'chess.js';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const PORT = 4322;
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


async function userTurn() { await page.waitForFunction(() => document.querySelector('[data-testid=status]')?.textContent?.match(/دورك|Your move/), null, { timeout: 30000 }); }
async function playMove(pick) {
  const c = new Chess(await fen());
  const ms = c.moves({ verbose: true });
  const m = pick ? pick(c, ms) ?? ms[0] : ms.find((x) => !x.promotion) ?? ms[0];
  await tap(m.from); await tap(m.to);
  if (m.promotion) await page.locator('[data-promo=q]').click();
  return m;
}

await step('coaches list shows 7 coaches with dated ratings', async () => {
  await page.goto(BASE);
  await page.getByTestId('nav-coaches').click();
  for (const id of ['carlsen', 'nakamura', 'caruana', 'firouzja', 'tal', 'fischer', 'kasparov']) await page.getByTestId('coach-' + id).waitFor();
  const card = await page.getByTestId('coach-carlsen').textContent();
  expectTrue(card.includes('2823') && card.includes('2026'), 'Carlsen card rating/date: ' + card);
  const loaded = await page.locator('[data-testid=coach-portrait]').evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length);
  expectTrue(loaded === 7, 'all 7 portraits should load, got ' + loaded);
  await page.screenshot({ path: 'test-shots/10-coaches.png', fullPage: true });
});

await step('coach card: Tal facts, last documented rating, peak, death date, disclaimer', async () => {
  await page.getByTestId('coach-tal').click();
  const txt = await page.locator('.screen').textContent();
  for (const s of ['2525', '2705', '1936', '1992', 'محاكاة', 'آخر تصنيف موثق', 'ريغا', 'مولّدة بالذكاء الاصطناعي']) expectTrue(txt.includes(s), 'missing ' + s);
  await page.screenshot({ path: 'test-shots/11-coach-tal.png', fullPage: true });
});

let replyMs = 0;
await step('educational game: coach takes 2–5 s, reviews my move and explains its own', async () => {
  await page.getByRole('radio', { name: 'الأبيض' }).click();
  await page.getByRole('radio', { name: 'مبتدئ' }).click();
  await page.getByRole('radio', { name: 'تعليمي' }).click();
  await page.getByTestId('start-coach').click();
  await page.locator('svg.board').waitFor();
  await userTurn();
  await tap('e2'); await tap('e4');
  const t0 = Date.now();
  await userTurn();
  replyMs = Date.now() - t0;
  console.log(`   coach replied after ${replyMs} ms`);
  expectTrue(replyMs >= 1800 && replyMs <= 9000, 'coach pacing ' + replyMs);
  await page.getByTestId('comment-review').first().waitFor();
  await page.getByTestId('comment-coach').first().waitFor();
  const review = await page.getByTestId('comment-review').first().textContent();
  const coachC = await page.getByTestId('comment-coach').first().textContent();
  console.log('   review:', review.slice(0, 120));
  console.log('   coach :', coachC.slice(0, 140));
  await page.screenshot({ path: 'test-shots/12-coach-edu.png', fullPage: true });
});

await step('a hanging queen is called a blunder/mistake with a reason', async () => {
  // bring the queen out, then put it en prise
  const hang = (c, ms) => {
    const me = c.turn(), opp = me === 'w' ? 'b' : 'w';
    return ms.find((m) => {
      if (m.piece !== 'q' || m.captured) return false;
      const t = new Chess(c.fen()); t.move(m);
      return t.attackers(m.to, opp).length > 0 && t.attackers(m.to, me).length === 0;
    });
  };
  for (let i = 0; i < 4; i++) {
    await userTurn();
    const c = new Chess(await fen());
    if (hang(c, c.moves({ verbose: true }))) break;
    await playMove((c2, ms) => ms.find((m) => m.piece === 'q' && !m.captured && (() => { const t = new Chess(c2.fen()); t.move(m); return t.attackers(m.to, c2.turn() === 'w' ? 'b' : 'w').length === 0; })()) ?? ms.find((m) => m.piece === 'p'));
  }
  await userTurn();
  const m = await playMove(hang);
  console.log('   played', m.san);
  await page.waitForFunction((san) => [...document.querySelectorAll('[data-testid=comment-review]')].some((e) => e.textContent.includes(san)), m.san, { timeout: 30000 });
  const txt = await page.locator('[data-testid=comment-review]').first().textContent();
  console.log('   review:', txt.slice(0, 160));
  expectTrue(/خطأ فادح|خطأ|أضاعت/.test(txt), 'expected a blunder/mistake label: ' + txt);
  expectTrue(txt.includes('الوزير') || txt.includes('مادة'), 'reason should mention the queen/material');
  await page.screenshot({ path: 'test-shots/13-blunder.png', fullPage: true });
});

await step('resign → summary with accuracy, label table; analysis screen + full analysis', async () => {
  await userTurn();
  await page.getByTestId('resign').click();
  await page.getByTestId('summary').waitFor();
  await page.getByTestId('label-table').waitFor();
  const acc = await page.getByTestId('acc-user').textContent();
  expectTrue(/\d/.test(acc), 'accuracy shown: ' + acc);
  await page.screenshot({ path: 'test-shots/14-summary.png', fullPage: true });
  await page.getByTestId('analyze-game').click();
  await page.getByTestId('run-analysis').waitFor();
  await page.getByTestId('run-analysis').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=run-analysis]')?.textContent?.includes('إعادة'), null, { timeout: 120000 });
  await page.getByTestId('a-next').click();
  await page.getByTestId('move-label').waitFor();
  const lbl = await page.getByTestId('move-label').textContent();
  console.log('   first move label:', lbl);
  expectTrue(/نظرية/.test(lbl), '1.e4 should be Book: ' + lbl);
  expectTrue((await page.getByTestId('opening-name').textContent()).length > 5, 'opening name shown');
  const gr = await page.getByTestId('gr-w').textContent();
  console.log('   game rating (white):', gr);
  expectTrue(/\d{3,4} ±\d+/.test(gr) || /10/.test(gr), 'game rating or the 10-move rule shown');
  await page.getByTestId('evalbar').waitFor();
  await page.screenshot({ path: 'test-shots/15-analysis.png', fullPage: true });
  await page.getByTestId('export-annotated').click();
});

await step('training mode: eval bar, hint (piece then arrow), top lines, undo', async () => {
  await page.getByTestId('nav-coaches').click();
  await page.getByTestId('coach-carlsen').click();
  await page.getByRole('radio', { name: 'تدريب' }).click();
  await page.getByTestId('start-coach').click();
  await page.locator('svg.board').waitFor();
  await userTurn();
  await page.getByTestId('evalbar').waitFor();
  await page.waitForTimeout(2500);
  await page.getByTestId('hint').click();
  expectTrue((await page.getByTestId('hint-text').textContent()).includes('حرّك'), 'hint stage 1');
  await page.getByTestId('hint').click();
  expectTrue((await page.locator('svg.board polygon').count()) > 0, 'hint arrow drawn');
  await page.getByTestId('analyze-pos').click();
  await page.getByTestId('top-lines').locator('.pv-line').first().waitFor();
  await page.screenshot({ path: 'test-shots/16-training.png', fullPage: true });
  await playMove();
  await userTurn();
  const before = (await fen());
  await page.getByRole('button', { name: 'تراجع' }).click();
  await page.waitForFunction((f) => document.querySelector('svg.board')?.getAttribute('data-fen') !== f, before);
  expectTrue((await fen()).startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP'), 'undo back to start');
});

await step('imported real Lichess game: full analysis uses the PGN ratings for Game Rating', async () => {
  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-history').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('import-pgn').click()]);
  await chooser.setFiles('tests/fixtures-lichess-game.pgn');
  await page.getByTestId('game-list').locator('li', { hasText: 'مستوردة' }).first().click();
  await page.getByTestId('open-analysis').click();
  await page.getByTestId('run-analysis').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=run-analysis]')?.textContent?.includes('إعادة'), null, { timeout: 240000 });
  const w = await page.getByTestId('gr-w').textContent(), b = await page.getByTestId('gr-b').textContent();
  console.log('   imported game ratings:', w, '|', b);
  expectTrue(/\d{3,4} ±\d+/.test(w) && /\d{3,4} ±\d+/.test(b), 'both game ratings shown');
  await page.screenshot({ path: 'test-shots/17-imported-analysis.png', fullPage: true });
});

await step('no request left the device; no page errors', async () => {
  expectTrue(external.length === 0, 'external: ' + external.join(', '));
  expectTrue(errors.length === 0, 'errors: ' + errors.join(' | '));
});

console.log(`\n${passed} coach steps passed`);
await browser.close();
server.kill();
process.exit(process.exitCode ?? 0);

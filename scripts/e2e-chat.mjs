// End-to-end test of the online coach chat with a scripted fake AI provider.
// Every request is blocked except localhost and the mocked Gemini endpoint; the engine tool runs for real.
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const PORT = 4325;
const BASE = `http://localhost:${PORT}/`;
const AI = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const FREE = 'https://text.pollinations.ai/openai/chat/completions';
mkdirSync('test-shots', { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
process.on('exit', () => server.kill());
await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes(String(PORT)) && r()));

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const requests = [];
const script = [];
const freeRequests = [];
const scriptFree = [];
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
const external = [];
await ctx.route('**/*', async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (u.hostname === 'localhost' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
  if (req.url() === AI) {
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    requests.push({ headers: req.headers(), body: JSON.parse(req.postData() || '{}') });
    const next = script.shift() ?? { status: 500, body: { error: { message: 'no scripted reply' } } };
    return route.fulfill({ status: next.status ?? 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(next.body) });
  }
  if (req.url() === FREE) {
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    freeRequests.push({ headers: req.headers(), body: JSON.parse(req.postData() || '{}') });
    const next = scriptFree.shift() ?? { status: 500, body: { error: 'no scripted reply' } };
    return route.fulfill({ status: next.status ?? 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(next.body) });
  }
  external.push(u.href);
  return route.abort();
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
let passed = 0;
const step = async (name, fn) => {
  try { await fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n   ', e.message.split('\n')[0]); process.exitCode = 1; }
};
const expectTrue = (v, msg) => { if (!v) throw new Error(msg); };

const toolCall = { choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'analyse_position', arguments: JSON.stringify({ fen: '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1' }) } }] } }] };
const answer = [
  'المعارضة يعني أن يقف الملكان متقابلين وبينهما مربع واحد، والطرف الذي **ليس** عليه الدور يكسب المعركة (Lasker, Chess Strategy, 1915).',
  '[[board fen="8/8/8/4k3/8/4K3/4P3/8 w - - 0 1" arrows="e3d3" caption="الأبيض يلعب ويتعادل؟"]]',
  'جرّب هذا الخط خطوة خطوة:',
  '[[line fen="start" moves="e4 e5 Nf3 Nc6 Bb5 a6" caption="الإسبانية"]]',
  '[[puzzles theme="p_pawnEnd" n="3"]]',
  '[[topic id="eg-opposition"]]',
].join('\n');

await page.goto(BASE);
await page.waitForSelector('[data-testid=nav-coaches]');

await step('the chat works with no key and no internet (offline coach is the default)', async () => {
  await page.getByTestId('nav-coaches').click();
  await page.getByTestId('coach-carlsen').click();
  await page.getByTestId('coach-chat').click();
  await page.getByTestId('ch-sugg').first().waitFor();
  expectTrue(await page.getByTestId('ch-nokey').count() === 0, 'no "add a key" card');
  expectTrue(/بدون مفتاح/.test(await page.getByTestId('ch-mode').innerText()), 'offline mode label');
  await page.getByTestId('ch-sugg').nth(1).click(); // opposition
  await page.getByTestId('ch-coach').waitFor({ timeout: 30000 });
  await page.getByTestId('ch-board').first().waitFor();
  await page.getByTestId('ch-pz').first().waitFor({ timeout: 30000 });
  const txt = await page.getByTestId('ch-coach').first().innerText();
  expectTrue(/المعارضة/.test(txt) && /Dvoretsky|Capablanca/.test(txt), 'reply text: ' + txt.slice(0, 200));
  expectTrue(requests.length === 0, 'no model call in offline mode');
  await page.screenshot({ path: 'test-shots/41-offline-coach.png', fullPage: true });
});

await step('follow-up topics continue the conversation', async () => {
  await page.getByTestId('ch-ask').first().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=ch-coach]').length === 2, null, { timeout: 30000 });
  expectTrue(await page.getByTestId('ch-user').count() === 2, 'question added');
});

await step('a pasted FEN is analysed with Stockfish on the device', async () => {
  await page.getByTestId('ch-input').fill('حلل هذه الوضعية: 6k1/5ppp/8/8/8/8/q4PPP/4R1K1 w - - 0 1');
  await page.getByTestId('ch-send').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=ch-coach]').length === 3, null, { timeout: 60000 });
  const last = page.getByTestId('ch-coach').nth(2);
  const txt = await last.innerText();
  expectTrue(/Stockfish/.test(txt) && /Re8#/.test(txt), 'analysis: ' + txt.slice(0, 300));
  await last.getByTestId('ch-line').waitFor();
});

await step('the honest note lists the books in the library', async () => {
  await page.getByTestId('ch-info').click();
  await page.getByTestId('ch-network').waitFor({ timeout: 15000 });
  await page.getByTestId('ch-network').locator('summary').click();
  await page.getByTestId('ch-network').getByText('My System').waitFor();
  const txt = await page.getByTestId('ch-info-body').innerText();
  expectTrue(/155|1\d\d/.test(txt) && !/\{\w+\}/.test(txt) && /Capablanca/.test(txt), 'note: ' + txt.slice(0, 300));
  await page.getByTestId('ch-info').click();
});

await step('the free online mode (no key) answers, and falls back to the offline coach when it fails', async () => {
  await page.getByTestId('ch-settings').click();
  await page.getByTestId('ai-p-free').click();
  expectTrue(await page.getByTestId('ai-key').count() === 0, 'no key field for the free mode');
  await page.getByTestId('ai-save').click();
  await page.getByTestId('nav-coaches').click();
  await page.getByTestId('coach-carlsen').click();
  await page.getByTestId('coach-chat').click();
  await page.getByTestId('ch-clear').click();
  scriptFree.push({ body: { choices: [{ message: { content: 'هذا رد النموذج المجاني عن البيدق المعزول.' } }] } });
  await page.getByTestId('ch-input').fill('اشرح البيدق المعزول');
  await page.getByTestId('ch-send').click();
  await page.getByText('هذا رد النموذج المجاني').waitFor({ timeout: 20000 });
  const req = freeRequests[0];
  expectTrue(req && !req.headers.authorization, 'free mode sends no key');
  expectTrue(/isolated-pawn/.test(req.body.messages[0].content), 'matching concepts sent as context');
  scriptFree.push({ status: 500, body: { error: 'down' } });
  await page.getByTestId('ch-input').fill('اشرح لي وضعية لوسينا');
  await page.getByTestId('ch-send').click();
  await page.getByText('فأجابك المدرب المحلي').waitFor({ timeout: 20000 });
  await page.getByTestId('ch-coach').nth(1).getByTestId('ch-board').waitFor();
});

await step('adding a key in AI settings (stored locally, not in backups)', async () => {
  await page.getByTestId('ch-settings').click();
  await page.getByTestId('ai-p-gemini').click();
  await page.getByTestId('ai-key').fill('test-key-123');
  await page.getByTestId('ai-save').click();
  const stored = await page.evaluate(() => localStorage.getItem('cga.ai'));
  expectTrue(stored && JSON.parse(stored).apiKey === 'test-key-123', 'key not saved');
  await page.getByTestId('nav-coaches').click();
  await page.getByTestId('coach-carlsen').click();
  await page.getByTestId('coach-chat').click();
  await page.getByTestId('ch-clear').click();
  await page.getByTestId('ch-sugg').first().waitFor();
});

await step('a question runs the Stockfish tool and renders board, line, puzzles and a lesson link', async () => {
  script.push({ body: toolCall }, { body: { choices: [{ message: { content: answer } }] } });
  await page.getByTestId('ch-input').fill('اشرح لي المعارضة');
  await page.getByTestId('ch-send').click();
  await page.getByTestId('ch-coach').waitFor({ timeout: 60000 });
  expectTrue(requests.length === 2, 'expected 2 model calls, got ' + requests.length);
  const first = requests[0];
  expectTrue(first.headers.authorization === 'Bearer test-key-123', 'auth header');
  expectTrue(/Carlsen/.test(first.body.messages[0].content) && /search_knowledge FIRST/.test(first.body.messages[0].content), 'system prompt');
  expectTrue(first.body.tools.length === 3, 'tools offered');
  const toolMsg = requests[1].body.messages.find((m) => m.role === 'tool');
  const res = JSON.parse(toolMsg.content);
  expectTrue(typeof res.eval === 'string' && res.bestLines.length >= 1, 'engine result: ' + toolMsg.content);
  await page.getByTestId('ch-board').waitFor();
  await page.getByTestId('ch-line').waitFor();
  await page.getByTestId('ch-pz').first().waitFor({ timeout: 30000 });
  expectTrue(await page.getByText('المعارضة', { exact: false }).count() > 0, 'text');
  await page.screenshot({ path: 'test-shots/40-coach-chat.png', fullPage: true });
});

await step('the line can be stepped through', async () => {
  const line = page.getByTestId('ch-line');
  const before = await line.locator('svg.board').getAttribute('data-fen');
  await line.getByTestId('ch-prev').click();
  const after = await line.locator('svg.board').getAttribute('data-fen');
  expectTrue(before !== after && after.startsWith('r1bqkbnr/1ppp1ppp') === false, `fen did not change: ${after}`);
});

await step('a suggested puzzle opens in the solver', async () => {
  const card = page.getByTestId('ch-pz').first();
  const rating = (await card.locator('span').first().innerText()).trim();
  await card.click();
  await page.getByTestId('pz-top').waitFor({ timeout: 30000 });
  const txt = await page.getByTestId('pz-top').innerText();
  expectTrue(txt.includes(rating), `puzzle rating ${rating} not shown in: ${txt}`);
});

await step('the conversation is kept after a reload', async () => {
  await page.reload();
  await page.getByTestId('nav-coaches').click();
  await page.getByTestId('coach-carlsen').click();
  await page.getByTestId('coach-chat').click();
  await page.getByTestId('ch-coach').waitFor();
  expectTrue(await page.getByTestId('ch-user').count() === 1, 'user message kept');
});

await step('provider errors are explained and can be retried', async () => {
  script.push({ status: 429, body: { error: { message: 'Resource exhausted' } } });
  await page.getByTestId('ch-input').fill('سؤال آخر');
  await page.getByTestId('ch-send').click();
  await page.locator('.ch-msg.err').waitFor({ timeout: 20000 });
  script.push({ body: { choices: [{ message: { content: 'حسنًا، هذه المرة نجحت.' } }] } });
  await page.locator('.ch-msg.err button').click();
  await page.getByText('هذه المرة نجحت').waitFor({ timeout: 20000 });
  expectTrue(await page.locator('.ch-msg.err').count() === 0, 'error bubble should be replaced');
});

await step('no request went anywhere but the chosen provider', async () => {
  expectTrue(external.length === 0, 'external: ' + external.join(', '));
  expectTrue(errors.length === 0, 'page errors: ' + errors.join(' | '));
});

console.log(`\n${passed} chat steps passed`);
await browser.close();
process.exit(process.exitCode ?? 0);

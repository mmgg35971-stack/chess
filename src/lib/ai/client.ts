// Chat-completion clients for the coach chat (online, optional). The user brings their own API key;
// it is kept on the device (localStorage) and sent only to the provider they chose.
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export type ProviderId = 'local' | 'free' | 'gemini' | 'anthropic' | 'openai';

export interface AiConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** OpenAI-compatible endpoints only (custom servers, OpenRouter, Ollama…) */
  baseUrl: string;
}

export const PROVIDERS: Record<ProviderId, { label: string; baseUrl: string; model: string; keyUrl: string }> = {
  // the offline coach on the device: no key, no internet (src/lib/ai/local-coach.ts)
  local: { label: 'Offline coach', baseUrl: '', model: '', keyUrl: '' },
  // Pollinations' anonymous OpenAI-compatible endpoint: no key; a free third-party service that may change or stop
  free: { label: 'Free online model', baseUrl: 'https://text.pollinations.ai/openai/', model: 'openai', keyUrl: '' },
  // Google's OpenAI-compatible endpoint; "gemini-flash-latest" follows Google's current Flash model.
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-flash-latest', keyUrl: 'https://aistudio.google.com/apikey' },
  anthropic: { label: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com/v1/', model: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'OpenAI-compatible', baseUrl: 'https://api.openai.com/v1/', model: '', keyUrl: '' },
};

export const DEFAULT_AI: AiConfig = { provider: 'local', apiKey: '', model: '', baseUrl: '' };
/** Providers that work without any API key. */
export const needsKey = (p: ProviderId) => p === 'gemini' || p === 'anthropic';

export interface ToolDef { name: string; description: string; parameters: Record<string, unknown> }
export interface ToolCall { id: string; name: string; args: Record<string, unknown>; /** provider's own object, sent back unchanged (Gemini keeps its thought signature there) */ raw?: unknown }
export type Msg =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; id: string; name: string; content: string };
export interface Reply { text: string; toolCalls: ToolCall[] }

export interface HttpResponse { status: number; data: unknown }
export type Http = (url: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown }) => Promise<HttpResponse>;

export class AiError extends Error {
  constructor(public kind: 'nokey' | 'auth' | 'quota' | 'network' | 'model' | 'server', msg: string) { super(msg); }
}

const join = (base: string, path: string) => base.replace(/\/+$/, '') + '/' + path;

function errorOf(status: number, data: unknown): AiError {
  const d = data as { error?: { message?: string } | string; message?: string } | string;
  const msg = typeof d === 'string' ? d : typeof d?.error === 'string' ? d.error : d?.error?.message ?? (d as { message?: string })?.message ?? '';
  if (status === 401 || status === 403 || /api key|apikey|unauthor|permission/i.test(msg)) return new AiError('auth', msg || String(status));
  if (status === 429) return new AiError('quota', msg || 'rate limit');
  if (status === 404 || /model/i.test(msg) && status === 400) return new AiError('model', msg || 'model not found');
  return new AiError('server', `${status} ${msg}`.trim());
}

async function call(http: Http, url: string, headers: Record<string, string>, body?: unknown, method: 'GET' | 'POST' = 'POST') {
  let r: HttpResponse;
  try {
    r = await http(url, { method, headers: { 'content-type': 'application/json', ...headers }, body });
  } catch (e) {
    throw new AiError('network', String((e as Error)?.message ?? e));
  }
  let data = r.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* keep text */ } }
  if (r.status < 200 || r.status >= 300) throw errorOf(r.status, data);
  return data;
}

// ---------- OpenAI-compatible (Gemini, OpenAI, OpenRouter, Ollama…) ----------
function toOpenAi(system: string, msgs: Msg[]) {
  const out: unknown[] = [{ role: 'system', content: system }];
  for (const m of msgs) {
    if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.id, content: m.content });
    else if (m.role === 'assistant' && m.toolCalls?.length)
      out.push({ role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map((c) => c.raw ?? ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) });
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

function parseArgs(s: unknown): Record<string, unknown> {
  if (s && typeof s === 'object') return s as Record<string, unknown>;
  try { return JSON.parse(String(s || '{}')); } catch { return {}; }
}

async function openAiChat(cfg: AiConfig, http: Http, system: string, msgs: Msg[], tools: ToolDef[]): Promise<Reply> {
  const base = cfg.provider === 'gemini' || cfg.provider === 'free' ? PROVIDERS[cfg.provider].baseUrl : cfg.baseUrl;
  const data = await call(http, join(base, 'chat/completions'), cfg.apiKey && cfg.provider !== 'free' ? { authorization: 'Bearer ' + cfg.apiKey } : {}, {
    model: cfg.model,
    messages: toOpenAi(system, msgs),
    ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: t })) } : {}),
    temperature: 0.7,
  }) as { choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
  const m = data?.choices?.[0]?.message;
  if (!m) throw new AiError('server', 'empty response');
  return {
    text: m.content ?? '',
    toolCalls: (m.tool_calls ?? []).map((c, i) => {
      const id = c.id || `call_${i}_${Date.now()}`;
      return { id, name: c.function?.name ?? '', args: parseArgs(c.function?.arguments), raw: { ...c, id, type: 'function' } };
    }),
  };
}

// ---------- Anthropic Messages API ----------
function toAnthropic(msgs: Msg[]) {
  const out: { role: 'user' | 'assistant'; content: unknown[] }[] = [];
  const push = (role: 'user' | 'assistant', block: unknown) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(block);
    else out.push({ role, content: [block] });
  };
  for (const m of msgs) {
    if (m.role === 'tool') push('user', { type: 'tool_result', tool_use_id: m.id, content: m.content });
    else if (m.role === 'assistant') {
      if (m.content) push('assistant', { type: 'text', text: m.content });
      for (const c of m.toolCalls ?? []) push('assistant', { type: 'tool_use', id: c.id, name: c.name, input: c.args });
    } else push('user', { type: 'text', text: m.content });
  }
  return out;
}

async function anthropicChat(cfg: AiConfig, http: Http, system: string, msgs: Msg[], tools: ToolDef[]): Promise<Reply> {
  const data = await call(http, join(PROVIDERS.anthropic.baseUrl, 'messages'), {
    'x-api-key': cfg.apiKey,
    'anthropic-version': '2023-06-01',
    // the request comes straight from the user's own device with the user's own key
    'anthropic-dangerous-direct-browser-access': 'true',
  }, {
    model: cfg.model,
    max_tokens: 2048,
    system,
    messages: toAnthropic(msgs),
    ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
  }) as { content?: ({ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> })[] };
  const blocks = data?.content ?? [];
  return {
    text: blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n'),
    toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => { const u = b as { id: string; name: string; input: Record<string, unknown> }; return { id: u.id, name: u.name, args: u.input ?? {} }; }),
  };
}

export function chat(cfg: AiConfig, http: Http, system: string, msgs: Msg[], tools: ToolDef[]): Promise<Reply> {
  if (cfg.provider === 'local') return Promise.reject(new AiError('model', 'the offline coach does not use a model'));
  if (!cfg.apiKey && needsKey(cfg.provider)) return Promise.reject(new AiError('nokey', 'no api key'));
  if (cfg.provider === 'free') cfg = { ...cfg, model: cfg.model || PROVIDERS.free.model };
  if (!cfg.model) return Promise.reject(new AiError('model', 'no model'));
  return cfg.provider === 'anthropic' ? anthropicChat(cfg, http, system, msgs, tools) : openAiChat(cfg, http, system, msgs, tools);
}

/** Models the key can use (for the settings picker). */
export async function listModels(cfg: AiConfig, http: Http): Promise<string[]> {
  if (cfg.provider === 'anthropic') {
    const d = await call(http, join(PROVIDERS.anthropic.baseUrl, 'models'), { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, undefined, 'GET') as { data?: { id: string }[] };
    return (d.data ?? []).map((m) => m.id);
  }
  const base = cfg.provider === 'gemini' || cfg.provider === 'free' ? PROVIDERS[cfg.provider].baseUrl : cfg.baseUrl;
  const d = await call(http, join(base, 'models'), cfg.apiKey ? { authorization: 'Bearer ' + cfg.apiKey } : {}, undefined, 'GET') as { data?: { id: string }[] };
  return (d.data ?? []).map((m) => m.id.replace(/^models\//, '')).sort();
}

// ---------- transport ----------
/** fetch in the browser; Capacitor's native HTTP on Android (no CORS limits in the WebView). */
export async function defaultHttp(): Promise<Http> {
  if (Capacitor.isNativePlatform()) {
    return async (url, init) => {
      const r = await CapacitorHttp.request({ url, method: init.method, headers: init.headers, data: init.body, connectTimeout: 20000, readTimeout: 90000 });
      return { status: r.status, data: r.data };
    };
  }
  return async (url, init) => {
    const r = await fetch(url, { method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    const txt = await r.text();
    let data: unknown = txt;
    try { data = JSON.parse(txt); } catch { /* not json */ }
    return { status: r.status, data };
  };
}

const KEY = 'cga.ai';
/** The AI settings live in localStorage, outside IndexedDB, so backups never contain the API key. */
export function loadAiConfig(): AiConfig {
  try {
    const c = { ...DEFAULT_AI, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<AiConfig>) };
    // a key-based provider without a key falls back to the offline coach, so the chat always works
    return c.provider in PROVIDERS && !(needsKey(c.provider) && !c.apiKey) ? c : { ...DEFAULT_AI };
  } catch { return { ...DEFAULT_AI }; }
}
export function saveAiConfig(c: AiConfig) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
}

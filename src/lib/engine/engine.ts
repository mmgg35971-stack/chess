import { parseBestMove, parseInfo, type InfoLine } from './uci';

/** Minimal line-based transport so the same client runs on a Web Worker (app) or a child process (tests). */
export interface Transport {
  send(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  terminate(): void;
}

export interface SearchLimits {
  depth?: number;
  movetime?: number;
  nodes?: number;
}

export interface SearchResult {
  bestmove: string | null;
  /** final line per multipv index (1-based → index 0) */
  lines: InfoLine[];
}

type Waiter = { match: (l: string) => boolean; resolve: (l: string) => void };

export class EngineClient {
  private waiters: Waiter[] = [];
  private infoCb: ((l: InfoLine) => void) | null = null;
  private lines = new Map<number, InfoLine>();
  private chain: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;
  name = 'Stockfish';

  constructor(private t: Transport) {
    t.onLine((raw) => {
      for (const line of raw.split('\n')) this.handle(line.trim());
    });
    this.ready = this.boot();
  }

  private handle(line: string) {
    if (!line) return;
    if (line.startsWith('id name ')) this.name = line.slice(8);
    const info = parseInfo(line);
    if (info && info.bound === undefined) {
      this.lines.set(info.multipv, info);
      this.infoCb?.(info);
    }
    const i = this.waiters.findIndex((w) => w.match(line));
    if (i >= 0) {
      const [w] = this.waiters.splice(i, 1);
      w.resolve(line);
    }
  }

  private wait(match: (l: string) => boolean): Promise<string> {
    return new Promise((resolve) => this.waiters.push({ match, resolve }));
  }

  private async boot() {
    const ok = this.wait((l) => l === 'uciok');
    this.t.send('uci');
    await ok;
    await this.isReady();
  }

  private async isReady() {
    const r = this.wait((l) => l === 'readyok');
    this.t.send('isready');
    await r;
  }

  whenReady() {
    return this.ready;
  }

  /** Run `fn` after every previously queued engine job. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(() => this.ready).then(fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  setOption(name: string, value: string | number | boolean) {
    return this.enqueue(async () => {
      this.t.send(`setoption name ${name} value ${value}`);
      await this.isReady();
    });
  }

  newGame() {
    return this.enqueue(async () => {
      this.t.send('ucinewgame');
      await this.isReady();
    });
  }

  search(
    fen: string,
    limits: SearchLimits,
    opts: { multipv?: number; onInfo?: (l: InfoLine) => void; moves?: string[] } = {},
  ): Promise<SearchResult> {
    return this.enqueue(async () => {
      const multipv = opts.multipv ?? 1;
      this.t.send(`setoption name MultiPV value ${multipv}`);
      await this.isReady();
      this.lines.clear();
      this.infoCb = opts.onInfo ?? null;
      const done = this.wait((l) => l.startsWith('bestmove'));
      this.t.send(`position fen ${fen}${opts.moves?.length ? ' moves ' + opts.moves.join(' ') : ''}`);
      const parts = ['go'];
      if (limits.depth) parts.push('depth', String(limits.depth));
      if (limits.movetime) parts.push('movetime', String(limits.movetime));
      if (limits.nodes) parts.push('nodes', String(limits.nodes));
      if (parts.length === 1) parts.push('depth', '12');
      this.t.send(parts.join(' '));
      const bm = parseBestMove(await done);
      this.infoCb = null;
      const lines = [...this.lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      return { bestmove: bm?.best ?? null, lines };
    });
  }

  /** Ask a running search to finish now (its promise resolves with the current best). */
  stop() {
    this.t.send('stop');
  }

  terminate() {
    this.t.terminate();
  }
}

/** Browser transport: Stockfish.js lite single-threaded build shipped inside the app. */
export function workerTransport(url = './engine/stockfish-19-lite-single.js'): Transport {
  const w = new Worker(url);
  return {
    send: (c) => w.postMessage(c),
    onLine: (cb) => {
      w.onmessage = (e: MessageEvent) => cb(String(e.data));
    },
    terminate: () => w.terminate(),
  };
}

let shared: EngineClient | null = null;
/** One engine instance for the whole app (memory on phones is limited). */
export function getEngine(): EngineClient {
  if (!shared) shared = new EngineClient(workerTransport());
  return shared;
}

// Stockfish 19 (the same lite single-threaded build the app ships) as a child process, for scripts.
import { spawn } from 'node:child_process';
import { EngineClient, type Transport } from '../../src/lib/engine/engine';

export function nodeTransport(): Transport {
  const p = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-19-lite-single.js'], { stdio: 'pipe' });
  let buf = ''; let cb: (l: string) => void = () => {};
  p.stdout.on('data', (d: Buffer) => { buf += d.toString(); const parts = buf.split('\n'); buf = parts.pop()!; for (const l of parts) cb(l); });
  return { send: (c) => p.stdin.write(c + '\n'), onLine: (f) => { cb = f; }, terminate: () => p.kill() };
}
export const nodeEngine = () => new EngineClient(nodeTransport());

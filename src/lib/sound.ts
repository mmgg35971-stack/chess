/** Move sounds synthesised with Web Audio — no audio files, no licences to track. */
let ctx: AudioContext | null = null;

export function playMoveSound(kind: 'move' | 'capture' | 'check' | 'end') {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = { move: 520, capture: 330, check: 760, end: 440 }[kind];
    osc.type = kind === 'capture' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'end' ? 0.5 : 0.09));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  } catch {
    /* audio unavailable */
  }
}

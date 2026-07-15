/**
 * Âm thanh sinh bằng WebAudio — không cần file asset.
 * AudioContext chỉ khởi tạo được sau một user gesture (gọi initAudio khi bấm nút).
 */
let ctx: AudioContext | null = null;
let muted = localStorage.getItem('cg:muted') === '1';

export function initAudio(): void {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  localStorage.setItem('cg:muted', value ? '1' : '0');
}

function tone(
  freq: number,
  durationMs: number,
  opts: { type?: OscillatorType; gain?: number; delayMs?: number; slideTo?: number } = {},
): void {
  if (muted || !ctx || ctx.state !== 'running') return;
  const { type = 'sine', gain = 0.12, delayMs = 0, slideTo } = opts;
  const t0 = ctx.currentTime + delayMs / 1000;
  const t1 = t0 + durationMs / 1000;

  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t1);
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.001, t1);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1);
}

export const sounds = {
  /** Lá bài đập xuống bàn */
  play(): void {
    tone(220, 60, { type: 'triangle', gain: 0.2, slideTo: 90 });
    tone(1400, 25, { type: 'square', gain: 0.05 });
  },
  /** Bỏ lượt */
  pass(): void {
    tone(140, 90, { type: 'sine', gain: 0.1, slideTo: 90 });
  },
  /** Tới lượt mình */
  turn(): void {
    tone(880, 120, { gain: 0.1 });
    tone(1320, 150, { gain: 0.08, delayMs: 110 });
  },
  win(): void {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 180, { delayMs: i * 130, gain: 0.14 }));
  },
  lose(): void {
    [392, 330, 262].forEach((f, i) => tone(f, 220, { delayMs: i * 160, gain: 0.1 }));
  },
};

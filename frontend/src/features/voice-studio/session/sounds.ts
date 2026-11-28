/**
 * Interface sounds of the studio, synthesised on the spot (no audio files): a rising swell when
 * the conversation starts, a soft tick when a fact is saved, a chord when the issue is ready.
 */
export class StudioSounds {
  private context: AudioContext | undefined;

  /** Call from a tap: browsers only allow audio after a gesture. */
  unlock(): void {
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
    } catch {
      // No audio: the studio works silently.
    }
  }

  start(): void {
    this.tone(196, 0.9, { to: 392, gain: 0.05, type: 'sine' });
    this.tone(294, 0.9, { to: 587, gain: 0.03, type: 'sine', delay: 0.08 });
  }

  saved(): void {
    this.tone(1320, 0.12, { gain: 0.035, type: 'sine' });
    this.tone(1980, 0.16, { gain: 0.02, type: 'sine', delay: 0.05 });
  }

  ready(): void {
    [392, 494, 587, 784].forEach((frequency, i) => this.tone(frequency, 1.6, { gain: 0.04, type: 'triangle', delay: i * 0.09 }));
  }

  dispose(): void {
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
  }

  private tone(frequency: number, seconds: number, options: { to?: number; gain: number; type: OscillatorType; delay?: number }): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const at = context.currentTime + (options.delay ?? 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(options.to, at + seconds);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(options.gain, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + seconds + 0.05);
  }
}

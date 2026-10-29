import type { GameEvent } from '../domain/types';

/** Small synthesized tool sounds: no audio downloads, intervals or additional game clock. */
export function createAudio() {
  let context: AudioContext | null = null, enabled = true, destroyed = false;
  return {
    setEnabled(value: boolean) { enabled = value; if (!value) void context?.suspend(); },
    play(event: GameEvent['type']) {
      if (!enabled || destroyed) return;
      try {
        context ??= new AudioContext(); void context.resume();
        const notes = event === 'build' ? [392, 494, 587] : event === 'harvest' ? [523, 659] : [event === 'chop' ? 130 : event === 'fell' ? 85 : event === 'water' ? 760 : 280];
        notes.forEach((frequency, index) => {
          const at = context!.currentTime + index * 0.1;
          const oscillator = context!.createOscillator(), gain = context!.createGain();
          oscillator.type = event === 'chop' || event === 'fell' ? 'triangle' : 'sine';
          oscillator.frequency.setValueAtTime(frequency, at); oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.55, at + 0.14);
          gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.08, at + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
          oscillator.connect(gain); gain.connect(context!.destination); oscillator.start(at); oscillator.stop(at + 0.22);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        });
      } catch { enabled = false; }
    },
    destroy() { destroyed = true; if (context) void context.close(); context = null; },
  };
}

/**
 * Lightweight alarm / ringtone engine built on the Web Audio API.
 * Produces a "siren" while an accident is a POSSIBLE_ACCIDENT and an
 * escalating telephone "ring" (calling sound) once the emergency is
 * confirmed. No audio files required, works offline and on mobile.
 *
 * NOTE: Browsers block audio until a user gesture. `unlockAlarmAudio()`
 * should be called on the first user interaction (click/tap/keydown) so
 * alerts triggered later by server events can actually play.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

let currentTimer: ReturnType<typeof setTimeout> | null = null;
let osc: OscillatorNode | null = null;
let lfo: OscillatorNode | null = null;
let lfoGain: GainNode | null = null;

export type AlarmKind = 'siren' | 'ring';

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

/** Call on the first user interaction to satisfy browser autoplay rules. */
export function unlockAlarmAudio(): void {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    // Create a silent buffer so the AudioContext is considered "started".
    c.resume().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

function stopVoice(): void {
  if (currentTimer) {
    clearTimeout(currentTimer);
    currentTimer = null;
  }
  try {
    lfo?.stop();
    lfo?.disconnect();
  } catch {
    /* ignore */
  }
  lfo = null;
  lfoGain = null;
  try {
    osc?.stop();
    osc?.disconnect();
  } catch {
    /* ignore */
  }
  osc = null;
}

/** Call this during the app's control flow to stop any active alert sound. */
export function stopAlarm(): void {
  stopVoice();
}

/**
 * Starts the alert sound.
 * - 'siren': warbling emergency siren for a detected (possible) accident.
 * - 'ring':  telephone ringing / "calling" cadence once the emergency is
 *            confirmed, simulating an emergency call being placed.
 */
export function startAlarm(kind: AlarmKind): void {
  const c = getCtx();
  if (!c) return;
  stopVoice();

  if (kind === 'siren') {
    osc = c.createOscillator();
    const oscGain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 720;
    oscGain.gain.value = 0.28;

    // Slow warble between ~600 and ~850 Hz for the classic siren.
    lfo = c.createOscillator();
    lfo.frequency.value = 0.7;
    lfoGain = c.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(oscGain);
    oscGain.connect(master as AudioNode);
    osc.start();
    lfo.start();
  } else {
    // Telephone / call ringing cadence: 1.2s ring, 0.4s pause, repeated.
    osc = c.createOscillator();
    const oscGain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 425; // classic ring frequency
    oscGain.gain.value = 0;
    oscGain.gain.setValueAtTime(0, c.currentTime);

    osc.connect(oscGain);
    oscGain.connect(master as AudioNode);
    osc.start();

    const ringPattern = (start: number) => {
      if (!oscGain || !c) return;
      oscGain.gain.cancelScheduledValues(start);
      oscGain.gain.setValueAtTime(0, start);
      oscGain.gain.linearRampToValueAtTime(0.5, start + 0.05);
      oscGain.gain.setValueAtTime(0.5, start + 1.0);
      oscGain.gain.linearRampToValueAtTime(0, start + 1.2);
    };

    const schedule = () => {
      if (!c) return;
      // Two rings, then a longer pause, to feel like a real phone ringing out.
      const t0 = c.currentTime + 0.05;
      ringPattern(t0);
      ringPattern(t0 + 1.6);
      currentTimer = setTimeout(schedule, 3200);
    };
    schedule();
  }
}

/**
 * Voice control for the emergency alarm using the Web Speech API.
 * While the alarm is active it listens continuously for phrases such as
 * "stop alarm", "cancel", "quiet", "stop the siren", etc. and invokes a
 * callback when one is recognised.
 *
 * Works in Chrome, Edge and Safari (where supported). Browsers that don't
 * support speech recognition simply fall back to the button controls.
 */

interface RecognitionEvent {
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
  }>;
}

interface RecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

// Phrases that silence the alarm.
const STOP_PHRASES = [
  'stop alarm',
  'stop the alarm',
  'stop alarm now',
  'cancel alarm',
  'cancel the alarm',
  'cancel',
  'turn off alarm',
  'alarm off',
  'stop siren',
  'stop the siren',
  'quiet',
  'silence',
  'stop',
  'keep quiet',
];

let recognition: RecognitionInstance | null = null;
let active = false;
let stopCallback: (() => void) | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

function getRecognitionCtor(): (new () => RecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionInstance;
    webkitSpeechRecognition?: new () => RecognitionInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether voice control is available on this browser. */
export function isVoiceControlSupported(): boolean {
  return getRecognitionCtor() !== null;
}

function startListening(): void {
  if (!active || !recognition) return;
  try {
    recognition.start();
  } catch {
    // ignore: may already be running
  }
}

/**
 * Starts listening for stop commands. While active, recognised phrases
 * trigger `onStop`. Listening restarts automatically if it drops.
 */
export function startVoiceControl(onStop: () => void): void {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return;
  if (active) {
    stopCallback = onStop;
    return;
  }
  active = true;
  stopCallback = onStop;

  recognition = new Ctor();
  recognition.lang = 'en-IN';
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    if (!active) return;
    const transcript = Array.from(event.results)
      .map((r) => r[0].transcript)
      .join(' ')
      .toLowerCase()
      .trim();
    if (!transcript) return;
    if (STOP_PHRASES.some((p) => transcript.includes(p))) {
      stopCallback?.();
    }
  };

  recognition.onerror = () => {
    // onend will restart the session; unsupported errors are ignored.
  };

  recognition.onend = () => {
    if (active) {
      restartTimer = setTimeout(startListening, 400);
    }
  };

  startListening();
}

/** Stops voice control (safe to call when it isn't running). */
export function stopVoiceControl(): void {
  active = false;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  try {
    recognition?.stop();
  } catch {
    /* ignore */
  }
  recognition = null;
  stopCallback = null;
}
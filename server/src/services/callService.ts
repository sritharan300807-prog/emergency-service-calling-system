import { config } from '../config.js';

/**
 * Outgoing emergency voice calls (REAL telephony via Twilio Programmable Voice).
 * -----------------------------------------------------------------------------
 * - Calls multiple emergency contacts CONCURRENTLY.
 * - Speaks an AI-generated message (Twilio <Say> TTS) in Tamil and/or English.
 * - Includes the accident location AND a Google Maps link when GPS is available.
 * - NEVER invents a location: if coordinates are missing, it says so explicitly.
 * - Supports a clearly-labelled TEST MODE (explicit activation via env).
 * - Tracks call status via Twilio StatusCallback (initiated → ringing → answered
 *   → completed / failed).
 *
 * SECURITY: credentials come only from server-side environment variables.
 * They are never logged and never sent to the browser.
 */

export type CallChannel = 'TWILIO' | 'NONE';

export interface CallOutcome {
  callSid?: string;
  status?: string;
  channel: CallChannel;
  error?: string;
  /** E.164 number this outcome refers to. */
  to?: string;
}

export interface OutgoingCallInput {
  toNumber: string;
  /** Latitude/longitude of the accident, or null when GPS was unavailable. */
  latitude: number | null;
  longitude: number | null;
  /** Human-readable reverse-geocoded address, or null. */
  address: string | null;
  /** Incident id, forwarded to the status callback for correlation. */
  incidentId?: string;
  /** When true, uses the labelled TEST message. */
  testMode?: boolean;
}

/** Whether real outgoing calls are configured (Twilio credentials present). */
export function isTwilioConfigured(): boolean {
  return Boolean(
    config.twilio.accountSid && config.twilio.authToken && config.twilio.fromNumber
  );
}

/** E.164 sanity check — Twilio requires + then 8–15 digits. */
export function isValidE164(num: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(num.trim());
}

/** Builds a Google Maps link for a coordinate pair (never invented). */
export function mapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function spokenLocation(input: OutgoingCallInput): { en: string; ta: string } {
  if (
    input.latitude == null ||
    input.longitude == null ||
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude)
  ) {
    return {
      en: 'The accident location could not be determined. GPS coordinates were unavailable.',
      ta: 'விபத்து நடந்த இடத்தை அறிய முடியவில்லை. ஜி.பி.எஸ் தகவல் கிடைக்கவில்லை.',
    };
  }
  const link = mapsLink(input.latitude, input.longitude);
  const coords = `${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)}`;
  const en = input.address
    ? `The accident is near ${input.address}. Coordinates ${coords}.`
    : `The accident coordinates are ${coords}.`;
  const ta = input.address
    ? `விபத்து நடந்த இடம்: ${input.address} அருகில். ஆயங்கள் ${coords}.`
    : `விபத்து நடந்த இடத்தின் ஆயங்கள் ${coords}.`;
  return { en: `${en} A Google Maps link has been sent. ${link}`, ta };
}

/**
 * Builds the TwiML spoken on answer. Tamil first, then English by default.
 * In TEST MODE the message is explicitly labelled as a test.
 */
export function buildTwiML(input: OutgoingCallInput): string {
  const loc = spokenLocation(input);
  const label = input.testMode
    ? {
        en: 'This is a TEST of the automatic accident alert system. No real emergency has occurred. ',
        ta: 'இது ஒரு சோதனை அழைப்பு. உண்மையான அவசரநிலை எதுவும் இல்லை. ',
      }
    : { en: '', ta: '' };

  const en = `${label.en}Emergency alert! A car accident has been detected. ${loc.en} Please contact the emergency team immediately. I repeat, a car accident has been detected.`;
  const ta = `${label.ta}அவசர எச்சரிக்கை! கார் விபத்து கண்டறியப்பட்டுள்ளது. ${loc.ta} உடனடியாக அவசர குழுவைத் தொடர்பு கொள்ளவும். மீண்டும் கூறுகிறேன், கார் விபத்து நடந்துள்ளது.`;

  const parts: string[] = [];
  const order = config.calls.language;

  const sayTa = `<Say voice="Polly.Aditi" language="ta-IN">${escapeXml(ta)}</Say>`;
  const sayEn = `<Say voice="${input.testMode ? 'Polly.Aditi' : 'alice'}" language="en-IN">${escapeXml(en)}</Say>`;

  if (order === 'ta') {
    parts.push(sayTa);
  } else if (order === 'en') {
    parts.push(sayEn);
  } else {
    // 'ta-en' → Tamil then English (covers both audiences).
    parts.push(sayTa, `<Pause length="1"/>`, sayEn);
  }

  // Final repetition of the key instruction.
  parts.push(
    `<Pause length="1"/>`,
    `<Say voice="alice" language="en-IN">${escapeXml('Please contact the emergency team immediately.')}</Say>`
  );

  return `<Response>${parts.join('')}</Response>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Places ONE real outgoing emergency call via Twilio. Resolves with the call SID
 * and initial status. Errors are returned (never thrown) so a failure to reach
 * one number never blocks the others.
 */
export async function placeEmergencyCall(input: OutgoingCallInput): Promise<CallOutcome> {
  const to = input.toNumber?.trim();
  if (!to || !isValidE164(to)) {
    return { channel: 'NONE', error: `Invalid phone number: ${to || '(empty)'}`, to };
  }
  if (!isTwilioConfigured()) {
    return { channel: 'NONE', error: 'Twilio is not configured', to };
  }

  const twiml = buildTwiML(input);

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(config.twilio.accountSid, config.twilio.authToken);

    const statusCallback =
      config.twilio.publicBaseUrl
        ? `${config.twilio.publicBaseUrl}/api/calls/twilio-status${
            input.incidentId ? `?incidentId=${encodeURIComponent(input.incidentId)}` : ''
          }`
        : undefined;

    const call = await client.calls.create({
      to,
      from: config.twilio.fromNumber,
      twiml,
      timeout: config.calls.timeoutSeconds,
      ...(statusCallback
        ? {
            statusCallback,
            statusCallbackMethod: 'POST' as const,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'] as string[],
          }
        : {}),
    });
    return { callSid: call.sid, status: call.status, channel: 'TWILIO', to };
  } catch (err) {
    // Log a safe message only — never log credentials.
    const message = (err as Error).message || 'Call failed';
    console.error(`[callService] Twilio call to ${to} failed: ${message}`);
    return { channel: 'TWILIO', error: message, to };
  }
}

/**
 * Places REAL calls to ALL given numbers CONCURRENTLY (approximately at the
 * same time). Each number is independent: one failure does not affect others.
 */
export async function placeEmergencyCalls(
  numbers: string[],
  base: Omit<OutgoingCallInput, 'toNumber'>
): Promise<CallOutcome[]> {
  const results = await Promise.allSettled(
    numbers.map((toNumber) => placeEmergencyCall({ ...base, toNumber }))
  );
  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { channel: 'TWILIO' as CallChannel, error: String(r.reason), to: numbers[i] }
  );
}

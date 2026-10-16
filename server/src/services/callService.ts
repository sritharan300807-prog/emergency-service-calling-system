import { config } from '../config.js';

export interface CallOutcome {
  callSid?: string;
  status?: string;
  channel: 'TWILIO' | 'NONE';
  error?: string;
}

/** Whether real outgoing calls are configured (Twilio credentials present). */
export function isTwilioConfigured(): boolean {
  return Boolean(
    config.twilio.accountSid && config.twilio.authToken && config.twilio.fromNumber
  );
}

/**
 * Places a real outgoing voice call to `toNumber` using Twilio.
 * The call is created with inline TwiML (no public webhook needed): when the
 * recipient answers, Twilio reads the emergency message aloud.
 */
export async function placeEmergencyCall(toNumber: string): Promise<CallOutcome> {
  if (!isTwilioConfigured()) {
    return { channel: 'NONE', error: 'Twilio is not configured' };
  }

  const twiml =
    '<Response><Say voice="alice" language="en-IN">Emergency alert. A vehicle linked to your emergency contact has been involved in a possible accident. Please respond immediately or contact emergency services.</Say></Response>';

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(config.twilio.accountSid, config.twilio.authToken);
    const call = await client.calls.create({
      to: toNumber,
      from: config.twilio.fromNumber,
      twiml,
    });
    return { callSid: call.sid, status: call.status, channel: 'TWILIO' };
  } catch (err) {
    return { channel: 'TWILIO', error: (err as Error).message };
  }
}
import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import {
  buildTwiML,
  isValidE164,
  isTwilioConfigured,
  placeEmergencyCall,
  placeEmergencyCalls,
} from '../services/callService.js';
import { updateCallStatusBySid } from '../services/notificationService.js';
import { getIncidentById } from '../services/incidentService.js';
import { publish } from '../events.js';
import { uid } from '../events.js';

const router = Router();

/**
 * POST /api/calls/twilio-status
 * Twilio StatusCallback webhook. PUBLIC (Twilio cannot present a JWT), so it is
 * protected by an unguessable path token when CALL_STATUS_TOKEN is set.
 * Updates the notification row matched by CallSid with the live call status.
 */
router.post('/twilio-status', (req, res) => {
  const expected = process.env.CALL_STATUS_TOKEN || '';
  if (expected) {
    const provided = (req.query.token as string) || (req.headers['x-call-token'] as string) || '';
    if (provided !== expected) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }
  const callSid = String(req.body.CallSid || '');
  const callStatus = String(req.body.CallStatus || '');
  if (callSid && callStatus) {
    const updated = updateCallStatusBySid(callSid, callStatus);
    if (updated) {
      console.log(`[calls] status ${callStatus} for ${callSid.slice(0, 12)}…`);
    }
  }
  // Twilio expects an XML/empty 200 response.
  res.status(200).send('<Response></Response>');
});

/**
 * GET /api/calls/config
 * Reports whether REAL calling is enabled and what will be dialed. Never
 * returns secrets. Used by the dashboard to show a clear configuration banner.
 */
router.get('/config', requireAuth, (_req, res) => {
  res.json({
    twilioConfigured: isTwilioConfigured(),
    testMode: config.calls.testMode,
    language: config.calls.language,
    maxRetries: config.calls.maxRetries,
    retryDelayMs: config.calls.retryDelayMs,
    statusCallbacks: Boolean(config.twilio.publicBaseUrl),
    // Numbers are shown in full so you can verify what will be dialed.
    emergencyContacts: config.emergencyContacts,
    // Branded flag: TEST MODE never dials real emergencies.
    mode: config.calls.testMode
      ? 'TEST'
      : isTwilioConfigured()
        ? 'LIVE'
        : 'DEMO',
  });
});

/**
 * POST /api/calls/test
 * Places a REAL test call to a single number using the clearly-labelled TEST
 * message — but ONLY when TEST MODE is explicitly enabled (EMERGENCY_TEST_MODE
 * =true). This lets you verify the phone rings and the Tamil/English voice
 * plays, without triggering a genuine emergency alert.
 */
router.post('/test', requireRole('ADMIN'), async (req: AuthedRequest, res) => {
  if (!config.calls.testMode) {
    throw new AppError(
      'Test mode is disabled. Set EMERGENCY_TEST_MODE=true on the server to enable test calls.',
      403
    );
  }
  if (!isTwilioConfigured()) {
    throw new AppError(
      'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER.',
      400
    );
  }
  const to = String(req.body.to || '').trim();
  if (!isValidE164(to)) {
    throw new AppError('A valid E.164 number is required in body.to (e.g. +917358991015).', 400);
  }
  const incidentId = (req.body.incidentId as string) || undefined;
  let latitude: number | null = null;
  let longitude: number | null = null;
  let address: string | null = null;
  if (incidentId) {
    const incident = getIncidentById(incidentId);
    if (incident) {
      latitude = incident.latitude;
      longitude = incident.longitude;
      address = incident.address;
    }
  }
  if (typeof req.body.latitude === 'number') latitude = req.body.latitude;
  if (typeof req.body.longitude === 'number') longitude = req.body.longitude;

  const outcome = await placeEmergencyCall({
    toNumber: to,
    latitude,
    longitude,
    address,
    incidentId,
    testMode: true,
  });

  const logId = uid();
  publish('notification.updated', {
    id: logId,
    type: 'VOICE_CALL',
    recipient: to,
    callSid: outcome.callSid ?? null,
    callStatus: outcome.error ? 'FAILED' : 'INITIATED',
    testMode: true,
    error: outcome.error ?? null,
  });

  res.json({
    testMode: true,
    to,
    callSid: outcome.callSid ?? null,
    status: outcome.status ?? null,
    error: outcome.error ?? null,
    messagePreview: 'Tamil then English TEST alert with location (if provided).',
  });
});

/**
 * POST /api/calls/preview-twiML
 * Returns the exact TwiML that would be spoken to a given number, so you can
 * read the message WITHOUT placing a call (safe, no credentials needed).
 */
router.post('/preview-twiml', requireAuth, (req, res) => {
  const latitude = typeof req.body.latitude === 'number' ? req.body.latitude : null;
  const longitude = typeof req.body.longitude === 'number' ? req.body.longitude : null;
  const address = (req.body.address as string) || null;
  const twiml = buildTwiML({
    toNumber: '+910000000000',
    latitude,
    longitude,
    address,
    testMode: Boolean(req.body.testMode),
  });
  res.json({ twiml });
});

/**
 * POST /api/calls/dispatch
 * Manually (re)dial all configured emergency contacts for an incident. Admin
 * only. Respects the dedup guard and retry policy in the notification service.
 */
router.post('/dispatch', requireRole('ADMIN', 'RESPONDER'), async (req: AuthedRequest, res) => {
  const incidentId = (req.body.incidentId as string) || '';
  const incident = getIncidentById(incidentId);
  if (!incident) throw new AppError('Incident not found', 404);
  if (!isTwilioConfigured()) {
    throw new AppError('Twilio is not configured — cannot place real calls.', 400);
  }
  const incidentFull = getIncidentById(incidentId)!;
  const outcomes = await placeEmergencyCalls(config.emergencyContacts, {
    latitude: incidentFull.latitude,
    longitude: incidentFull.longitude,
    address: incidentFull.address,
    incidentId,
    testMode: config.calls.testMode,
  });
  res.json({ dispatched: outcomes.length, outcomes });
});

export default router;

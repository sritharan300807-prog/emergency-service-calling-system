import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  dbFile: process.env.DB_FILE || './data/emergency.db',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Twilio voice integration for REAL outgoing emergency calls.
  // When the SID/token/from number are set, VOICE_CALL notifications place
  // real calls to the configured emergency contacts instead of demo records.
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
    // Public base URL of THIS server, used for Twilio status callbacks
    // (e.g. https://autosafe.onrender.com). When empty, status callbacks are
    // omitted and call status is tracked only from the initial API response.
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  },
  // The three emergency contacts that receive REAL outgoing calls when a
  // genuine accident is confirmed. Comma-separated E.164 numbers.
  // Defaults to the three numbers configured for this deployment.
  emergencyContacts: (
    process.env.EMERGENCY_CONTACTS ||
    '+917358991015,+918248319996,+918754932145'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Backwards-compatible single number (kept for existing callers/tests).
  emergencyCallTo: process.env.EMERGENCY_CALL_TO || '+917358991015',
  // Outgoing call behaviour.
  calls: {
    // Max additional attempts per number after the first failure. 0 disables retry.
    maxRetries: Number(process.env.CALL_MAX_RETRIES || 1),
    // Delay before a retry (ms).
    retryDelayMs: Number(process.env.CALL_RETRY_DELAY_MS || 15000),
    // Spoken message language order: 'ta-en' (Tamil then English) | 'en' | 'ta'.
    language: (process.env.CALL_LANGUAGE || 'ta-en') as 'ta-en' | 'en' | 'ta',
    // TEST MODE — when true, calls use a clearly labelled TEST message and
    // NEVER dial emergency services. Must be explicitly enabled via env.
    testMode: process.env.EMERGENCY_TEST_MODE === 'true',
    // Twilio call timeout (seconds) before considering the call failed.
    timeoutSeconds: Number(process.env.CALL_TIMEOUT_SECONDS || 30),
  },
  // Application settings with sensible defaults (overridable via Settings API).
  app: {
    defaultCountdownSeconds: 15,
    maxCountdownSeconds: 120,
    minCountdownSeconds: 5,
    simulationMode: process.env.SIMULATION_MODE !== 'false',
    mockNotificationDeliveryMs: 1800,
  },
};

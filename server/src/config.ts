import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  dbFile: process.env.DB_FILE || './data/emergency.db',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Twilio voice integration for REAL outgoing emergency calls.
  // When the SID/token/from number are set, VOICE_CALL notifications place a
  // real call to `emergencyCallTo` instead of the demo record.
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
  },
  // Number that receives the automatic emergency voice call when an incident
  // is confirmed (can be overridden via the EMERGENCY_CALL_TO env var).
  emergencyCallTo: process.env.EMERGENCY_CALL_TO || '+917358991015',
  // Application settings with sensible defaults (overridable via Settings API).
  app: {
    defaultCountdownSeconds: 15,
    maxCountdownSeconds: 120,
    minCountdownSeconds: 5,
    simulationMode: process.env.SIMULATION_MODE !== 'false',
    mockNotificationDeliveryMs: 1800,
  },
};

import { Router } from 'express';
import { db } from '../db.js';
import { AppError } from '../middleware/error.js';
import { detectAccident, persistSensorEvent } from '../services/detectionEngine.js';
import { createPossibleAccident, getActiveIncidentForVehicle } from '../services/incidentService.js';
import { updateVehicleLocation } from '../services/locationService.js';
import { publish } from '../events.js';
import type { SensorPayload } from '../types.js';

/** Minimal JWT-free device authentication.
 *  Devices authenticate with an optional X-API-Key header matching
 *  the IOT_API_KEY env var. If none is configured, device calls are
 *  accepted (prototype mode) — always set this in production.
 */
const router = Router();

function authorizeDevice(req: { headers: Record<string, string | string[] | undefined> }): void {
  const configured = process.env.IOT_API_KEY;
  if (configured) {
    const key = req.headers['x-api-key'];
    const actual = Array.isArray(key) ? key[0] : key;
    if (actual !== configured) {
      throw new AppError('Invalid IoT API key', 401);
    }
  }
}

/**
 * POST /api/iot/telemetry
 * Receives sensor + GPS data from an IoT device (ESP32 / OBD-II / ECU).
 * Runs the data through the accident detection engine and, if a possible
 * accident is detected, creates an incident and starts the workflow.
 */
router.post('/telemetry', async (req, res) => {
  authorizeDevice(req);
  const body = req.body as Partial<SensorPayload>;

  const vehicleId = body.vehicleId;
  if (!vehicleId) throw new AppError('vehicleId is required', 400);
  const vehicle = db
    .prepare('SELECT id FROM vehicles WHERE id = ?')
    .get(vehicleId) as { id: string } | undefined;
  if (!vehicle) throw new AppError('Unknown vehicleId', 404);

  const acceleration = typeof body.acceleration === 'number' ? body.acceleration : 0;
  const speed = typeof body.speed === 'number' ? body.speed : 0;
  const orientation = body.orientation || { roll: 0, pitch: 0, yaw: 0 };
  const latitude = typeof body.latitude === 'number' ? body.latitude : null;
  const longitude = typeof body.longitude === 'number' ? body.longitude : null;

  // Continuously update the vehicle's location from live GPS.
  if (latitude != null && longitude != null) {
    updateVehicleLocation(vehicleId, latitude, longitude);
    publish('vehicle.location', { vehicleId, latitude, longitude, timestamp: new Date().toISOString() });
  }

  const detection = detectAccident({
    acceleration,
    speedKph: speed,
    previousSpeedKph: body.previousSpeed as number | undefined,
    roll: orientation.roll,
    pitch: orientation.pitch,
    yaw: orientation.yaw,
    manualSos: body.manualSos,
  });

  persistSensorEvent({
    vehicleId,
    acceleration,
    speed,
    roll: orientation.roll,
    pitch: orientation.pitch,
    yaw: orientation.yaw,
    eventType: detection.eventType,
    latitude,
    longitude,
    source: body.source || 'ESP32',
    timestamp: body.timestamp,
  });

  let incident = getActiveIncidentForVehicle(vehicleId);

  if (detection.eventType === 'POSSIBLE_ACCIDENT' && !incident) {
    incident = await createPossibleAccident({
      vehicleId,
      latitude,
      longitude,
      summary: detection.reasons.join('; '),
    });
  }

  res.json({
    eventType: detection.eventType,
    reasons: detection.reasons,
    confidence: detection.confidence,
    incident: incident
      ? { id: incident.id, status: incident.status }
      : null,
  });
});

/** Simple health check for connected devices. */
router.get('/status', (req, res) => {
  authorizeDevice(req);
  res.json({ status: 'ok', detectionEngine: 'ready', timestamp: new Date().toISOString() });
});

export default router;

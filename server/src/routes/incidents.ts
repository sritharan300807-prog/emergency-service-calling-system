import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import {
  createPossibleAccident,
  getActiveIncidents,
  getIncidentById,
  getIncidentHistory,
  updateIncidentStatus,
} from '../services/incidentService.js';
import { detectAccident, persistSensorEvent } from '../services/detectionEngine.js';
import { getNotificationsForIncident } from '../services/notificationService.js';
import { DEFAULT_LOCATION } from '../services/locationService.js';

const router = Router();

router.use(requireAuth);

// GET /api/incidents/active
router.get('/active', (_req, res) => {
  res.json({ incidents: getActiveIncidents() });
});

// GET /api/incidents/history
router.get('/history', (req, res) => {
  const { status, severity, vehicleId, search } = req.query as Record<string, string>;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const result = getIncidentHistory({ status, severity, vehicleId, search, limit });
  res.json(result);
});

// GET /api/incidents/:id
router.get('/:id', (req: AuthedRequest, res) => {
  const incident = getIncidentById(String(req.params.id));
  if (!incident) throw new AppError('Incident not found', 404);
  const notifications = getNotificationsForIncident(incident.id);
  res.json({ incident, notifications });
});

// POST /api/incidents/simulate — creates a POSSIBLE_ACCIDENT for a vehicle.
router.post('/simulate', requireRole('ADMIN', 'OWNER', 'RESPONDER'), async (req: AuthedRequest, res) => {
  const vehicleId = (req.body.vehicleId as string) || 'veh-001';
  const vehicle = db
    .prepare('SELECT id, owner_id as ownerId, latitude, longitude FROM vehicles WHERE id = ?')
    .get(vehicleId) as { id: string; ownerId: string; latitude: number | null; longitude: number | null } | undefined;
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  if (
    req.user!.role !== 'ADMIN' &&
    req.user!.role !== 'RESPONDER' &&
    vehicle.ownerId !== req.user!.id
  ) {
    throw new AppError('You do not have access to this vehicle', 403);
  }

  // Build a realistic simulated collision sensor payload.
  const orientation = req.body.orientation || { roll: 18, pitch: 7, yaw: -35 };
  const acceleration = req.body.acceleration ?? 6.4;
  const speedAfter = req.body.speed ?? 12;
  const prevSpeed = req.body.previousSpeed ?? 82;
  const lat = req.body.latitude ?? vehicle.latitude ?? DEFAULT_LOCATION.latitude;
  const lng = req.body.longitude ?? vehicle.longitude ?? DEFAULT_LOCATION.longitude;

  const result = detectAccident({
    acceleration,
    speedKph: speedAfter,
    previousSpeedKph: prevSpeed,
    roll: orientation.roll,
    pitch: orientation.pitch,
    yaw: orientation.yaw,
    manualSos: !!req.body.manualSos,
  });

  const incident = await createPossibleAccident({
    vehicleId,
    latitude: lat,
    longitude: lng,
    summary: result.reasons.join('; '),
    countdownSeconds: req.body.countdownSeconds ?? undefined,
  });

  persistSensorEvent({
    vehicleId,
    acceleration,
    speed: speedAfter,
    roll: orientation.roll,
    pitch: orientation.pitch,
    yaw: orientation.yaw,
    eventType: result.eventType,
    latitude: lat,
    longitude: lng,
    source: 'SIMULATION',
  });

  res.status(201).json({ incident, detection: result });
});

// POST /api/incidents/:id/cancel — driver cancels the false alarm.
router.post('/:id/cancel', requireRole('ADMIN', 'OWNER', 'RESPONDER', 'CONTACT'), (req: AuthedRequest, res) => {
  const incident = getIncidentById(String(req.params.id));
  if (!incident) throw new AppError('Incident not found', 404);
  const updated = updateIncidentStatus(String(req.params.id), 'CANCELLED', 'Driver confirmed safe');
  res.json({ incident: updated });
});

// PATCH /api/incidents/:id — update status (responder flow, etc.)
router.patch('/:id', requireRole('ADMIN', 'RESPONDER', 'OWNER'), (req: AuthedRequest, res) => {
  const status = req.body.status as string;
  const valid = [
    'CONFIRMED_EMERGENCY',
    'DISPATCHED',
    'ON_SCENE',
    'RESOLVED',
    'CANCELLED',
    'FALSE_ALARM',
  ];
  if (!valid.includes(status)) {
    throw new AppError('Invalid incident status', 400);
  }
  const updated = updateIncidentStatus(String(req.params.id), status as never, req.body.note as string | undefined);
  res.json({ incident: updated });
});

export default router;

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import {
  acknowledgeNotification,
  getNotificationsForIncident,
  triggerNotifications,
} from '../services/notificationService.js';
import { getIncidentById } from '../services/incidentService.js';

const router = Router();
router.use(requireAuth);

// GET /api/notifications?incidentId=...
router.get('/', (req, res) => {
  const incidentId = req.query.incidentId as string | undefined;
  if (!incidentId) throw new AppError('incidentId query parameter is required', 400);
  const incident = getIncidentById(incidentId);
  if (!incident) throw new AppError('Incident not found', 404);
  res.json({ notifications: getNotificationsForIncident(incidentId) });
});

// POST /api/notifications/:id/acknowledge
router.post('/:id/acknowledge', (req, res) => {
  const existing = db
    .prepare('SELECT id FROM notifications WHERE id = ?')
    .get(String(req.params.id)) as { id: string } | undefined;
  if (!existing) throw new AppError('Notification not found', 404);
  acknowledgeNotification(String(req.params.id));
  res.json({ success: true });
});

// POST /api/notifications/trigger — manually re-run workflow for an incident.
router.post('/trigger', requireRole('ADMIN', 'RESPONDER'), async (req, res) => {
  const incidentId = (req.body.incidentId as string) || '';
  const incident = getIncidentById(incidentId);
  if (!incident) throw new AppError('Incident not found', 404);
  const notifications = await triggerNotifications(incidentId, incident.vehicleId);
  res.status(201).json({ notifications });
});

export default router;

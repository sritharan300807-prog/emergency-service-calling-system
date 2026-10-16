import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { getActiveIncidents } from '../services/incidentService.js';

const router = Router();
router.use(requireAuth);

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// GET /api/dashboard/stats
router.get('/stats', (req: AuthedRequest, res) => {
  const today = startOfToday();

  const totalVehicles = (db.prepare('SELECT COUNT(*) as c FROM vehicles').get() as { c: number }).c;
  const activeVehicles = (db
    .prepare("SELECT COUNT(*) as c FROM vehicles WHERE status = 'ACTIVE'")
    .get() as { c: number }).c;
  const todayIncidents = (db
    .prepare('SELECT COUNT(*) as c FROM incidents WHERE incident_time >= ?')
    .get(today) as { c: number }).c;
  const activeAlerts = getActiveIncidents().length;
  const resolvedIncidents = (db
    .prepare("SELECT COUNT(*) as c FROM incidents WHERE status IN ('RESOLVED','CANCELLED','FALSE_ALARM')")
    .get() as { c: number }).c;
  const totalIncidents = (db.prepare('SELECT COUNT(*) as c FROM incidents').get() as { c: number }).c;
  const totalContacts = (db.prepare('SELECT COUNT(*) as c FROM emergency_contacts').get() as { c: number }).c;
  const pendingNotifications = (db
    .prepare("SELECT COUNT(*) as c FROM notifications WHERE status = 'PENDING'")
    .get() as { c: number }).c;
  const registeredUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;

  const recentActivity = db
    .prepare(
      `SELECT i.id, i.status, i.severity, i.incident_time as incidentTime,
              v.registration_number as registrationNumber, v.vehicle_identifier as vehicleIdentifier,
              i.address, i.created_at as createdAt
       FROM incidents i JOIN vehicles v ON v.id = i.vehicle_id
       ORDER BY i.created_at DESC LIMIT 10`
    )
    .all();

  res.json({
    stats: {
      totalVehicles,
      activeVehicles,
      todayIncidents,
      activeAlerts,
      resolvedIncidents,
      totalIncidents,
      totalContacts,
      pendingNotifications,
      registeredUsers,
    },
    recentActivity,
    activeIncidents: getActiveIncidents(),
  });
});

export default router;

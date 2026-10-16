import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { reverseGeocode, updateVehicleLocation } from '../services/locationService.js';
import { validate, V } from '../validation.js';
import { publish } from '../events.js';

const router = Router();
router.use(requireAuth);

// GET /api/location/:vehicleId
router.get('/:vehicleId', async (req: AuthedRequest, res) => {
  const vehicle = db
    .prepare('SELECT id, owner_id as ownerId, latitude, longitude FROM vehicles WHERE id = ?')
    .get(String(req.params.vehicleId)) as
    | { id: string; ownerId: string; latitude: number | null; longitude: number | null }
    | undefined;
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  const accessible =
    req.user!.role === 'ADMIN' || req.user!.role === 'RESPONDER' || req.user!.id === vehicle.ownerId;
  if (!accessible) throw new AppError('You do not have access to this vehicle', 403);
  const address = vehicle.latitude != null ? await reverseGeocode(vehicle.latitude, vehicle.longitude) : null;
  res.json({
    latitude: vehicle.latitude,
    longitude: vehicle.longitude,
    address,
  });
});

// PUT /api/location/:vehicleId — accepts simulated or device location updates.
router.put(
  '/:vehicleId',
  requireRole('ADMIN', 'OWNER', 'RESPONDER'),
  (req: AuthedRequest, res) => {
    validate(req.body, { latitude: V.coordinate(), longitude: V.coordinate() });
    const vehicle = db
      .prepare('SELECT id, owner_id as ownerId FROM vehicles WHERE id = ?')
      .get(String(req.params.vehicleId)) as { id: string; ownerId: string } | undefined;
    if (!vehicle) throw new AppError('Vehicle not found', 404);
    const { latitude, longitude } = req.body as { latitude: number; longitude: number };
    updateVehicleLocation(String(req.params.vehicleId), latitude, longitude);
    publish('vehicle.location', {
      vehicleId: String(req.params.vehicleId),
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true, latitude, longitude });
  }
);

export default router;

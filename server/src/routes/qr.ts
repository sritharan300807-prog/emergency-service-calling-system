import { Router } from 'express';
import QRCode from 'qrcode';
import { db } from '../db.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { getActiveIncidentForVehicle } from '../services/incidentService.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/qr/:vehicleId
 * Returns a data-URL QR code encoding only the vehicle's secure QR identifier.
 * No sensitive personal data is embedded in the QR itself.
 */
router.get('/:vehicleId', async (req: AuthedRequest, res) => {
  const vehicle = db
    .prepare(
      'SELECT id, owner_id as ownerId, qr_identifier as qrIdentifier, registration_number as registrationNumber FROM vehicles WHERE id = ?'
    )
    .get(String(req.params.vehicleId)) as { id: string; ownerId: string; qrIdentifier: string; registrationNumber: string } | undefined;
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  const accessible =
    req.user!.role === 'ADMIN' || req.user!.role === 'RESPONDER' || req.user!.id === vehicle.ownerId;
  if (!accessible) throw new AppError('You do not have access to this vehicle', 403);

  const url = await QRCode.toDataURL(vehicle.qrIdentifier, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  });
  res.json({ qrDataUrl: url, qrIdentifier: vehicle.qrIdentifier });
});

/**
 * POST /api/qr/validate
 * Validates a scanned QR identifier and returns authorized vehicle info.
 * Sensitive info (owner phone, emergency contacts) is NOT exposed here.
 */
router.post('/validate', (req: AuthedRequest, res) => {
  const qrIdentifier = (req.body.qrData as string) || (req.body.qrIdentifier as string);
  if (!qrIdentifier) throw new AppError('QR data is required', 400);
  // Accept both raw identifier or encoded value.
  const token = qrIdentifier.trim();
  const vehicle = db
    .prepare(
      `SELECT v.id, v.vehicle_identifier as vehicleIdentifier,
              v.registration_number as registrationNumber,
              v.qr_identifier as qrIdentifier, v.make, v.model, v.year,
              v.status, v.latitude, v.longitude, u.name as ownerName,
              v.owner_id as ownerId
       FROM vehicles v JOIN users u ON u.id = v.owner_id
       WHERE v.qr_identifier = ?`
    )
    .get(token) as Record<string, unknown> | undefined;

  if (!vehicle) throw new AppError('Invalid or unrecognised QR code', 404);

  const incident = getActiveIncidentForVehicle(vehicle.id as string);

  // Role-based disclosure: only reveal owner contact details to privileged users.
  const isAdminLike = req.user!.role === 'ADMIN' || req.user!.role === 'RESPONDER';
  const isOwner = req.user!.id === (vehicle.ownerId as string);

  res.json({
    valid: true,
    vehicle: {
      id: vehicle.id,
      vehicleIdentifier: vehicle.vehicleIdentifier,
      registrationNumber: vehicle.registrationNumber,
      qrIdentifier: vehicle.qrIdentifier,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      status: vehicle.status,
      latitude: vehicle.latitude,
      longitude: vehicle.longitude,
      ownerName: vehicle.ownerName,
      hasActiveIncident: !!incident,
      activeIncident: incident
        ? { id: incident.id, status: incident.status, severity: incident.severity }
        : null,
      // Reveal owner contact only to authorised users.
      ownerContactVisible: isAdminLike || isOwner,
    },
  });
});

export default router;

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { validate, V } from '../validation.js';
import { uid } from '../events.js';

const router = Router();

const selectVehicle = `
  SELECT v.id, v.vehicle_identifier as vehicleIdentifier,
         v.registration_number as registrationNumber,
         v.owner_id as ownerId, u.name as ownerName,
         v.qr_identifier as qrIdentifier, v.make, v.model, v.year,
         v.status, v.latitude, v.longitude,
         v.location_updated_at as locationUpdatedAt, v.created_at as createdAt
  FROM vehicles v JOIN users u ON u.id = v.owner_id
`;

function getVehiclesForUser(user: AuthedRequest['user']): unknown[] {
  if (!user) return [];
  if (user.role === 'ADMIN' || user.role === 'RESPONDER') {
    return db.prepare(`${selectVehicle} ORDER BY v.created_at DESC`).all() as unknown[];
  }
  // OWNER or CONTACT see vehicles they own.
  return db
    .prepare(`${selectVehicle} WHERE v.owner_id = ? ORDER BY v.created_at DESC`)
    .all(user.id) as unknown[];
}

function canAccessVehicle(user: AuthedRequest['user'], vehicleId: string, ownerId: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.role === 'RESPONDER') return true;
  return user.id === ownerId;
}

router.use(requireAuth);

// GET /api/vehicles
router.get('/', (req: AuthedRequest, res) => {
  res.json({ vehicles: getVehiclesForUser(req.user) });
});

// POST /api/vehicles
router.post('/', requireRole('ADMIN', 'OWNER'), (req: AuthedRequest, res) => {
  validate(req.body, {
    vehicleIdentifier: V.string(100),
    registrationNumber: V.string(40),
    make: V.string(60),
    model: V.string(60),
    year: V.optionalNumber(),
    ownerId: V.string(100),
  });
  const { vehicleIdentifier, registrationNumber, make, model, year, ownerId } = req.body as {
    vehicleIdentifier: string;
    registrationNumber: string;
    make: string;
    model: string;
    year?: number;
    ownerId: string;
  };
  const now = new Date().toISOString();
  const id = uid();
  const qrIdentifier = `VEH:${id}:${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(
    `INSERT INTO vehicles
       (id, vehicle_identifier, registration_number, owner_id, qr_identifier,
        make, model, year, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`
  ).run(
    id,
    vehicleIdentifier.trim(),
    registrationNumber.trim(),
    ownerId,
    qrIdentifier,
    make,
    model,
    year ?? null,
    now
  );
  const row = db
    .prepare(`${selectVehicle} WHERE v.id = ?`)
    .get(id) as unknown;
  res.status(201).json({ vehicle: row });
});

// GET /api/vehicles/:id
router.get('/:id', (req: AuthedRequest, res) => {
  const row = db.prepare(`${selectVehicle} WHERE v.id = ?`).get(String(req.params.id)) as
    | { id: string; ownerId: string }
    | undefined;
  if (!row) throw new AppError('Vehicle not found', 404);
  if (!canAccessVehicle(req.user, row.id, row.ownerId)) {
    throw new AppError('You do not have access to this vehicle', 403);
  }
  res.json({ vehicle: row });
});

// PATCH /api/vehicles/:id
router.patch('/:id', requireRole('ADMIN', 'OWNER'), (req: AuthedRequest, res) => {
  const existing = db
    .prepare('SELECT id, owner_id as ownerId FROM vehicles WHERE id = ?')
    .get(String(req.params.id)) as { id: string; ownerId: string } | undefined;
  if (!existing) throw new AppError('Vehicle not found', 404);
  if (!canAccessVehicle(req.user, existing.id, existing.ownerId)) {
    throw new AppError('You do not have access to this vehicle', 403);
  }

  const allowed = [
    'registrationNumber',
    'make',
    'model',
    'year',
    'status',
    'vehicleIdentifier',
  ] as const;
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const colMap: Record<string, string> = {
        registrationNumber: 'registration_number',
        make: 'make',
        model: 'model',
        year: 'year',
        status: 'status',
        vehicleIdentifier: 'vehicle_identifier',
      };
      updates.push(`${colMap[key]} = ?`);
      params.push(req.body[key]);
    }
  }
  if (updates.length === 0) throw new AppError('No valid fields to update', 400);
  params.push(String(req.params.id));
  db.prepare(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const row = db.prepare(`${selectVehicle} WHERE v.id = ?`).get(String(req.params.id)) as unknown;
  res.json({ vehicle: row });
});

// DELETE /api/vehicles/:id
router.delete('/:id', requireRole('ADMIN'), (req: AuthedRequest, res) => {
  const existing = db
    .prepare('SELECT id, owner_id as ownerId FROM vehicles WHERE id = ?')
    .get(String(req.params.id)) as { id: string; ownerId: string } | undefined;
  if (!existing) throw new AppError('Vehicle not found', 404);
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(String(req.params.id));
  res.json({ success: true });
});

export default router;

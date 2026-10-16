import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { validate, V } from '../validation.js';
import { uid } from '../events.js';

const router = Router();

router.use(requireAuth);

function canManage(user: AuthedRequest['user'], vehicleId: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.role === 'RESPONDER') return true;
  const owner = db
    .prepare('SELECT owner_id as ownerId FROM vehicles WHERE id = ?')
    .get(vehicleId) as { ownerId: string } | undefined;
  return owner ? owner.ownerId === user.id : false;
}

function vehicleExists(id: string): boolean {
  return !!db.prepare('SELECT id FROM vehicles WHERE id = ?').get(id);
}

// GET /api/contacts?vehicleId=...
router.get('/', (req: AuthedRequest, res) => {
  const vehicleId = req.query.vehicleId as string | undefined;
  if (!vehicleId) {
    throw new AppError('vehicleId query parameter is required', 400);
  }
  if (!canManage(req.user, vehicleId)) {
    throw new AppError('You do not have access to these contacts', 403);
  }
  const rows = db
    .prepare(
      `SELECT id, vehicle_id as vehicleId, name, relationship,
              phone_number as phoneNumber, priority, created_at as createdAt
       FROM emergency_contacts WHERE vehicle_id = ? ORDER BY priority ASC`
    )
    .all(vehicleId);
  res.json({ contacts: rows });
});

// POST /api/contacts
router.post('/', requireRole('ADMIN', 'OWNER'), (req: AuthedRequest, res) => {
  validate(req.body, {
    vehicleId: V.string(100),
    name: V.string(120),
    relationship: V.string(60),
    phoneNumber: V.string(40),
    priority: V.optionalNumber(),
  });
  const { vehicleId, name, relationship, phoneNumber, priority } = req.body as {
    vehicleId: string;
    name: string;
    relationship: string;
    phoneNumber: string;
    priority?: number;
  };
  if (!vehicleExists(vehicleId)) throw new AppError('Vehicle not found', 404);
  if (!canManage(req.user, vehicleId)) {
    throw new AppError('You do not have access to this vehicle', 403);
  }
  const id = uid();
  db.prepare(
    `INSERT INTO emergency_contacts
       (id, vehicle_id, name, relationship, phone_number, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    vehicleId,
    name.trim(),
    relationship.trim(),
    phoneNumber.trim(),
    priority ?? 1,
    new Date().toISOString()
  );
  const row = db
    .prepare(
      `SELECT id, vehicle_id as vehicleId, name, relationship,
              phone_number as phoneNumber, priority, created_at as createdAt
       FROM emergency_contacts WHERE id = ?`
    )
    .get(id);
  res.status(201).json({ contact: row });
});

// PATCH /api/contacts/:id
router.patch('/:id', requireRole('ADMIN', 'OWNER'), (req: AuthedRequest, res) => {
  const existing = db
    .prepare('SELECT id, vehicle_id as vehicleId FROM emergency_contacts WHERE id = ?')
    .get(String(req.params.id)) as { id: string; vehicleId: string } | undefined;
  if (!existing) throw new AppError('Contact not found', 404);
  if (!canManage(req.user, existing.vehicleId)) {
    throw new AppError('You do not have access to this contact', 403);
  }
  const updates: string[] = [];
  const params: unknown[] = [];
  const map: Record<string, string> = {
    name: 'name',
    relationship: 'relationship',
    phoneNumber: 'phone_number',
    priority: 'priority',
    vehicleId: 'vehicle_id',
  };
  for (const [field, col] of Object.entries(map)) {
    if (req.body[field] !== undefined) {
      updates.push(`${col} = ?`);
      params.push(req.body[field]);
    }
  }
  if (updates.length === 0) throw new AppError('No valid fields to update', 400);
  params.push(String(req.params.id));
  db.prepare(`UPDATE emergency_contacts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const row = db
    .prepare(
      `SELECT id, vehicle_id as vehicleId, name, relationship,
              phone_number as phoneNumber, priority, created_at as createdAt
       FROM emergency_contacts WHERE id = ?`
    )
    .get(String(req.params.id));
  res.json({ contact: row });
});

// DELETE /api/contacts/:id
router.delete('/:id', requireRole('ADMIN', 'OWNER'), (req: AuthedRequest, res) => {
  const existing = db
    .prepare('SELECT id, vehicle_id as vehicleId FROM emergency_contacts WHERE id = ?')
    .get(String(req.params.id)) as { id: string; vehicleId: string } | undefined;
  if (!existing) throw new AppError('Contact not found', 404);
  if (!canManage(req.user, existing.vehicleId)) {
    throw new AppError('You do not have access to this contact', 403);
  }
  db.prepare('DELETE FROM emergency_contacts WHERE id = ?').run(String(req.params.id));
  res.json({ success: true });
});

export default router;

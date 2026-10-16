import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, requireRole, signToken, type AuthedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { validate, V } from '../validation.js';

const router = Router();

router.post('/login', (req, res) => {
  validate(req.body, { email: V.email(), password: V.string(200) });
  const { email, password } = req.body as { email: string; password: string };
  const user = db
    .prepare('SELECT id, name, email, phone, role, password_hash FROM users WHERE email = ?')
    .get(email.trim().toLowerCase()) as
    | { id: string; name: string; email: string; phone: string; role: string; password_hash: string }
    | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new AppError('Invalid email or password', 401);
  }
  const token = signToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as never,
  });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
  });
});

router.post('/logout', requireAuth, (_req, res) => {
  // JWT is stateless; logout is handled client side by discarding the token.
  res.json({ success: true });
});

router.get('/me', requireAuth, (req: AuthedRequest, res) => {
  const row = db
    .prepare('SELECT id, name, email, phone, role, created_at as createdAt FROM users WHERE id = ?')
    .get(req.user!.id);
  res.json({ user: row });
});

// List users (admin) — used for owner selection when registering vehicles.
router.get('/users', requireRole('ADMIN'), (_req, res) => {
  const rows = db
    .prepare('SELECT id, name, email, phone, role, created_at as createdAt FROM users ORDER BY name')
    .all();
  res.json({ users: rows });
});

export default router;

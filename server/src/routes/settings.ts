import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { getSettings, saveSettings } from '../services/incidentService.js';

const router = Router();

// GET /api/settings — application & simulation settings.
router.get('/', requireRole('ADMIN', 'OWNER', 'RESPONDER'), (_req, res) => {
  res.json({ settings: getSettings() });
});

// PUT /api/settings — update settings (admin).
router.put('/', requireRole('ADMIN'), (req, res) => {
  const settings = saveSettings(req.body || {});
  res.json({ settings });
});

export default router;

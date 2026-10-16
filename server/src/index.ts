import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Request, Response } from 'express';
import { config } from './config.js';
import { initializeDb } from './db.js';
import { subscribe } from './events.js';
import { errorHandler } from './middleware/error.js';
import { seedIfEmpty } from './seed.js';
import authRoutes from './routes/auth.js';
import vehicleRoutes from './routes/vehicles.js';
import contactRoutes from './routes/contacts.js';
import incidentRoutes from './routes/incidents.js';
import locationRoutes from './routes/location.js';
import qrRoutes from './routes/qr.js';
import notificationRoutes from './routes/notifications.js';
import iotRoutes from './routes/iot.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientDist = join(__dirname, '../../client/dist');

initializeDb();
seedIfEmpty();

const app = express();
const server = createServer(app);

app.use(
  cors({
    origin: config.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

// --- Real-time events via Server-Sent Events ---
app.get('/api/events', (_req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  const send = (event: string, payload: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  const unsubscribe = subscribe((event, payload) => send(event, payload));
  // Keep the connection alive.
  const keepAlive = setInterval(() => res.write(`: ping\n\n`), 15000);

  _req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: config.app.simulationMode ? 'SIMULATION' : 'LIVE', time: new Date().toISOString() });
});

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/iot', iotRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);

// --- Serve the built React client (production build) ---
app.use(express.static(clientDist));

// SPA catch-all: any non-API GET request returns index.html
// so React Router handles the route client-side.
app.get('/{*splat}', (_req: Request, res: Response) => {
  res.sendFile(join(clientDist, 'index.html'));
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler as never);

server.listen(config.port, () => {
  console.log(`\nEmergency Calling System API running:`);
  console.log(`  http://localhost:${config.port}`);
  console.log(`  Simulation mode: ${config.app.simulationMode ? 'ON (demo)' : 'OFF'}\n`);
});

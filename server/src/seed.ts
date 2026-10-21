import bcrypt from 'bcryptjs';
import { db, initializeDb, setSetting } from './db.js';
import { uid } from './events.js';
import { config } from './config.js';
import { pathToFileURL } from 'node:url';

// Demo credential
const DEMO_EMAIL = 'admin@emergency.local';
const DEMO_PASSWORD = 'Admin@123';

function hash(pw: string): string {
  return bcrypt.hashSync(pw, 10);
}

/** Seeds demo data when the users table is empty. Safe to call on every boot. */
export function seedIfEmpty(): void {
  initializeDb();
  const now = new Date().toISOString();

  const users = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  if (users.c > 0) {
    console.log('Database already seeded. Skipping.');
    console.log(`Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    return;
  }

  // Roles: one of OWNER | CONTACT | ADMIN | RESPONDER
  const ownerId = uid();
  const contactId = uid();
  const adminId = uid();
  const responderId = uid();

  const insertUser = db.prepare(
    `INSERT INTO users (id, name, email, phone, role, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  insertUser.run(ownerId, 'Aarav Sharma', 'aarav@example.com', '+91 98765 43210', 'OWNER', hash('Owner@123'), now);
  insertUser.run(contactId, 'Priya Sharma', 'priya@example.com', '+91 91234 56789', 'CONTACT', hash('Contact@123'), now);
  insertUser.run(adminId, 'System Administrator', DEMO_EMAIL, '+91 90000 00001', 'ADMIN', hash(DEMO_PASSWORD), now);
  insertUser.run(responderId, 'Emergency Responder', 'responder@emergency.local', '+91 90000 00002', 'RESPONDER', hash('Responder@123'), now);

  // Vehicle
  const vehicleId = 'veh-001';
  const qrIdentifier = `VEH:${vehicleId}:${uid().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO vehicles
       (id, vehicle_identifier, registration_number, owner_id, qr_identifier,
        make, model, year, status, latitude, longitude, location_updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 13.0827, 80.2707, ?, ?)`
  ).run(
    vehicleId,
    vehicleId,
    'TN 10 AB 1234',
    ownerId,
    qrIdentifier,
    'Hyundai',
    'Creta',
    2023,
    now,
    now
  );

  // Emergency contacts for the vehicle
  const insertContact = db.prepare(
    `INSERT INTO emergency_contacts (id, vehicle_id, name, relationship, phone_number, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insertContact.run(uid(), vehicleId, 'Priya Sharma', 'Spouse', '+91 91234 56789', 1, now);
  insertContact.run(uid(), vehicleId, 'Rahul Sharma', 'Brother', '+91 99887 76655', 2, now);
  insertContact.run(uid(), vehicleId, 'Meera Sharma', 'Mother', '+91 98998 87766', 3, now);
  // The three real emergency numbers configured for this deployment.
  insertContact.run(uid(), vehicleId, 'Primary Emergency', 'Primary', '+917358991015', 4, now);
  insertContact.run(uid(), vehicleId, 'Emergency Contact 2', 'Secondary', '+918248319996', 5, now);
  insertContact.run(uid(), vehicleId, 'Emergency Contact 3', 'Tertiary', '+918754932145', 6, now);

  // Default system setting (matches config default).
  setSetting('falseAlarmCountdownSeconds', String(config.app.defaultCountdownSeconds));
  setSetting('simulationMode', 'true');
  setSetting('mockNotifications', 'true');

  console.log('Seed complete.');
  console.log(`  Vehicle ID:        ${vehicleId}`);
  console.log(`  Registration:      TN 10 AB 1234`);
  console.log(`  QR identifier:     ${qrIdentifier}`);
  console.log(`  Demo Owners:       aarav@example.com / Owner@123`);
  console.log(`  Admin:             ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Responder:         responder@emergency.local / Responder@123`);
}

// Run when executed directly (npm run seed / npx tsx src/seed.ts).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  seedIfEmpty();
}

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const dbPath = path.isAbsolute(config.dbFile)
  ? config.dbFile
  : path.join(serverRoot, config.dbFile);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      phone         TEXT,
      role          TEXT NOT NULL CHECK (role IN ('OWNER','CONTACT','ADMIN','RESPONDER')),
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id                 TEXT PRIMARY KEY,
      vehicle_identifier TEXT UNIQUE NOT NULL,
      registration_number TEXT NOT NULL,
      owner_id           TEXT NOT NULL REFERENCES users(id),
      qr_identifier      TEXT UNIQUE NOT NULL,
      make               TEXT,
      model              TEXT,
      year               INTEGER,
      status             TEXT NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE','INACTIVE','MAINTENANCE')),
      latitude           REAL,
      longitude          REAL,
      location_updated_at TEXT,
      created_at         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emergency_contacts (
      id           TEXT PRIMARY KEY,
      vehicle_id   TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      relationship TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      priority     INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id            TEXT PRIMARY KEY,
      vehicle_id    TEXT NOT NULL REFERENCES vehicles(id),
      incident_time TEXT NOT NULL,
      latitude      REAL,
      longitude     REAL,
      address       TEXT,
      severity      TEXT NOT NULL DEFAULT 'MODERATE'
                    CHECK (severity IN ('LOW','MODERATE','SEVERE','CRITICAL')),
      status        TEXT NOT NULL DEFAULT 'POSSIBLE_ACCIDENT'
                    CHECK (status IN (
                      'POSSIBLE_ACCIDENT','CONFIRMED_EMERGENCY','CANCELLED',
                      'DISPATCHED','ON_SCENE','RESOLVED','FALSE_ALARM'
                    )),
      summary       TEXT,
      countdown_seconds INTEGER,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sensor_events (
      id          TEXT PRIMARY KEY,
      vehicle_id  TEXT NOT NULL REFERENCES vehicles(id),
      acceleration REAL,
      speed       REAL,
      roll        REAL,
      pitch       REAL,
      yaw         REAL,
      event_type  TEXT NOT NULL
                  CHECK (event_type IN (
                    'NORMAL','SUSPICIOUS_EVENT','POSSIBLE_ACCIDENT','CONFIRMED_EMERGENCY'
                  )),
      latitude    REAL,
      longitude   REAL,
      source      TEXT NOT NULL DEFAULT 'SIMULATION',
      timestamp   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id                TEXT PRIMARY KEY,
      incident_id       TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      contact_id        TEXT REFERENCES emergency_contacts(id),
      recipient         TEXT NOT NULL,
      notification_type TEXT NOT NULL CHECK (notification_type IN ('SMS','APP_PUSH','VOICE_CALL')),
      status            TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','SENT','DELIVERED','FAILED','ACKNOWLEDGED')),
      channel           TEXT NOT NULL DEFAULT 'DEMO',
      message           TEXT,
      sent_at           TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vehicle_owner ON vehicles(owner_id);
    CREATE INDEX IF NOT EXISTS idx_contact_vehicle ON emergency_contacts(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_incident_vehicle ON incidents(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_incident_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incident_time ON incidents(incident_time);
    CREATE INDEX IF NOT EXISTS idx_sensor_vehicle ON sensor_events(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_notification_incident ON notifications(incident_id);
  `);

  runMigrations();
}

/**
 * Additive, idempotent migrations. Each statement is guarded so it can run
 * against an existing database without losing data.
 */
function runMigrations(): void {
  const columns = db
    .prepare('PRAGMA table_info(notifications)')
    .all() as { name: string }[];
  const has = (name: string) => columns.some((c) => c.name === name);

  // REAL call tracking columns (added for Twilio outbound-call support).
  if (!has('call_sid')) db.exec('ALTER TABLE notifications ADD COLUMN call_sid TEXT');
  if (!has('call_status'))
    db.exec("ALTER TABLE notifications ADD COLUMN call_status TEXT DEFAULT 'NONE'");
  if (!has('attempts'))
    db.exec('ALTER TABLE notifications ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0');
  if (!has('updated_at')) db.exec('ALTER TABLE notifications ADD COLUMN updated_at TEXT');

  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_notification_call_sid ON notifications(call_sid)'
  );
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? (row as { value: string }).value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

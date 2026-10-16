import { db, getSetting, setSetting } from '../db.js';
import { publish, uid } from '../events.js';
import { reverseGeocode } from './locationService.js';
import { triggerNotifications } from './notificationService.js';
import { config } from '../config.js';
import type { IncidentStatus, IncidentWithVehicle, Severity } from '../types.js';

interface IncidentRow {
  id: string;
  vehicle_id: string;
  incident_time: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  severity: Severity;
  status: IncidentStatus;
  summary: string | null;
  countdown_seconds: number | null;
  created_at: string;
  updated_at: string;
}

const VEHICLE_SELECT = `
  SELECT i.id, i.vehicle_id as vehicleId, v.vehicle_identifier as vehicleIdentifier,
         v.registration_number as registrationNumber, u.name as ownerName,
         i.incident_time as incidentTime, i.latitude, i.longitude, i.address,
         i.severity, i.status, i.summary, i.countdown_seconds as countdownSeconds,
         i.created_at as createdAt, i.updated_at as updatedAt
  FROM incidents i
  JOIN vehicles v ON v.id = i.vehicle_id
  JOIN users u ON u.id = v.owner_id
`;

function mapIncident(row: Record<string, unknown>): IncidentWithVehicle {
  return {
    id: row.id as string,
    vehicleId: row.vehicleId as string,
    vehicleIdentifier: row.vehicleIdentifier as string,
    registrationNumber: row.registrationNumber as string,
    ownerName: row.ownerName as string,
    incidentTime: row.incidentTime as string,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    address: (row.address as string | null) ?? null,
    severity: row.severity as Severity,
    status: row.status as IncidentStatus,
    summary: (row.summary as string | null) ?? null,
    countdownSeconds: (row.countdown_seconds as number | null) ?? null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

export function getActiveIncidentForVehicle(vehicleId: string): IncidentWithVehicle | null {
  const row = db
    .prepare(
      `${VEHICLE_SELECT}
       WHERE i.vehicle_id = ? AND i.status IN ('POSSIBLE_ACCIDENT','CONFIRMED_EMERGENCY','DISPATCHED','ON_SCENE')
       ORDER BY i.created_at DESC LIMIT 1`
    )
    .get(vehicleId) as Record<string, unknown> | undefined;
  return row ? mapIncident(row) : null;
}

export function getActiveIncidents(): IncidentWithVehicle[] {
  const rows = db
    .prepare(
      `${VEHICLE_SELECT}
       WHERE i.status IN ('POSSIBLE_ACCIDENT','CONFIRMED_EMERGENCY','DISPATCHED','ON_SCENE')
       ORDER BY i.created_at DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapIncident);
}

export function getIncidentById(id: string): IncidentWithVehicle | null {
  const row = db
    .prepare(`${VEHICLE_SELECT} WHERE i.id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapIncident(row) : null;
}

export function getIncidentHistory(options: {
  status?: string;
  severity?: string;
  vehicleId?: string;
  search?: string;
  limit?: number;
}): { incidents: IncidentWithVehicle[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    where.push('i.status = ?');
    params.push(options.status);
  }
  if (options.severity) {
    where.push('i.severity = ?');
    params.push(options.severity);
  }
  if (options.vehicleId) {
    where.push('i.vehicle_id = ?');
    params.push(options.vehicleId);
  }
  if (options.search) {
    where.push(
      `(i.id LIKE ? OR v.registration_number LIKE ? OR v.vehicle_identifier LIKE ? OR i.address LIKE ?)`
    );
    const term = `%${options.search}%`;
    params.push(term, term, term, term);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(options.limit || 100, 500);

  const total = (db
    .prepare(
      `SELECT COUNT(*) as c FROM incidents i
       JOIN vehicles v ON v.id = i.vehicle_id
       ${whereSql}`
    )
    .get(...params) as { c: number }).c;

  const rows = db
    .prepare(
      `${VEHICLE_SELECT} ${whereSql}
       ORDER BY i.created_at DESC LIMIT ?`
    )
    .all(...params, limit) as Record<string, unknown>[];

  return { incidents: rows.map(mapIncident), total };
}

/**
 * Create a POSSIBLE_ACCIDENT incident, resolve the address, start the
 * false-alarm countdown, and return the incident.
 */
export async function createPossibleAccident(input: {
  vehicleId: string;
  severity?: Severity;
  latitude?: number | null;
  longitude?: number | null;
  summary?: string;
  countdownSeconds?: number;
}): Promise<IncidentWithVehicle> {
  const now = new Date().toISOString();
  const id = uid();
  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;
  const severity = input.severity ?? inferSeverity(input.summary);
  const countdown = Math.max(
    config.app.minCountdownSeconds,
    Math.min(input.countdownSeconds ?? getCountdownSetting(), config.app.maxCountdownSeconds)
  );

  let address: string | null = null;
  try {
    address = await reverseGeocode(latitude, longitude);
  } catch {
    address = null;
  }

  db.prepare(
    `INSERT INTO incidents
       (id, vehicle_id, incident_time, latitude, longitude, address, severity,
        status, summary, countdown_seconds, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'POSSIBLE_ACCIDENT', ?, ?, ?, ?)`
  ).run(
    id,
    input.vehicleId,
    now,
    latitude,
    longitude,
    address,
    severity,
    input.summary ?? null,
    countdown,
    now,
    now
  );

  const incident = getIncidentById(id)!;
  publish('incident.possible', incident);
  startCountdown(id, incident.vehicleId, countdown);
  return incident;
}

function inferSeverity(summary?: string): Severity {
  if (!summary) return 'MODERATE';
  const s = summary.toLowerCase();
  if (s.includes('rollover') || s.includes('sos')) return 'CRITICAL';
  if (s.includes('impact') && /[0-9]([.,][0-9])?\s*g/.test(s)) return 'SEVERE';
  return 'MODERATE';
}

// In-memory countdown timers keyed by incident id.
const countdownTimers = new Map<string, NodeJS.Timeout>();

function getCountdownSetting(): number {
  const raw = getSetting('falseAlarmCountdownSeconds');
  const n = raw ? Number(raw) : config.app.defaultCountdownSeconds;
  return Number.isFinite(n) && n > 0 ? n : config.app.defaultCountdownSeconds;
}

export function startCountdown(
  incidentId: string,
  vehicleId: string,
  seconds: number
): void {
  stopCountdown(incidentId);
  const endAt = Date.now() + seconds * 1000;
  publish('incident.countdown', { incidentId, remainingSeconds: seconds, endAt });
  const timer = setInterval(() => {
    const remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    if (remaining <= 0) {
      stopCountdown(incidentId);
      // Re-evaluate the incident status: only auto-confirm if still possible.
      const incident = getIncidentById(incidentId);
      if (incident && incident.status === 'POSSIBLE_ACCIDENT') {
        confirmEmergency(incidentId);
      }
      return;
    }
    publish('incident.countdown', { incidentId, remainingSeconds: remaining, endAt });
  }, 1000);
  countdownTimers.set(incidentId, timer);
}

export function stopCountdown(incidentId: string): void {
  const timer = countdownTimers.get(incidentId);
  if (timer) {
    clearInterval(timer);
    countdownTimers.delete(incidentId);
  }
}

function updateStatus(id: string, status: IncidentStatus): void {
  db.prepare(
    `UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?`
  ).run(status, new Date().toISOString(), id);
}

export async function confirmEmergency(incidentId: string): Promise<IncidentWithVehicle> {
  const incident = getIncidentById(incidentId);
  if (!incident) throw new Error('Incident not found');
  if (incident.status !== 'POSSIBLE_ACCIDENT') return incident;

  stopCountdown(incidentId);
  updateStatus(incidentId, 'CONFIRMED_EMERGENCY');
  db.prepare('UPDATE incidents SET countdown_seconds = 0 WHERE id = ?').run(incidentId);

  const updated = getIncidentById(incidentId)!;
  publish('incident.confirmed', updated);

  // Trigger the emergency notification workflow (demo by default).
  await triggerNotifications(incidentId, incident.vehicleId);
  return updated;
}

export function cancelFalseAlarm(
  incidentId: string,
  reason = 'Driver confirmed safe'
): IncidentWithVehicle {
  const incident = getIncidentById(incidentId);
  if (!incident) throw new Error('Incident not found');
  stopCountdown(incidentId);
  updateStatus(incidentId, 'CANCELLED');
  db.prepare(
    'UPDATE incidents SET countdown_seconds = 0, summary = ? WHERE id = ?'
  ).run(reason, incidentId);
  const updated = getIncidentById(incidentId)!;
  publish('incident.cancelled', updated);
  return updated;
}

export function markFalseAlarm(incidentId: string, reason = ''): IncidentWithVehicle {
  const incident = getIncidentById(incidentId);
  if (!incident) throw new Error('Incident not found');
  stopCountdown(incidentId);
  updateStatus(incidentId, 'FALSE_ALARM');
  db.prepare('UPDATE incidents SET countdown_seconds = 0, summary = COALESCE(?, summary) WHERE id = ?').run(
    reason || null,
    incidentId
  );
  const updated = getIncidentById(incidentId)!;
  publish('incident.updated', updated);
  return updated;
}

export function updateIncidentStatus(
  incidentId: string,
  status: IncidentStatus,
  note?: string
): IncidentWithVehicle {
  const incident = getIncidentById(incidentId);
  if (!incident) throw new Error('Incident not found');
  if (status === 'CONFIRMED_EMERGENCY') {
    return confirmEmergency(incidentId) as unknown as IncidentWithVehicle;
  }
  if (status === 'CANCELLED') {
    return cancelFalseAlarm(incidentId);
  }
  if (status === 'FALSE_ALARM') {
    return markFalseAlarm(incidentId, note);
  }
  stopCountdown(incidentId);
  updateStatus(incidentId, status);
  if (note) {
    db.prepare('UPDATE incidents SET summary = ? WHERE id = ?').run(note, incidentId);
  }
  const updated = getIncidentById(incidentId)!;
  publish('incident.updated', updated);
  return updated;
}

export function getSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function saveSettings(patch: Record<string, unknown>): Record<string, string> {
  if (patch.falseAlarmCountdownSeconds != null) {
    const n = Number(patch.falseAlarmCountdownSeconds);
    if (Number.isFinite(n)) {
      const clamped = Math.max(
        config.app.minCountdownSeconds,
        Math.min(n, config.app.maxCountdownSeconds)
      );
      setSetting('falseAlarmCountdownSeconds', String(clamped));
    }
  }
  if (typeof patch.simulationMode === 'boolean') {
    setSetting('simulationMode', String(patch.simulationMode));
  }
  if (typeof patch.mockNotifications === 'boolean') {
    setSetting('mockNotifications', String(patch.mockNotifications));
  }
  if (typeof patch.autoResolve === 'boolean') {
    setSetting('autoResolve', String(patch.autoResolve));
  }
  return getSettings();
}

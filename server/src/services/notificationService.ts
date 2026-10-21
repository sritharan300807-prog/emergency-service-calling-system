import { db } from '../db.js';
import { config } from '../config.js';
import { publish, uid } from '../events.js';
import {
  isTwilioConfigured,
  placeEmergencyCalls,
  type CallOutcome,
} from './callService.js';
import type {
  CallStatus,
  NotificationStatus,
  NotificationType,
} from '../types.js';

const TYPES: NotificationType[] = ['SMS', 'APP_PUSH', 'VOICE_CALL'];

export interface ContactRow {
  id: string;
  name: string;
  relationship: string;
  phone_number: string;
  priority: number;
}

export interface NotificationRow {
  id: string;
  incidentId: string;
  contactId: string | null;
  recipient: string;
  notificationType: NotificationType;
  status: NotificationStatus;
  channel: string;
  message: string | null;
  sentAt: string | null;
  callSid: string | null;
  callStatus: CallStatus;
  attempts: number;
}

export function asNotif(row: Record<string, unknown>): NotificationRow {
  return {
    id: row.id as string,
    incidentId: row.incident_id as string,
    contactId: (row.contact_id as string) ?? null,
    recipient: row.recipient as string,
    notificationType: row.notification_type as NotificationType,
    status: row.status as NotificationStatus,
    channel: row.channel as string,
    message: (row.message as string) ?? null,
    sentAt: (row.sent_at as string) ?? null,
    callSid: (row.call_sid as string) ?? null,
    callStatus: ((row.call_status as string) ?? 'NONE') as CallStatus,
    attempts: (row.attempts as number) ?? 0,
  };
}

export function getContactsForVehicle(vehicleId: string): ContactRow[] {
  return db
    .prepare(
      `SELECT id, name, relationship, phone_number, priority
       FROM emergency_contacts WHERE vehicle_id = ?
       ORDER BY priority ASC`
    )
    .all(vehicleId) as unknown as ContactRow[];
}

export function getNotificationsForIncident(incidentId: string): NotificationRow[] {
  const rows = db
    .prepare(
      `SELECT n.id, n.incident_id, n.contact_id, n.recipient, n.notification_type,
              n.status, n.channel, n.message, n.sent_at,
              n.call_sid, n.call_status, n.attempts
       FROM notifications n
       LEFT JOIN emergency_contacts c ON c.id = n.contact_id
       WHERE n.incident_id = ?
       ORDER BY COALESCE(c.priority, 1) ASC, n.rowid ASC`
    )
    .all(incidentId);
  return (rows as Record<string, unknown>[]).map(asNotif);
}

/** True if a real call has already been (or is being) placed for this incident. */
function incidentHasActiveRealCall(incidentId: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM notifications
       WHERE incident_id = ? AND notification_type = 'VOICE_CALL'
         AND channel = 'TWILIO' AND call_status NOT IN ('FAILED','CANCELED','NONE')`
    )
    .get(incidentId) as { c: number };
  return row.c > 0;
}

/**
 * Trigger the emergency notification workflow for a confirmed incident.
 *
 * - Real voice calls are placed CONCURRENTLY to every configured emergency
 *   contact (the vehicle's contacts, plus the numbers in EMERGENCY_CONTACTS).
 * - Duplicate calls for the same incident are prevented (dedup guard).
 * - Failed calls are retried per the configurable retry policy.
 * - SMS/APP_PUSH remain clearly-labelled simulated records (no gateway set).
 *
 * When Twilio is NOT configured, VOICE_CALL entries are simulated (DEMO) and
 * clearly marked, so nothing pretends to be a real call.
 */
export async function triggerNotifications(
  incidentId: string,
  vehicleId: string
): Promise<NotificationRow[]> {
  publish('notification.workflow.start', { incidentId, vehicleId });
  const contacts = getContactsForVehicle(vehicleId);
  const realCall = isTwilioConfigured();

  // Dedup: if a real call already exists for this incident, do not re-dial.
  const alreadyCalled = realCall && incidentHasActiveRealCall(incidentId);

  const created: NotificationRow[] = [];

  // 1) Simulated SMS / APP_PUSH records (one per contact), plus a VOICE_CALL
  //    record reserved when real calling is disabled.
  for (const contact of contacts) {
    for (const type of TYPES) {
      if (type === 'VOICE_CALL' && realCall) continue; // handled below
      const id = uid();
      const channel = 'DEMO';
      const message = buildDemoMessage(contact, type);
      insertNotification({
        id,
        incidentId,
        contactId: contact.id,
        recipient: contact.name,
        type,
        channel,
        message,
      });
      created.push(asNotif(readNotif(id)!));
      scheduleDemoDelivery(id, contact.name, type);
    }
  }

  // 2) REAL concurrent calls to every emergency contact number.
  if (realCall) {
    const incident = db
      .prepare('SELECT latitude, longitude, address FROM incidents WHERE id = ?')
      .get(incidentId) as
      | { latitude: number | null; longitude: number | null; address: string | null }
      | undefined;

    // Collect unique E.164 numbers: the vehicle's contacts + configured global
    // emergency contacts. Contact phones may be non-E.164 (e.g. "+91 98765 43210")
    // so validate inside callService.
    const numbers = new Set<string>();
    for (const c of contacts) if (c.phone_number) numbers.add(c.phone_number.trim());
    for (const n of config.emergencyContacts) numbers.add(n);
    const targets = [...numbers];

    if (!alreadyCalled) {
      // Reserve one notification row per target number so the dashboard shows
      // every outgoing call and its live status.
      const rows = targets.map((to) => {
        const id = uid();
        insertNotification({
          id,
          incidentId,
          contactId: null,
          recipient: to,
          type: 'VOICE_CALL',
          channel: 'TWILIO',
          message: buildRealCallRecordMessage(
            incident?.latitude ?? null,
            incident?.longitude ?? null,
            config.calls.testMode
          ),
          callStatus: 'QUEUED',
        });
        const row = asNotif(readNotif(id)!);
        created.push(row);
        return { id, to };
      });

      launchCallsWithRetry(
        rows,
        {
          latitude: incident?.latitude ?? null,
          longitude: incident?.longitude ?? null,
          address: incident?.address ?? null,
          incidentId,
          testMode: config.calls.testMode,
        },
        0
      );
    }
  }

  return created;
}

interface CallTarget {
  id: string;
  to: string;
}

/**
 * Places all calls concurrently, then retries any that failed — up to
 * config.calls.maxRetries additional attempts, spaced by retryDelayMs.
 */
function launchCallsWithRetry(
  targets: CallTarget[],
  base: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    incidentId: string;
    testMode: boolean;
  },
  attempt: number
): void {
  const numbers = targets.map((t) => t.to);
  const byNumber = new Map(targets.map((t) => [t.to, t.id]));

  publish('notification.calls.dispatching', {
    incidentId: base.incidentId,
    numbers,
    attempt: attempt + 1,
    testMode: base.testMode,
  });

  // Mark all as INITIATED and bump attempt count before dialing.
  for (const t of targets) {
    db.prepare(
      `UPDATE notifications SET call_status = 'INITIATED', attempts = attempts + 1,
         updated_at = ? WHERE id = ?`
    ).run(new Date().toISOString(), t.id);
    publishCallStatus(t.id);
  }

  placeEmergencyCalls(numbers, base)
    .then((outcomes) => {
      const failed: CallTarget[] = [];
      outcomes.forEach((outcome) => {
        const number = outcome.to || '';
        const id = byNumber.get(number);
        if (!id) return;
        applyCallOutcome(id, outcome);
        if (outcome.error) failed.push({ id, to: number });
      });

      if (failed.length > 0 && attempt < config.calls.maxRetries) {
        console.log(
          `[notificationService] Retrying ${failed.length} failed call(s) ` +
            `(attempt ${attempt + 2}/${config.calls.maxRetries + 1}) in ${config.calls.retryDelayMs}ms`
        );
        setTimeout(
          () => launchCallsWithRetry(failed, base, attempt + 1),
          config.calls.retryDelayMs
        );
      }
    })
    .catch((err) => {
      console.error(`[notificationService] Call dispatch error: ${(err as Error).message}`);
    });
}

/** Applies a single Twilio call outcome to its notification row. */
function applyCallOutcome(id: string, outcome: CallOutcome): void {
  const callStatus = mapTwilioStatus(outcome.status, !!outcome.error);
  const status: NotificationStatus = outcome.error ? 'FAILED' : 'SENT';
  db.prepare(
    `UPDATE notifications
       SET call_sid = COALESCE(?, call_sid),
           call_status = ?,
           status = ?,
           sent_at = COALESCE(sent_at, ?),
           message = CASE WHEN ? IS NULL THEN message ELSE ? END,
           updated_at = ?
     WHERE id = ?`
  ).run(
    outcome.callSid ?? null,
    callStatus,
    outcome.error ? 'FAILED' : status,
    outcome.error ? null : new Date().toISOString(),
    outcome.error ?? null,
    outcome.error ? `[CALL FAILED] ${outcome.error}` : null,
    new Date().toISOString(),
    id
  );
  publishCallStatus(id);
}

/** Maps a Twilio call status string to our CallStatus enum. */
export function mapTwilioStatus(
  twilioStatus: string | undefined,
  errored: boolean
): CallStatus {
  if (errored) return 'FAILED';
  switch ((twilioStatus || '').toLowerCase()) {
    case 'queued':
      return 'QUEUED';
    case 'initiated':
      return 'INITIATED';
    case 'ringing':
      return 'RINGING';
    case 'in-progress':
      return 'ANSWERED';
    case 'completed':
      return 'COMPLETED';
    case 'busy':
      return 'BUSY';
    case 'no-answer':
      return 'NO_ANSWER';
    case 'failed':
      return 'FAILED';
    case 'canceled':
      return 'CANCELED';
    default:
      return 'INITIATED';
  }
}

/** Called by the Twilio status webhook. Updates the row matched by call SID. */
export function updateCallStatusBySid(
  callSid: string,
  twilioStatus: string
): NotificationRow | null {
  const row = db
    .prepare('SELECT id FROM notifications WHERE call_sid = ?')
    .get(callSid) as { id: string } | undefined;
  if (!row) return null;

  const callStatus = mapTwilioStatus(twilioStatus, false);
  const terminal: CallStatus[] = ['COMPLETED', 'FAILED', 'BUSY', 'NO_ANSWER', 'CANCELED'];
  const notifStatus: NotificationStatus =
    callStatus === 'COMPLETED'
      ? 'DELIVERED'
      : callStatus === 'ANSWERED'
        ? 'DELIVERED'
        : terminal.includes(callStatus)
          ? 'FAILED'
          : 'SENT';

  db.prepare(
    `UPDATE notifications SET call_status = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(callStatus, notifStatus, new Date().toISOString(), row.id);
  publishCallStatus(row.id);
  return asNotif(readNotif(row.id)!);
}

function publishCallStatus(id: string): void {
  const row = readNotif(id);
  if (!row) return;
  publish('notification.updated', {
    id: row.id,
    incidentId: row.incident_id,
    type: row.notification_type,
    recipient: row.recipient,
    status: row.status,
    channel: row.channel,
    callSid: row.call_sid,
    callStatus: row.call_status,
    attempts: row.attempts,
  });
}

function readNotif(id: string): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
}

function insertNotification(input: {
  id: string;
  incidentId: string;
  contactId: string | null;
  recipient: string;
  type: NotificationType;
  channel: string;
  message: string;
  callStatus?: CallStatus;
}): void {
  db.prepare(
    `INSERT INTO notifications
       (id, incident_id, contact_id, recipient, notification_type, status,
        channel, message, call_status, updated_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`
  ).run(
    input.id,
    input.incidentId,
    input.contactId,
    input.recipient,
    input.type,
    input.channel,
    input.message,
    input.callStatus ?? 'NONE',
    new Date().toISOString()
  );
}

function buildDemoMessage(contact: ContactRow, type: NotificationType): string {
  const base = `EMERGENCY ALERT: A vehicle associated with your contact "${contact.name}" has been involved in a possible accident. Please respond.`;
  switch (type) {
    case 'SMS':
      return `[DEMO SMS — not sent] ${base}`;
    case 'VOICE_CALL':
      return `[DEMO VOICE CALL — not dialed] ${base}`;
    default:
      return `[DEMO APP PUSH — not sent] ${base}`;
  }
}

function buildRealCallRecordMessage(
  latitude: number | null,
  longitude: number | null,
  testMode: boolean
): string {
  const prefix = testMode ? '[TEST MODE] ' : '[CRITICAL] ';
  if (latitude == null || longitude == null) {
    return `${prefix}Real emergency voice call — location unavailable (no GPS)`;
  }
  return `${prefix}Real emergency voice call — accident at ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function scheduleDemoDelivery(id: string, recipient: string, type: NotificationType): void {
  const delay =
    config.app.mockNotificationDeliveryMs * (type === 'SMS' ? 1 : type === 'APP_PUSH' ? 2 : 3);
  setTimeout(() => {
    try {
      const row = db.prepare('SELECT status FROM notifications WHERE id = ?').get(id) as
        | { status: NotificationStatus }
        | undefined;
      if (!row) return;
      const finalStatus: NotificationStatus =
        row.status === 'FAILED' ? 'FAILED' : Math.random() < 0.12 ? 'FAILED' : 'DELIVERED';
      const sentAt = row.status === 'PENDING' ? new Date().toISOString() : null;
      db.prepare(
        `UPDATE notifications SET status = ?, sent_at = COALESCE(sent_at, ?) WHERE id = ?`
      ).run(finalStatus, sentAt, id);
      publish('notification.updated', { id, status: finalStatus, recipient, type });
    } catch {
      // ignore
    }
  }, delay);
}

/**
 * Mark a notification as acknowledged (e.g. an emergency contact confirms they
 * received it).
 */
export function acknowledgeNotification(id: string): void {
  db.prepare('UPDATE notifications SET status = ? WHERE id = ?').run('ACKNOWLEDGED', id);
  const row = db
    .prepare('SELECT id, incident_id, recipient, notification_type FROM notifications WHERE id = ?')
    .get(id) as { incident_id: string; recipient: string; notification_type: string } | undefined;
  if (row) {
    publish('notification.updated', {
      id,
      status: 'ACKNOWLEDGED',
      recipient: row.recipient,
      type: row.notification_type,
    });
  }
}

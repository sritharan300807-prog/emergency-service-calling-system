import { db } from '../db.js';
import { config } from '../config.js';
import { publish, uid } from '../events.js';
import { isTwilioConfigured, placeEmergencyCall } from './callService.js';
import type { NotificationStatus, NotificationType } from '../types.js';

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
              n.status, n.channel, n.message, n.sent_at
       FROM notifications n
       LEFT JOIN emergency_contacts c ON c.id = n.contact_id
       WHERE n.incident_id = ?
       ORDER BY COALESCE(c.priority, 1) ASC, n.rowid ASC`
    )
    .all(incidentId);
  return (rows as Record<string, unknown>[]).map(asNotif);
}

/**
 * Trigger the emergency notification workflow for a confirmed incident.
 * Contacts are notified in priority order. SMS/APP_PUSH are always simulated,
 * and VOICE_CALL is a REAL outgoing Twilio call to the configured emergency
 * number when Twilio credentials are set; otherwise it is simulated too.
 */
export async function triggerNotifications(
  incidentId: string,
  vehicleId: string
): Promise<NotificationRow[]> {
  publish('notification.workflow.start', { incidentId, vehicleId });
  const contacts = getContactsForVehicle(vehicleId);
  if (contacts.length === 0) {
    return [];
  }

  const realCall = isTwilioConfigured();
  let realCallPlaced = false;
  const created: NotificationRow[] = [];
  for (const contact of contacts) {
    for (const type of TYPES) {
      // A single real voice call goes to the configured emergency number.
      if (type === 'VOICE_CALL' && realCall && realCallPlaced) continue;
      const id = uid();
      const channel = type === 'VOICE_CALL' && realCall ? 'TWILIO' : 'DEMO';
      const recipient =
        type === 'VOICE_CALL' && realCall ? config.emergencyCallTo : contact.name;
      const message = buildMessage(contact, type, recipient);
      db.prepare(
        `INSERT INTO notifications
           (id, incident_id, contact_id, recipient, notification_type, status,
            channel, message)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`
      ).run(
        id,
        incidentId,
        contact.id,
        recipient,
        type,
        channel,
        message
      );
      created.push(
        asNotif({
          id,
          incident_id: incidentId,
          contact_id: contact.id,
          recipient,
          notification_type: type,
          status: 'PENDING',
          channel,
          message,
          sent_at: null,
        })
      );
      if (type === 'VOICE_CALL' && realCall) {
        realCallPlaced = true;
        scheduleRealCall(id, recipient);
      } else {
        // Simulate delivery after a short delay.
        scheduleDelivery(id, contact.name, type);
      }
    }
  }
  return created;
}

function buildMessage(contact: ContactRow, type: NotificationType, recipient: string): string {
  const base = `EMERGENCY ALERT: A vehicle associated with your contact "${contact.name}" has been involved in a possible accident. Please respond.`;
  switch (type) {
    case 'SMS':
      return `[DEMO SMS] ${base}`;
    case 'VOICE_CALL':
      return realCallMessage(recipient);
    default:
      return `[DEMO APP PUSH] ${base}`;
  }
}

function realCallMessage(recipient: string): string {
  // A human-readable record of the real call (included in the notification row).
  return `[CRITICAL] Real emergency voice call placed to ${recipient} via Twilio`;
}

/**
 * Places the REAL outgoing emergency call (TwiML read aloud on answer) via
 * Twilio and mirrors its outcome onto the notification row.
 */
function scheduleRealCall(id: string, toNumber: string): void {
  setTimeout(async () => {
    try {
      const outcome = await placeEmergencyCall(toNumber);
      const status: NotificationStatus = outcome.error ? 'FAILED' : 'DELIVERED';
      const sentAt = new Date().toISOString();
      db.prepare(
        `UPDATE notifications
           SET status = ?, sent_at = ?, message = COALESCE(?, message)
         WHERE id = ?`
      ).run(status, sentAt, status === 'FAILED' ? `[CALL FAILED] ${outcome.error}` : null, id);
      publish('notification.updated', {
        id,
        status,
        recipient: toNumber,
        type: 'VOICE_CALL',
        callSid: outcome.callSid ?? null,
        error: outcome.error ?? null,
      });
    } catch {
      // ignore
    }
  }, config.app.mockNotificationDeliveryMs);
}

function scheduleDelivery(id: string, recipient: string, type: NotificationType): void {
  // Stagger delivery so the dashboard shows progressive status updates.
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
      publish('notification.updated', {
        id,
        status: finalStatus,
        recipient,
        type,
      });
    } catch {
      // ignore
    }
  }, delay);
}

/**
 * Mark a notification as acknowledged (e.g. an emergency contact confirms they
 * received it). Returns true when the whole incident's workflow is acknowledged.
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

export type Role = 'OWNER' | 'CONTACT' | 'ADMIN' | 'RESPONDER';

export type EventType =
  | 'NORMAL'
  | 'SUSPICIOUS_EVENT'
  | 'POSSIBLE_ACCIDENT'
  | 'CONFIRMED_EMERGENCY';

export type IncidentStatus =
  | 'POSSIBLE_ACCIDENT'
  | 'CONFIRMED_EMERGENCY'
  | 'CANCELLED'
  | 'DISPATCHED'
  | 'ON_SCENE'
  | 'RESOLVED'
  | 'FALSE_ALARM';

export type Severity = 'LOW' | 'MODERATE' | 'SEVERE' | 'CRITICAL';

export type NotificationType = 'SMS' | 'APP_PUSH' | 'VOICE_CALL';
export type NotificationStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'ACKNOWLEDGED';

/**
 * Lifecycle of a REAL outgoing phone call as reported by the telephony provider
 * (Twilio). 'NONE' means no real call was attempted (demo/simulated).
 */
export type CallStatus =
  | 'NONE'
  | 'QUEUED'
  | 'INITIATED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'ANSWERED'
  | 'COMPLETED'
  | 'BUSY'
  | 'NO_ANSWER'
  | 'FAILED'
  | 'CANCELED';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface SensorPayload {
  vehicleId: string;
  acceleration: number;
  speed: number;
  orientation: { roll: number; pitch: number; yaw: number };
  latitude?: number;
  longitude?: number;
  timestamp?: string;
  source?: string;
  previousSpeed?: number;
  manualSos?: boolean;
}

export interface IncidentWithVehicle {
  id: string;
  vehicleId: string;
  vehicleIdentifier: string;
  registrationNumber: string;
  ownerName: string;
  incidentTime: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  severity: Severity;
  status: IncidentStatus;
  summary: string | null;
  countdownSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

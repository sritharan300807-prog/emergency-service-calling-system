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
export type NotificationStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'ACKNOWLEDGED';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  createdAt?: string;
}

export interface Vehicle {
  id: string;
  vehicleIdentifier: string;
  registrationNumber: string;
  ownerId: string;
  ownerName: string;
  qrIdentifier: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: string | null;
  createdAt: string;
}

export interface EmergencyContact {
  id: string;
  vehicleId: string;
  name: string;
  relationship: string;
  phoneNumber: string;
  priority: number;
  createdAt: string;
}

export interface Incident {
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

export interface Notification {
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

export interface DashboardStats {
  stats: {
    totalVehicles: number;
    activeVehicles: number;
    todayIncidents: number;
    activeAlerts: number;
    resolvedIncidents: number;
    totalIncidents: number;
    totalContacts: number;
    pendingNotifications: number;
    registeredUsers: number;
  };
  recentActivity: Array<{
    id: string;
    status: IncidentStatus;
    severity: Severity;
    incidentTime: string;
    registrationNumber: string;
    vehicleIdentifier: string;
    address: string | null;
    createdAt: string;
  }>;
  activeIncidents: Incident[];
}

export interface Settings {
  falseAlarmCountdownSeconds?: string;
  simulationMode?: string;
  mockNotifications?: string;
  autoResolve?: string;
}

import type { IncidentStatus, NotificationStatus, Severity, Role } from '@/lib/types';

const statusStyles: Record<IncidentStatus, string> = {
  POSSIBLE_ACCIDENT: 'bg-amber-100 text-amber-800 border-amber-200',
  CONFIRMED_EMERGENCY: 'bg-red-100 text-red-800 border-red-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  FALSE_ALARM: 'bg-slate-100 text-slate-600 border-slate-200',
  DISPATCHED: 'bg-blue-100 text-blue-800 border-blue-200',
  ON_SCENE: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  RESOLVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  POSSIBLE_ACCIDENT: 'Possible Accident',
  CONFIRMED_EMERGENCY: 'Confirmed Emergency',
  CANCELLED: 'Cancelled',
  FALSE_ALARM: 'False Alarm',
  DISPATCHED: 'Dispatched',
  ON_SCENE: 'On Scene',
  RESOLVED: 'Resolved',
};

const severityStyles: Record<Severity, string> = {
  LOW: 'bg-slate-100 text-slate-700 border-slate-200',
  MODERATE: 'bg-amber-100 text-amber-800 border-amber-200',
  SEVERE: 'bg-orange-100 text-orange-800 border-orange-200',
  CRITICAL: 'bg-red-100 text-red-800 border-red-200',
};

const notifStyles: Record<NotificationStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-600 border-slate-200',
  SENT: 'bg-blue-100 text-blue-800 border-blue-200',
  DELIVERED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FAILED: 'bg-red-100 text-red-800 border-red-200',
  ACKNOWLEDGED: 'bg-violet-100 text-violet-800 border-violet-200',
};

const roleStyles: Record<Role, string> = {
  ADMIN: 'bg-brand-100 text-brand-800 border-brand-200',
  OWNER: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CONTACT: 'bg-blue-100 text-blue-800 border-blue-200',
  RESPONDER: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge className={statusStyles[status]}>{INCIDENT_STATUS_LABEL[status]}</Badge>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge className={severityStyles[severity]}>{severity}</Badge>;
}

export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  return <Badge className={notifStyles[status]}>{status.replace('_', ' ')}</Badge>;
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge className={roleStyles[role]}>{role}</Badge>;
}

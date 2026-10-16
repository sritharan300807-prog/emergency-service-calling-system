import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Siren,
  ShieldCheck,
  MapPin,
  Clock,
  Users,
  PhoneCall,
  CheckCircle2,
  XCircle,
  Timer,
  Radio,
  RefreshCw,
  AlertTriangle,
  Navigation,
  Bell,
  Loader2,
  Mic,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Incident, Notification } from '@/lib/types';
import { useLiveEmergency } from '@/lib/liveEmergency';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { MapView } from '@/components/MapView';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  IncidentStatusBadge,
  SeverityBadge,
  NotificationStatusBadge,
} from '@/components/Badge';
import { LoadingSpinner, ErrorState, EmptyState } from '@/components/StateViews';
import { formatDate, formatTime } from '@/lib/format';

const workflowSteps = [
  { key: 'detection', label: 'Accident detected', icon: AlertTriangle },
  { key: 'validation', label: 'Validation / countdown', icon: Timer, countdown: true },
  { key: 'confirmed', label: 'Emergency confirmed', icon: CheckCircle2 },
  { key: 'notify', label: 'Notify contacts', icon: Users },
  { key: 'workflow', label: 'Configured response workflow', icon: PhoneCall },
  { key: 'resolved', label: 'Incident resolved', icon: CheckCircle2 },
];

export function LiveEmergencyPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();
  const { activeIncidents, countdowns, refresh, voiceListening } = useLiveEmergency();

  const [details, setDetails] = useState<{ incident: Incident; notifications: Notification[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const targetId = id || activeIncidents[0]?.id;

  // Refresh details (and notifications) whenever the target incident changes.
  useEffect(() => {
    if (!targetId) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<{ incident: Incident; notifications: Notification[] }>(`/api/incidents/${targetId}`)
      .then((d) => {
        if (!cancelled) {
          setDetails(d);
          setError('');
        }
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [targetId, activeIncidents]);

  const incident = details?.incident;
  const notifications = details?.notifications ?? [];
  const countdown = incident ? countdowns[incident.id] : undefined;
  const isResponderLike =
    user?.role === 'ADMIN' || user?.role === 'RESPONDER' || user?.role === 'OWNER';

  const liveIncident = useMemo(
    () => incident ?? activeIncidents.find((i) => i.id === targetId) ?? null,
    [incident, activeIncidents, targetId]
  );

  const updateStatus = async (status: string, note?: string) => {
    if (!incident) return;
    setBusy(true);
    try {
      await api(`/api/incidents/${incident.id}`, {
        method: 'PATCH',
        body: { status, note },
      });
      push('success', `Incident marked ${status.replace('_', ' ')}`);
      refresh();
    } catch (e) {
      push('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!incident) return;
    setBusy(true);
    try {
      await api(`/api/incidents/${incident.id}/cancel`, { method: 'POST' });
      push('info', 'Alert cancelled — marked as false alarm');
      refresh();
    } catch (e) {
      push('error', (e as Error).message);
    } finally {
      setBusy(false);
      setCancelOpen(false);
    }
  };

  const progress = (() => {
    if (!incident) return 0;
    const steps = {
      detection: 1,
      validation: 2,
      confirmed: 3,
      notify: 4,
      workflow: 5,
      resolved: 6,
    };
    if (incident.status === 'POSSIBLE_ACCIDENT') return steps.validation;
    if (incident.status === 'CANCELLED' || incident.status === 'FALSE_ALARM') return steps.validation;
    if (incident.status === 'CONFIRMED_EMERGENCY') {
      return notifications.some((n) => n.status === 'DELIVERED' || n.status === 'ACKNOWLEDGED')
        ? steps.workflow
        : steps.confirmed;
    }
    if (incident.status === 'RESOLVED') return steps.resolved;
    return Math.max(steps.confirmed, steps.workflow);
  })();

  if (activeIncidents.length === 0 && !incident) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState
          title="No active emergency"
          message="When a possible accident is detected, the full response workflow will appear here in real time."
          action={
            user?.role !== 'CONTACT' ? (
              <button onClick={() => navigate('/dashboard')} className="btn-danger">
                <Siren className="h-4 w-4" /> Simulate an accident
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (loading && !incident) return <LoadingSpinner label="Loading incident…" />;
  if (error && !incident) return <ErrorState message={error} onRetry={refresh} />;
  if (!liveIncident) return null;

  const isPossible = liveIncident.status === 'POSSIBLE_ACCIDENT';

  return (
    <div className="space-y-6">
      <Header />

      {/* Emergency banner */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 ${
          isPossible
            ? 'border-amber-500 bg-amber-50'
            : liveIncident.status === 'CONFIRMED_EMERGENCY'
            ? 'border-brand-600 bg-brand-50'
            : 'border-charcoal-700 bg-charcoal-850'
        }`}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                isPossible ? 'bg-amber-500 text-white' : 'bg-brand-600 text-white'
              }`}
            >
              <Siren className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                {isPossible ? 'Possible Accident Detected' : incident?.status === 'CONFIRMED_EMERGENCY' ? 'Confirmed Emergency' : 'Emergency Incident'}
              </h1>
              <p className="text-sm text-slate-600">
                {liveIncident.vehicleIdentifier} · {liveIncident.registrationNumber} ·{' '}
                {formatDate(liveIncident.incidentTime)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IncidentStatusBadge status={liveIncident.status} />
            <SeverityBadge severity={liveIncident.severity} />
          </div>
        </div>

        {/* Countdown */}
        {isPossible && (
          <div className="mt-6 rounded-xl border border-amber-300 bg-white p-4">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-3">
                <Timer className="h-6 w-6 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Waiting for driver confirmation
                  </p>
                  <p className="text-xs text-slate-500">
                    If not cancelled, this will be confirmed as an emergency.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`text-4xl font-extrabold tabular-nums ${
                    (countdown?.remainingSeconds ?? 0) <= 5 ? 'text-brand-600' : 'text-slate-900'
                  }`}
                >
                  {countdown?.remainingSeconds ?? liveIncident.countdownSeconds ?? 15}s
                </span>
                {user?.role === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'CONTACT' ? (
                  <button onClick={() => setCancelOpen(true)} disabled={busy} className="btn bg-emerald-600 text-white hover:bg-emerald-700 px-5 py-3">
                    <ShieldCheck className="h-5 w-5" /> I AM SAFE — CANCEL
                  </button>
                ) : (
                  <button onClick={() => setCancelOpen(true)} disabled={busy} className="btn-secondary px-5 py-3">
                    Cancel alert
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Confirmed actions */}
        {!isPossible &&
          incident?.status !== 'RESOLVED' &&
          incident?.status !== 'CANCELLED' &&
          incident?.status !== 'FALSE_ALARM' &&
          isResponderLike && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => updateStatus('DISPATCHED')} disabled={busy} className="btn-dark">
                Dispatch responder
              </button>
              <button onClick={() => updateStatus('ON_SCENE')} disabled={busy} className="btn-dark">
                Responder on scene
              </button>
              <button
                onClick={() => updateStatus('RESOLVED', 'Incident resolved by responder')}
                disabled={busy}
                className="btn bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" /> Mark resolved
              </button>
            </div>
          )}

        {/* Voice control indicator */}
        {voiceListening && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-sm">
            <Mic className="h-4 w-4 animate-pulse text-brand-600" />
            <span className="text-slate-700">
              Siren playing — say <b>"stop alarm"</b> to silence it by voice
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: location + details */}
        <div className="space-y-6 lg:col-span-2">
          {liveIncident.latitude != null && liveIncident.longitude != null ? (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <h3 className="flex items-center gap-2 font-bold text-slate-800">
                  <MapPin className="h-4 w-4 text-brand-600" /> Live Location
                </h3>
                <span className="text-xs text-slate-400">
                  {liveIncident.latitude.toFixed(5)}, {liveIncident.longitude.toFixed(5)}
                </span>
              </div>
              <div className="h-72 w-full">
                <MapView
                  latitude={liveIncident.latitude}
                  longitude={liveIncident.longitude}
                  marker="accident"
                />
              </div>
              {liveIncident.address && (
                <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
                  <Navigation className="h-4 w-4 text-slate-400" /> {liveIncident.address}
                </div>
              )}
            </div>
          ) : (
            <div className="card p-5">
              <p className="text-sm text-slate-500">No location recorded for this incident.</p>
            </div>
          )}

          {/* Incident details */}
          <div className="card p-5">
            <h3 className="mb-4 font-bold text-slate-800">Incident Details</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail label="Incident ID" value={liveIncident.id.slice(0, 8).toUpperCase()} mono />
              <Detail label="Detection time" value={formatTime(liveIncident.incidentTime)} />
              <Detail label="Vehicle" value={`${liveIncident.vehicleIdentifier}`} />
              <Detail label="Registration" value={liveIncident.registrationNumber} />
              <Detail label="Owner" value={liveIncident.ownerName} />
              <Detail label="Severity" value={liveIncident.severity} />
              {liveIncident.summary && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold text-slate-500">Detection summary</dt>
                  <dd className="mt-1 text-sm text-slate-700">{liveIncident.summary}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Workflow timeline */}
          <div className="card p-5">
            <h3 className="mb-4 font-bold text-slate-800">Incident Timeline</h3>
            <div className="space-y-0">
              {workflowSteps.map((step, idx) => {
                const done = idx < progress;
                const current = idx === progress;
                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          done
                            ? 'bg-emerald-100 text-emerald-600'
                            : current
                            ? 'bg-brand-100 text-brand-600'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {done ? <CheckCircle2 className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
                      </span>
                      {idx < workflowSteps.length - 1 && (
                        <span
                          className={`w-0.5 flex-1 my-1 ${
                            done || current ? 'bg-emerald-300' : 'bg-slate-200'
                          }`}
                          style={{ minHeight: 16 }}
                        />
                      )}
                    </div>
                    <div className="pb-5">
                      <p
                        className={`text-sm font-semibold ${
                          done ? 'text-slate-800' : current ? 'text-brand-700' : 'text-slate-400'
                        }`}
                      >
                        {step.label}
                      </p>
                      {step.countdown && (
                        <p className="text-xs text-slate-500">
                          {current && isPossible
                            ? `${countdown?.remainingSeconds ?? 15}s countdown running`
                            : liveIncident.status === 'CONFIRMED_EMERGENCY'
                            ? 'Completed — emergency confirmed'
                            : 'Completed'}
                        </p>
                      )}
                      {step.key === 'workflow' && (
                        <p className="text-xs text-slate-400">
                          Configured Emergency Response Workflow (Demo / Simulation Mode)
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: notifications */}
        <div className="card h-fit">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h3 className="flex items-center gap-2 font-bold text-slate-800">
              <Bell className="h-4 w-4 text-brand-600" /> Contact Notifications
            </h3>
            {isResponderLike && (
              <button
                onClick={refresh}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">
                {isPossible
                  ? 'Notifications start once the emergency is confirmed.'
                  : liveIncident.status === 'CANCELLED' || liveIncident.status === 'FALSE_ALARM'
                  ? 'Alert was cancelled — no notifications sent.'
                  : 'No notifications generated yet.'}
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{n.recipient}</span>
                      <NotificationStatusBadge status={n.status} />
                    </div>
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      {n.notificationType.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{n.message}</p>
                  {n.sentAt && (
                    <p className="mt-1 text-[11px] text-slate-400">{formatTime(n.sentAt)}</p>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Demo / Simulation Mode — mock SMS, app push &amp; call.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title="Cancel emergency alert"
        message="Are you sure you are safe? This will cancel the alert and record a false alarm. Emergency contacts will not be notified."
        confirmLabel="Yes, I am safe"
        tone={busy ? 'default' : 'success'}
      />
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold text-white">Live Emergency</h1>
      <p className="text-sm text-slate-400">Real-time accident detection &amp; response workflow.</p>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm text-slate-800 ${mono ? 'font-mono' : 'font-semibold'}`}>
        {value}
      </dd>
    </div>
  );
}

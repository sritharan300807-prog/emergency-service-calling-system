import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Car,
  Radio,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Users,
  UserPlus,
  QrCode,
  Siren,
  ArrowRight,
  PhoneCall,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { CallConfig, DashboardStats, Vehicle } from '@/lib/types';
import { StatCard } from '@/components/StatCard';
import { LoadingSpinner, ErrorState, EmptyState } from '@/components/StateViews';
import { IncidentStatusBadge, SeverityBadge } from '@/components/Badge';
import { useLiveEmergency } from '@/lib/liveEmergency';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { formatTime, timeAgo } from '@/lib/format';

export function DashboardPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const { activeIncidents, countdowns, refresh } = useLiveEmergency();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [callConfig, setCallConfig] = useState<CallConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      const [stats, veh, cfg] = await Promise.all([
        api<DashboardStats>('/api/dashboard/stats'),
        api<{ vehicles: Vehicle[] }>('/api/vehicles'),
        api<CallConfig>('/api/calls/config').catch(() => null),
      ]);
      setData(stats);
      setVehicles(veh.vehicles);
      setCallConfig(cfg);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const simulateAccident = async () => {
    const vehicle = vehicles[0];
    if (!vehicle) {
      push('error', 'No vehicles available to simulate');
      return;
    }
    try {
      await api('/api/incidents/simulate', {
        method: 'POST',
        body: { vehicleId: vehicle.id, countdownSeconds: undefined },
      });
      push('warning', 'Possible accident detected — countdown started');
      navigate('/live');
      refresh();
    } catch (e) {
      push('error', (e as Error).message);
    }
  };

  if (loading) return <LoadingSpinner label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const s = data.stats;
  const hasActive = activeIncidents.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400">
            Welcome back, {user?.name}. Live status of the emergency network.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user?.role !== 'CONTACT' && (
            <button onClick={simulateAccident} className="btn-danger">
              <Siren className="h-4 w-4" /> Simulate Accident
            </button>
          )}
          {user?.role === 'ADMIN' || user?.role === 'OWNER' ? (
            <Link to="/vehicles" className="btn-dark">
              <UserPlus className="h-4 w-4" /> Register Vehicle
            </Link>
          ) : (
            <Link to="/scanner" className="btn-dark">
              <QrCode className="h-4 w-4" /> Scan QR
            </Link>
          )}
        </div>
      </div>

      {/* Call system mode banner */}
      {callConfig && <CallModeBanner config={callConfig} />}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Registered Vehicles"
          value={s.totalVehicles}
          icon={<Car className="h-5 w-5" />}
          sub={`${s.activeVehicles} active`}
        />
        <StatCard
          label="Today's Incidents"
          value={s.todayIncidents}
          icon={<Activity className="h-5 w-5" />}
          tone="info"
          sub={`${s.totalIncidents} total`}
        />
        <StatCard
          label="Active Alerts"
          value={s.activeAlerts}
          icon={<Radio className="h-5 w-5" />}
          tone={s.activeAlerts > 0 ? 'danger' : 'default'}
          sub={s.activeAlerts > 0 ? 'Immediate attention' : 'All clear'}
        />
        <StatCard
          label="Resolved / Cleared"
          value={s.resolvedIncidents}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
          sub={`${s.pendingNotifications} notifications pending`}
        />
      </div>

      {/* Live emergency status */}
      <div
        className={`rounded-2xl border p-5 ${
          hasActive ? 'border-brand-700 bg-charcoal-850' : 'border-charcoal-700 bg-charcoal-850'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {hasActive ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white">
                <Siren className="h-5 w-5" />
              </span>
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <Radio className="h-5 w-5" />
              </span>
            )}
            <div>
              <h2 className="font-bold text-white">Live Emergency Status</h2>
              <p className={`text-sm ${hasActive ? 'text-brand-300' : 'text-slate-400'}`}>
                {hasActive
                  ? `${activeIncidents.length} active emergency(ies)`
                  : 'No active emergencies'}
              </p>
            </div>
          </div>
          <Link
            to="/live"
            className="btn-secondary bg-transparent text-slate-200 border-charcoal-600 hover:bg-charcoal-700"
          >
            View command center <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {hasActive && (
          <div className="mt-4 space-y-3">
            {activeIncidents.map((inc) => {
              const c = countdowns[inc.id];
              return (
                <Link
                  key={inc.id}
                  to={`/live/${inc.id}`}
                  className="flex items-center gap-3 rounded-xl border border-brand-700 bg-brand-900/20 px-4 py-3 hover:bg-brand-900/40"
                >
                  <AlertTriangle className="h-5 w-5 text-brand-400" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {inc.vehicleIdentifier} · {inc.registrationNumber}
                    </p>
                    <p className="text-xs text-slate-400">
                      {inc.status === 'POSSIBLE_ACCIDENT' && c
                        ? `Countdown: ${c.remainingSeconds}s to confirm`
                        : inc.status === 'CONFIRMED_EMERGENCY'
                        ? 'Waiting for response'
                        : inc.status.replace('_', ' ')}
                    </p>
                  </div>
                  <IncidentStatusBadge status={inc.status} />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent activity */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h3 className="font-bold text-slate-800">Recent Emergency Activity</h3>
            <Link to="/incidents" className="text-sm font-semibold text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentActivity.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No activity yet"
                  message="Run a simulation or an incident to see activity here."
                />
              </div>
            ) : (
              data.recentActivity.map((a) => (
                <Link
                  key={a.id}
                  to={`/incidents/${a.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50"
                >
                  <IncidentStatusBadge status={a.status} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {a.registrationNumber || a.vehicleIdentifier}
                    </p>
                    <p className="text-xs text-slate-500">
                      {a.address || 'Location recorded'} · {formatTime(a.incidentTime)}
                    </p>
                  </div>
                  <SeverityBadge severity={a.severity} />
                  <span className="hidden sm:block text-xs text-slate-400">
                    {timeAgo(a.createdAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-bold text-slate-800">Quick Actions</h3>
          </div>
          <div className="p-4 space-y-2">
            {[
              {
                label: 'Simulate an accident',
                desc: 'Trigger the full detection workflow',
                icon: Siren,
                to: null,
                action: user?.role !== 'CONTACT' ? simulateAccident : undefined,
                btn: 'btn-primary',
              },
              {
                label: 'View live emergency',
                desc: 'Command center',
                icon: Radio,
                to: '/live',
                btn: 'btn-secondary',
              },
              {
                label: 'Manage vehicles',
                desc: 'Register or view vehicles',
                icon: Car,
                to: '/vehicles',
                btn: 'btn-secondary',
              },
              {
                label: 'Scan vehicle QR',
                desc: 'Identify a vehicle',
                icon: QrCode,
                to: '/scanner',
                btn: 'btn-secondary',
              },
              {
                label: 'Emergency contacts',
                desc: `${s.totalContacts} registered`,
                icon: Users,
                to: '/contacts',
                btn: 'btn-secondary',
              },
              {
                label: 'Browse incidents',
                desc: `${s.totalIncidents} total`,
                icon: Activity,
                to: '/incidents',
                btn: 'btn-secondary',
              },
            ].map((a) => (
              <button
                key={a.label}
                disabled={!a.to && !a.action}
                onClick={() => {
                  if (a.action) a.action();
                  else if (a.to) navigate(a.to);
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-100"
              >
                <a.icon className="h-5 w-5 text-slate-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{a.label}</p>
                  <p className="text-xs text-slate-500">{a.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shows whether REAL emergency calls are enabled. Honest by design: it never
 * claims calls work unless Twilio is configured, and clearly flags TEST MODE.
 */
function CallModeBanner({ config }: { config: CallConfig }) {
  const tone =
    config.mode === 'LIVE'
      ? 'border-emerald-300 bg-emerald-50'
      : config.mode === 'TEST'
        ? 'border-amber-300 bg-amber-50'
        : 'border-slate-300 bg-slate-50';
  const dot =
    config.mode === 'LIVE'
      ? 'bg-emerald-500'
      : config.mode === 'TEST'
        ? 'bg-amber-500'
        : 'bg-slate-400';
  const title =
    config.mode === 'LIVE'
      ? 'Real emergency calls ENABLED'
      : config.mode === 'TEST'
        ? 'TEST MODE — calls are labelled test messages'
        : 'Demo mode — no real calls will be placed';
  const detail =
    config.mode === 'DEMO'
      ? 'Twilio credentials are not set on the server, so voice calls are simulated. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER to enable real calls.'
      : `${config.emergencyContacts.length} emergency contact(s) will be dialed concurrently. Language: ${config.language}. Retries: ${config.maxRetries}.`;

  return (
    <div className={`rounded-2xl border ${tone} p-4`}>
      <div className="flex items-start gap-3">
        <span className="mt-4 flex h-2.5 w-2.5 shrink-0 rounded-full">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        </span>
        <PhoneCall className="h-5 w-5 text-slate-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="mt-0.5 text-xs text-slate-600">{detail}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {config.emergencyContacts.map((n) => (
              <span
                key={n}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600"
              >
                {n}
              </span>
            ))}
          </div>
          {!config.statusCallbacks && config.mode !== 'DEMO' && (
            <p className="mt-1 text-[11px] text-amber-700">
              Set PUBLIC_BASE_URL on the server to receive live call-status callbacks
              (initiated → ringing → answered → completed).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

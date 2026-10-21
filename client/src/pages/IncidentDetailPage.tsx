import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Bell, Navigation, Phone, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import type { Incident, Notification } from '@/lib/types';
import {
  IncidentStatusBadge,
  SeverityBadge,
  NotificationStatusBadge,
  CallStatusBadge,
} from '@/components/Badge';
import { LoadingSpinner, ErrorState } from '@/components/StateViews';
import { MapView } from '@/components/MapView';
import { formatDate, formatTime } from '@/lib/format';

/** Google Maps directions link for a coordinate pair (never invented). */
function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function IncidentDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<{ incident: Incident; notifications: Notification[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api<{ incident: Incident; notifications: Notification[] }>(`/api/incidents/${id}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner label="Loading incident…" />;
  if (error) return <ErrorState message={error} onRetry={() => setLoading(true)} />;
  if (!data) return null;

  const { incident, notifications } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/incidents" className="btn-ghost px-2">
          <ArrowLeft className="h-4 w-4" /> Incidents
        </Link>
        <div className="flex items-center gap-2">
          <IncidentStatusBadge status={incident.status} />
          <SeverityBadge severity={incident.severity} />
        </div>
      </div>

      <div className="card p-6">
        <h1 className="text-2xl font-extrabold text-slate-800">
          Incident <span className="font-mono text-slate-500">{incident.id.slice(0, 8).toUpperCase()}</span>
        </h1>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Vehicle" value={`${incident.vehicleIdentifier} · ${incident.registrationNumber}`} />
          <Detail label="Owner" value={incident.ownerName} />
          <Detail label="Detected" value={formatDate(incident.incidentTime)} />
          <Detail label="Status" value={incident.status.replace('_', ' ')} />
          <Detail label="Severity" value={incident.severity} />
          <Detail label="Last updated" value={formatDate(incident.updatedAt)} />
        </div>
        {incident.summary && (
          <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">Detection summary</p>
            <p className="mt-1 text-sm text-slate-700">{incident.summary}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {incident.latitude != null && incident.longitude != null ? (
          <div className="card overflow-hidden lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
              <MapPin className="h-4 w-4 text-brand-600" />
              <h3 className="font-bold text-slate-800">Location</h3>
              <span className="ml-auto text-xs text-slate-400">
                {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
              </span>
            </div>
            <div className="h-72">
              <MapView latitude={incident.latitude} longitude={incident.longitude} marker="accident" />
            </div>
            {incident.address && (
              <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
                <Navigation className="h-4 w-4 text-slate-400" /> {incident.address}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3">
              <a
                href={mapsLink(incident.latitude, incident.longitude)}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                <ExternalLink className="h-4 w-4" /> Open in Google Maps
              </a>
              <span className="text-xs text-slate-400">
                Real GPS coordinates — no simulated location.
              </span>
            </div>
          </div>
        ) : (
          <div className="card p-5 lg:col-span-2 text-sm text-slate-500">
            No GPS location recorded. The system never invents a location — the alert states
            that coordinates were unavailable.
          </div>
        )}

        {/* Notifications */}
        <div className="card h-fit">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
            <Bell className="h-4 w-4 text-brand-600" />
            <h3 className="font-bold text-slate-800">Notifications</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">
                {incident.status === 'CANCELLED' || incident.status === 'FALSE_ALARM'
                  ? 'Alert was cancelled — no notifications sent.'
                  : 'No notifications generated.'}
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                      {n.notificationType === 'VOICE_CALL' && (
                        <Phone className="h-3.5 w-3.5 text-brand-600" />
                      )}
                      {n.recipient}
                    </span>
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      {n.notificationType.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <NotificationStatusBadge status={n.status} />
                    {n.notificationType === 'VOICE_CALL' && n.callStatus && (
                      <CallStatusBadge status={n.callStatus} />
                    )}
                    {n.channel === 'TWILIO' && (
                      <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">
                        Real call
                      </span>
                    )}
                    {n.channel === 'DEMO' && n.notificationType === 'VOICE_CALL' && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                        Simulated
                      </span>
                    )}
                    {typeof n.attempts === 'number' && n.attempts > 1 && (
                      <span className="text-[10px] font-semibold text-slate-400">
                        attempt {n.attempts}
                      </span>
                    )}
                  </div>
                  {n.sentAt && (
                    <p className="mt-1 text-[11px] text-slate-400">{formatTime(n.sentAt)}</p>
                  )}
                  {n.callSid && (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-slate-300">
                      {n.callSid}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

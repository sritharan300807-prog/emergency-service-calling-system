import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, History } from 'lucide-react';
import { api } from '@/lib/api';
import type { Incident } from '@/lib/types';
import { IncidentStatusBadge, SeverityBadge } from '@/components/Badge';
import { LoadingSpinner, ErrorState, EmptyState } from '@/components/StateViews';
import { formatTime, formatDate } from '@/lib/format';

export function IncidentsPage() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (severity) params.set('severity', severity);
      const qs = params.toString();
      const d = await api<{ incidents: Incident[]; total: number }>(
        `/api/incidents/history${qs ? `?${qs}` : ''}`
      );
      setIncidents(d.incidents);
      setTotal(d.total);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, status, severity]);

  useEffect(() => {
    const t = setTimeout(load, search ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Incident History</h1>
        <p className="text-sm text-slate-400">Search and filter all recorded incidents.</p>
      </div>

      {/* Filters */}
      <div className="card flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by ID, registration, location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            className="input w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="POSSIBLE_ACCIDENT">Possible Accident</option>
            <option value="CONFIRMED_EMERGENCY">Confirmed Emergency</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="ON_SCENE">On Scene</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="FALSE_ALARM">False Alarm</option>
          </select>
          <select
            className="input w-auto"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">All severities</option>
            <option value="LOW">Low</option>
            <option value="MODERATE">Moderate</option>
            <option value="SEVERE">Severe</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading incidents…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : incidents.length === 0 ? (
        <EmptyState
          title="No incidents found"
          message="Try adjusting your filters, or simulate an accident to create one."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Incident ID</th>
                  <th className="px-4 py-3 font-semibold">Vehicle</th>
                  <th className="px-4 py-3 font-semibold">Date &amp; time</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Severity</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.map((inc) => (
                  <tr
                    key={inc.id}
                    onClick={() => navigate(`/incidents/${inc.id}`)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {inc.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{inc.registrationNumber}</p>
                      <p className="text-xs text-slate-400">{inc.vehicleIdentifier}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{formatDate(inc.incidentTime)}</p>
                      <p className="text-xs text-slate-400">{formatTime(inc.incidentTime)}</p>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-slate-600">
                      {inc.address || `${inc.latitude?.toFixed(3)}, ${inc.longitude?.toFixed(3)}` || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={inc.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <IncidentStatusBadge status={inc.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            Showing {incidents.length} of {total} incident(s)
          </div>
        </div>
      )}
    </div>
  );
}

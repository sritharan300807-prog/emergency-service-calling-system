import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Car, QrCode, Users, Siren, MapPin, Download, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import type { Vehicle } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { LoadingSpinner, ErrorState } from '@/components/StateViews';
import { MapView } from '@/components/MapView';
import { formatDate } from '@/lib/format';

export function VehicleDetailPage() {
  const { id } = useParams();
  const { push } = useToast();
  const { canManageVehicles } = useAuth();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const load = async () => {
    try {
      const [v, q] = await Promise.all([
        api<{ vehicle: Vehicle }>(`/api/vehicles/${id}`),
        api<{ qrDataUrl: string; qrIdentifier: string }>(`/api/qr/${id}`).catch(() => null),
      ]);
      setVehicle(v.vehicle);
      if (q) setQr(q.qrDataUrl);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const simulate = async () => {
    if (!vehicle) return;
    setSimulating(true);
    try {
      await api('/api/incidents/simulate', { method: 'POST', body: { vehicleId: vehicle.id } });
      push('warning', 'Possible accident detected — response workflow started');
    } catch (e) {
      push('error', (e as Error).message);
    } finally {
      setSimulating(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading vehicle…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!vehicle) return null;

  const downloadQr = () => {
    const a = document.createElement('a');
    a.href = qr;
    a.download = `${vehicle.registrationNumber}-qr.png`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/vehicles" className="btn-ghost px-2">
          <ArrowLeft className="h-4 w-4" /> Vehicles
        </Link>
        <div className="flex gap-2">
          {canManageVehicles && (
            <button onClick={() => setEditOpen(true)} className="btn-secondary">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          {canManageVehicles && (
            <button onClick={simulate} disabled={simulating} className="btn-danger">
              <Siren className="h-4 w-4" /> {simulating ? 'Simulating…' : 'Simulate Accident'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-charcoal-800 text-white">
                <Car className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-800">
                  {vehicle.registrationNumber}
                </h1>
                <p className="text-sm text-slate-500">
                  {vehicle.make || ''} {vehicle.model || ''} {vehicle.year ? `(${vehicle.year})` : ''}
                </p>
              </div>
              <span
                className={`ml-auto inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                  vehicle.status === 'ACTIVE'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {vehicle.status}
              </span>
            </div>
            <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold text-slate-500">Vehicle identifier</dt>
                <dd className="font-mono text-sm text-slate-800">{vehicle.vehicleIdentifier}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">Owner</dt>
                <dd className="text-sm text-slate-800">{vehicle.ownerName}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">Registered on</dt>
                <dd className="text-sm text-slate-800">{formatDate(vehicle.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">QR identifier</dt>
                <dd className="font-mono text-sm text-slate-800">{vehicle.qrIdentifier}</dd>
              </div>
            </dl>
          </div>

          {vehicle.latitude != null ? (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
                <MapPin className="h-4 w-4 text-brand-600" />
                <h3 className="font-bold text-slate-800">Vehicle Location</h3>
                <span className="ml-auto text-xs text-slate-400">
                  {vehicle.latitude.toFixed(5)}, {vehicle.longitude?.toFixed(5)}
                </span>
              </div>
              <div className="h-64">
                <MapView latitude={vehicle.latitude} longitude={vehicle.longitude ?? vehicle.latitude} marker="vehicle" />
              </div>
            </div>
          ) : (
            <div className="card p-6 text-sm text-slate-500">
              No location configured for this vehicle.
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <div className="card p-6 text-center">
            <h3 className="mb-3 flex items-center justify-center gap-2 font-bold text-slate-800">
              <QrCode className="h-4 w-4 text-brand-600" /> Vehicle QR Code
            </h3>
            {qr ? (
              <>
                <div
                  className="mx-auto w-44 cursor-pointer"
                  onClick={() => setQrOpen(true)}
                  title="Click to enlarge"
                >
                  <img src={qr} alt="Vehicle QR code" className="rounded-lg border border-slate-200" />
                </div>
                <button onClick={downloadQr} className="btn-secondary mt-4 w-full justify-center">
                  <Download className="h-4 w-4" /> Download PNG
                </button>
                <p className="mt-2 text-[11px] text-slate-400">
                  Encodes only a secure identifier — no personal data exposed.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">QR unavailable for your role.</p>
            )}
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-slate-800">
                <Users className="h-4 w-4 text-brand-600" /> Emergency Contacts
              </h3>
              <Link
                to={`/contacts?vehicle=${vehicle.id}`}
                className="text-sm font-semibold text-brand-600 hover:underline"
              >
                Manage
              </Link>
            </div>
            <Link to={`/contacts?vehicle=${vehicle.id}`} className="btn-secondary w-full justify-center py-1.5 text-sm">
              View contacts
            </Link>
          </div>
        </div>
      </div>

      {vehicle && (
        <EditVehicleModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          vehicle={vehicle}
          onSaved={async () => {
            await load();
            push('success', 'Vehicle updated');
          }}
        />
      )}

      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title={`QR — ${vehicle.registrationNumber}`} size="sm">
        <div className="mx-auto w-64">
          <img src={qr} alt="Vehicle QR code enlarged" className="rounded-lg border border-slate-200" />
        </div>
      </Modal>
    </div>
  );
}

function EditVehicleModal({
  open,
  onClose,
  vehicle,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  vehicle: Vehicle;
  onSaved: () => Promise<void>;
}) {
  const { push } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    registrationNumber: vehicle.registrationNumber,
    make: vehicle.make || '',
    model: vehicle.model || '',
    year: vehicle.year ? String(vehicle.year) : '',
    status: vehicle.status,
  });

  useEffect(() => {
    setForm({
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year ? String(vehicle.year) : '',
      status: vehicle.status,
    });
  }, [vehicle]);

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/api/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        body: {
          registrationNumber: form.registrationNumber.trim(),
          make: form.make.trim(),
          model: form.model.trim(),
          year: form.year ? Number(form.year) : undefined,
          status: form.status,
        },
      });
      await onSaved();
      onClose();
    } catch (e) {
      push('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit vehicle">
      <div className="space-y-4">
        <div>
          <label className="label">Registration number</label>
          <input
            className="input"
            value={form.registrationNumber}
            onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Make</label>
            <input className="input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
          </div>
          <div>
            <label className="label">Model</label>
            <input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Year</label>
            <input
              className="input"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Vehicle['status'] })}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={submit} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

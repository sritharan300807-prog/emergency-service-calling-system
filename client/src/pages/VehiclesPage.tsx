import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Car, QrCode, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import type { Vehicle } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { LoadingSpinner, ErrorState, EmptyState } from '@/components/StateViews';

interface OwnerOption {
  id: string;
  name: string;
  email: string;
}

export function VehiclesPage() {
  const { user, canManageVehicles } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      const [v, o] = await Promise.all([
        api<{ vehicles: Vehicle[] }>('/api/vehicles'),
        user?.role === 'ADMIN'
          ? api<{ users: OwnerOption[] }>('/api/auth/users')
          : Promise.resolve({ users: [] }),
      ]);
      setVehicles(v.vehicles);
      setOwners(o.users);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createVehicle = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api('/api/vehicles', { method: 'POST', body: data });
      push('success', 'Vehicle registered');
      setFormOpen(false);
      await load();
    } catch (e) {
      push('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading vehicles…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Vehicle Management</h1>
          <p className="text-sm text-slate-400">Register, configure and monitor vehicles.</p>
        </div>
        {canManageVehicles && (
          <button onClick={() => setFormOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Register Vehicle
          </button>
        )}
      </div>

      {vehicles.length === 0 ? (
        <EmptyState
          title="No vehicles registered"
          message="Register your first vehicle to enable accident detection and emergency contacts."
          action={
            canManageVehicles ? (
              <button onClick={() => setFormOpen(true)} className="btn-primary">
                <Plus className="h-4 w-4" /> Register Vehicle
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((v) => (
            <div key={v.id} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-charcoal-800 text-white">
                    <Car className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{v.registrationNumber}</p>
                    <p className="text-xs text-slate-500">{v.vehicleIdentifier}</p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    v.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {v.status}
                </span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-slate-700">
                  {v.make || '—'} {v.model || ''} {v.year ? `(${v.year})` : ''}
                </p>
                <p className="mt-1 text-sm text-slate-500">Owner: {v.ownerName}</p>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5" />
                  {v.latitude != null ? (
                    <span>
                      {v.latitude.toFixed(4)}, {v.longitude?.toFixed(4)}
                    </span>
                  ) : (
                    'No location'
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                <Link
                  to={`/vehicles/${v.id}`}
                  className="btn-dark flex-1 justify-center py-1.5 text-xs"
                >
                  View &amp; QR
                </Link>
                <Link
                  to={`/contacts?vehicle=${v.id}`}
                  className="btn-secondary flex-1 justify-center py-1.5 text-xs"
                >
                  Contacts
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <RegisterVehicleModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={createVehicle}
        owners={owners}
        defaultOwnerId={user?.role === 'OWNER' ? user.id : ''}
        saving={saving}
      />
    </div>
  );
}

function RegisterVehicleModal({
  open,
  onClose,
  onSave,
  owners,
  defaultOwnerId,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  owners: OwnerOption[];
  defaultOwnerId: string;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    vehicleIdentifier: '',
    registrationNumber: '',
    make: '',
    model: '',
    year: '',
    ownerId: defaultOwnerId,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm({
        vehicleIdentifier: '',
        registrationNumber: '',
        make: '',
        model: '',
        year: '',
        ownerId: defaultOwnerId,
      });
      setErrors({});
    }
  }, [open, defaultOwnerId]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.vehicleIdentifier.trim()) e.vehicleIdentifier = 'Vehicle ID is required';
    if (!form.registrationNumber.trim()) e.registrationNumber = 'Registration no. is required';
    if (!form.ownerId) e.ownerId = 'An owner is required';
    if (form.year && (Number(form.year) < 1900 || Number(form.year) > 2100))
      e.year = 'Enter a valid year';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({
      vehicleIdentifier: form.vehicleIdentifier.trim(),
      registrationNumber: form.registrationNumber.trim(),
      make: form.make.trim(),
      model: form.model.trim(),
      year: form.year ? Number(form.year) : undefined,
      ownerId: form.ownerId,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Register a new vehicle" size="lg">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Vehicle identifier *" error={errors.vehicleIdentifier}>
          <input
            className="input"
            placeholder="e.g. veh-002"
            value={form.vehicleIdentifier}
            onChange={(e) => setForm({ ...form, vehicleIdentifier: e.target.value })}
          />
        </Field>
        <Field label="Registration number *" error={errors.registrationNumber}>
          <input
            className="input"
            placeholder="e.g. KA 01 AB 5678"
            value={form.registrationNumber}
            onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
          />
        </Field>
        <Field label="Make">
          <input
            className="input"
            placeholder="e.g. Toyota"
            value={form.make}
            onChange={(e) => setForm({ ...form, make: e.target.value })}
          />
        </Field>
        <Field label="Model">
          <input
            className="input"
            placeholder="e.g. Corolla"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
        </Field>
        <Field label="Year">
          <input
            className="input"
            placeholder="2023"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
          />
        </Field>
        <Field label="Owner *" error={errors.ownerId}>
          <select
            className="input"
            value={form.ownerId}
            onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
          >
            <option value="">Select owner</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.email})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button onClick={submit} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Register vehicle'}
        </button>
      </div>
    </Modal>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-brand-600">{error}</p>}
    </div>
  );
}

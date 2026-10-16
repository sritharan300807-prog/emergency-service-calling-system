import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Users, Phone, ShieldAlert, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import type { EmergencyContact, Vehicle } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadingSpinner, ErrorState, EmptyState } from '@/components/StateViews';

const relations = ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Colleague', 'Guardian'];

interface ContactForm {
  name: string;
  relationship: string;
  phoneNumber: string;
  priority: number;
}

const emptyForm: ContactForm = { name: '', relationship: 'Spouse', phoneNumber: '', priority: 1 };

export function ContactsPage() {
  const { push } = useToast();
  const { canManageVehicles } = useAuth();
  const [params, setParams] = useSearchParams();
  const vehicleId = params.get('vehicle') || '';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmergencyContact | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveVehicle = vehicleId || vehicles[0]?.id || '';

  useEffect(() => {
    api<{ vehicles: Vehicle[] }>('/api/vehicles')
      .then((d) => setVehicles(d.vehicles))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!effectiveVehicle) {
      setContacts([]);
      return;
    }
    setLoading(true);
    api<{ contacts: EmergencyContact[] }>(`/api/contacts?vehicleId=${effectiveVehicle}`)
      .then((d) => {
        setContacts(d.contacts);
        setError('');
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [effectiveVehicle]);

  const sorted = useMemo(() => [...contacts].sort((a, b) => a.priority - b.priority), [contacts]);

  const save = async (form: ContactForm, existingId?: string) => {
    setSaving(true);
    try {
      if (existingId) {
        await api(`/api/contacts/${existingId}`, { method: 'PATCH', body: form });
        push('success', 'Contact updated');
      } else {
        await api('/api/contacts', {
          method: 'POST',
          body: { ...form, vehicleId: effectiveVehicle },
        });
        push('success', 'Emergency contact added');
      }
      setEditOpen(false);
      const d = await api<{ contacts: EmergencyContact[] }>(`/api/contacts?vehicleId=${effectiveVehicle}`);
      setContacts(d.contacts);
    } catch (e) {
      push('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api(`/api/contacts/${deleteTarget.id}`, { method: 'DELETE' });
      push('success', 'Contact removed');
      const d = await api<{ contacts: EmergencyContact[] }>(`/api/contacts?vehicleId=${effectiveVehicle}`);
      setContacts(d.contacts);
    } catch (e) {
      push('error', (e as Error).message);
    }
    setDeleteTarget(null);
  };

  if (loading && !vehicles.length) return <LoadingSpinner label="Loading…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Emergency Contacts</h1>
          <p className="text-sm text-slate-400">
            Registered contacts are notified when an emergency is confirmed.
          </p>
        </div>
        {canManageVehicles && effectiveVehicle && (
          <button
            onClick={() => {
              setEditOpen(true);
            }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" /> Add Contact
          </button>
        )}
      </div>

      {/* Vehicle selector */}
      <div className="rounded-xl border border-charcoal-700 bg-charcoal-850 p-4">
        <label className="label text-slate-300">Vehicle</label>
        <select
          className="w-full max-w-md rounded-lg border border-charcoal-600 bg-charcoal-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
          value={effectiveVehicle}
          onChange={(e) => {
            const value = e.target.value;
            if (value) params.set('vehicle', value);
            else params.delete('vehicle');
            setParams(params);
          }}
        >
          {vehicles.length === 0 && <option value="">No vehicles</option>}
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.registrationNumber} ({v.vehicleIdentifier})
            </option>
          ))}
        </select>
      </div>

      {!effectiveVehicle ? (
        <EmptyState title="No vehicle selected" message="Select a vehicle to manage its contacts." />
      ) : loading ? (
        <LoadingSpinner label="Loading contacts…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => api(`/api/contacts?vehicleId=${effectiveVehicle}`)} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No emergency contacts"
          message="Add a contact so they can be notified automatically after a confirmed accident."
          action={
            canManageVehicles ? (
              <button onClick={() => setEditOpen(true)} className="btn-primary">
                <Plus className="h-4 w-4" /> Add Contact
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => (
            <div key={c.id} className="card flex items-center gap-4 p-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-slate-800">{c.name}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    Priority {c.priority}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span>{c.relationship}</span>
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {c.phoneNumber}
                  </span>
                </div>
              </div>
              {canManageVehicles && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditOpen(true);
                    }}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ContactModal
        key={editOpen ? 'open' : 'closed'}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={save}
        saving={saving}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Delete emergency contact"
        message={`Remove ${deleteTarget?.name} from this vehicle's notification list?`}
        confirmLabel="Delete"
      />
    </div>
  );
}

function ContactModal({
  open,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (form: ContactForm, existingId?: string) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setErrors({});
    }
  }, [open]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.phoneNumber.trim()) e.phoneNumber = 'Phone number is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ ...form, priority: Number(form.priority) || 1 });
  };

  return (
    <Modal open={open} onClose={onClose} title="Add emergency contact">
      <div className="space-y-4">
        <div>
          <label className="label">Full name *</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Priya Sharma"
          />
          {errors.name && <p className="mt-1 text-xs text-brand-600">{errors.name}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Relationship</label>
            <select
              className="input"
              value={form.relationship}
              onChange={(e) => setForm({ ...form, relationship: e.target.value })}
            >
              {relations.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Notification priority</label>
            <select
              className="input"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
            >
              <option value={1}>1 — Highest</option>
              <option value={2}>2 — High</option>
              <option value={3}>3 — Normal</option>
              <option value={4}>4 — Low</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Phone number *</label>
          <input
            className="input"
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            placeholder="+91 91234 56789"
          />
          {errors.phoneNumber && <p className="mt-1 text-xs text-brand-600">{errors.phoneNumber}</p>}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={submit} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Add contact'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Save, Timer, BellRing, FlaskConical, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { LoadingSpinner, ErrorState } from '@/components/StateViews';

export function SettingsPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    api<{ settings: Settings }>('/api/settings')
      .then((d) => {
        setSettings(d.settings);
        setError('');
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const d = await api<{ settings: Settings }>('/api/settings', {
        method: 'PUT',
        body: {
          falseAlarmCountdownSeconds: Number(settings.falseAlarmCountdownSeconds) || 15,
          simulationMode: settings.simulationMode === 'true',
          mockNotifications: settings.mockNotifications === 'true',
        },
      });
      setSettings(d.settings);
      push('success', 'Settings saved');
    } catch (e) {
      push('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading settings…" />;
  if (error) return <ErrorState message={error} onRetry={() => setLoading(true)} />;
  if (!settings) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Settings</h1>
        <p className="text-sm text-slate-400">Configure detection, notification and simulation behavior.</p>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Timer className="h-5 w-5 text-brand-600" />
          <h2 className="font-bold text-slate-800">False-alarm countdown</h2>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="number"
            min={5}
            max={120}
            disabled={!isAdmin}
            className="input w-32"
            value={settings.falseAlarmCountdownSeconds ?? 15}
            onChange={(e) =>
              setSettings({ ...settings, falseAlarmCountdownSeconds: e.target.value })
            }
          />
          <span className="text-sm text-slate-500">seconds before a possible accident is confirmed as an emergency.</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Driver can cancel during this window (default 15s, range 5–120s).
          {!isAdmin && ' Only administrators can change this.'}
        </p>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-brand-600" />
          <h2 className="font-bold text-slate-800">Notification preferences</h2>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Mock notification service</p>
            <p className="text-xs text-slate-500">
              Simulate SMS, app push &amp; voice-call delivery in demo mode.
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              disabled={!isAdmin}
              className="peer sr-only"
              checked={settings.mockNotifications !== 'false'}
              onChange={(e) =>
                setSettings({ ...settings, mockNotifications: e.target.checked ? 'true' : 'false' })
              }
            />
            <div className="h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:bg-brand-600 peer-checked:after:translate-x-5" />
          </label>
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-brand-600" />
          <h2 className="font-bold text-slate-800">Simulation settings</h2>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <ShieldCheck className="h-4 w-4" /> Demo / Simulation Mode is active
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Sensor data is simulated and notifications are mocked. No real emergency dispatch
            occurs. This mode is ideal for demonstrating the full workflow without hardware.
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Simulate sensor data</p>
            <p className="text-xs text-slate-500">Allow the "Simulate Accident" control to create incidents.</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              disabled={!isAdmin}
              className="peer sr-only"
              checked={settings.simulationMode !== 'false'}
              onChange={(e) =>
                setSettings({ ...settings, simulationMode: e.target.checked ? 'true' : 'false' })
              }
            />
            <div className="h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:bg-brand-600 peer-checked:after:translate-x-5" />
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving || !isAdmin} className="btn-primary">
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}

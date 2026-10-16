import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  QrCode,
  Camera,
  Keyboard,
  ScanLine,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { IncidentStatusBadge } from '@/components/Badge';
import { MapView } from '@/components/MapView';

interface ScanVehicle {
  id: string;
  vehicleIdentifier: string;
  registrationNumber: string;
  qrIdentifier: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  ownerName: string;
  hasActiveIncident: boolean;
  activeIncident: { id: string; status: string; severity: string } | null;
  ownerContactVisible: boolean;
}

interface ScanResult {
  valid: boolean;
  vehicle: ScanVehicle | null;
}

const READER_ID = 'qr-reader-root';

export function QrScannerPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [mode, setMode] = useState<'camera' | 'manual'>('manual');
  const [scanning, setScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  const stopCamera = async () => {
    try {
      await scannerRef.current?.stop();
    } catch {
      // ignore
    }
    scannerRef.current = null;
    setScanning(false);
  };

const startCamera = async () => {
  if (scannerRef.current) await stopCamera();
  setResult(null);
  setError('');
  setScanning(true);

  const onDecoded = (decodedText: string) => {
    void validate(decodedText);
    void stopCamera();
  };

  // Try the rear camera first, then fall back to the default/front camera.
  const attempts: Array<{ label: string; config: MediaTrackConstraints }> = [
    { label: 'environment', config: { facingMode: 'environment' } },
    { label: 'default', config: {} },
  ];

  for (const attempt of attempts) {
    const scanner = new Html5Qrcode(READER_ID);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        attempt.config,
        { fps: 10, qrbox: { width: 240, height: 240 } },
        onDecoded,
        () => {}
      );
      return;
    } catch {
      scannerRef.current = null;
    }
  }

  setError(
    'Unable to access the camera. Allow camera permission in the browser, then try again.'
  );
  setScanning(false);
};

useEffect(() => {
  if (mode !== 'camera') return;
  // The reader div must be mounted before Html5Qrcode.start() runs, so we
  // start after React has flushed the DOM.
  const timer = setTimeout(() => {
    if (document.getElementById(READER_ID)) startCamera();
  }, 120);
  return () => {
    clearTimeout(timer);
    stopCamera();
  };
}, [mode]);

  const validate = async (qrData: string) => {
    if (!qrData.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<ScanResult>('/api/qr/validate', {
        method: 'POST',
        body: { qrIdentifier: qrData.trim() },
      });
      setResult(res);
      if (res.valid) push('success', 'Valid vehicle QR code');
    } catch (e) {
      setResult({ valid: false, vehicle: null });
      setError((e as Error).message || 'Invalid QR code');
    } finally {
      setBusy(false);
    }
  };

  const simulateScan = () => validate('VEH:veh-001:aeb4e8f9');

const switchMode = (m: 'camera' | 'manual') => {
  stopCamera();
  setResult(null);
  setError('');
  setMode(m);
};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">QR Vehicle Scanner</h1>
        <p className="text-sm text-slate-400">
          Scan a vehicle QR to validate its identity and view authorized information.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Scanner panel */}
        <div className="card p-6">
          <div className="mb-4 flex rounded-lg border border-slate-200 p-1">
            <button
              onClick={() => switchMode('manual')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                mode === 'manual' ? 'bg-charcoal-800 text-white' : 'text-slate-600'
              }`}
            >
              <Keyboard className="h-4 w-4" /> Manual Entry
            </button>
            <button
              onClick={() => switchMode('camera')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                mode === 'camera' ? 'bg-charcoal-800 text-white' : 'text-slate-600'
              }`}
            >
              <Camera className="h-4 w-4" /> Camera Scan
            </button>
          </div>

          {mode === 'camera' ? (
            <div>
              {/* Reader root stays mounted so Html5Qrcode can attach to it. */}
              <div
                id={READER_ID}
                className="overflow-hidden rounded-xl border border-slate-200"
              />
              {scanning ? (
                <button onClick={stopCamera} className="btn-secondary mt-3 w-full justify-center">
                  Stop camera
                </button>
              ) : (
                <button onClick={startCamera} className="btn-dark mt-3 w-full justify-center">
                  <Camera className="h-4 w-4" /> Start camera
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="label">Enter QR identifier</label>
                <input
                  className="input font-mono"
                  placeholder="VEH:veh-001:aeb4e8f9"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                />
              </div>
              <button
                onClick={() => validate(manualInput)}
                disabled={busy || !manualInput.trim()}
                className="btn-primary w-full justify-center"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanLine className="h-4 w-4" />
                )}
                Validate QR
              </button>
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <QrCode className="h-4 w-4" />
                <span className="flex-1">Demo QR for the seeded vehicle is preloaded.</span>
                <button onClick={simulateScan} className="font-semibold text-brand-600 hover:underline">
                  Use demo
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <XCircle className="mt-0.5 h-4 w-4" /> {error}
            </div>
          )}
        </div>

        {/* Result panel */}
        <div>
          {!result && !error && (
            <div className="card flex h-full min-h-[240px] flex-col items-center justify-center gap-3 p-8 text-center text-slate-400">
              <QrCode className="h-12 w-12" />
              <p>Scan or enter a QR code to validate and retrieve vehicle information.</p>
            </div>
          )}

          {result?.valid && result.vehicle && (
            <div className="space-y-4">
              <div className="card border-emerald-200 p-6">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-bold">Valid vehicle QR</span>
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Detail label="Registration" value={result.vehicle.registrationNumber} />
                  <Detail label="Identifier" value={result.vehicle.vehicleIdentifier} mono />
                  <Detail
                    label="Make / Model"
                    value={`${result.vehicle.make || '—'} ${result.vehicle.model || ''}`}
                  />
                  <Detail label="Year" value={result.vehicle.year ? String(result.vehicle.year) : '—'} />
                  <Detail label="Owner" value={result.vehicle.ownerName} />
                  <Detail label="Status" value={result.vehicle.status} />
                </dl>

                {result.vehicle.hasActiveIncident && result.vehicle.activeIncident && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
                      <AlertTriangle className="h-4 w-4" /> Active incident detected
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <IncidentStatusBadge status={result.vehicle.activeIncident.status as never} />
                    </div>
                  </div>
                )}
              </div>

              {result.vehicle.latitude != null && result.vehicle.longitude != null && (
                <div className="card overflow-hidden">
                  <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                    Vehicle location
                  </div>
                  <div className="h-48">
                    <MapView
                      latitude={result.vehicle.latitude}
                      longitude={result.vehicle.longitude}
                      marker="vehicle"
                    />
                  </div>
                </div>
              )}

              <div className="card p-4 text-sm">
                {user?.role === 'ADMIN' || user?.role === 'RESPONDER' || user?.role === 'OWNER' ? (
                  <p className="flex items-center gap-2 text-slate-600">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Authorized view: owner identity is visible to your role.
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-slate-500">
                    <ShieldCheck className="h-4 w-4" />
                    Sensitive owner contact details are hidden for your role.
                  </p>
                )}
              </div>
            </div>
          )}

          {result && !result.valid && (
            <div className="card flex min-h-[200px] flex-col items-center justify-center gap-3 border-red-200 p-8 text-center">
              <XCircle className="h-12 w-12 text-red-500" />
              <p className="font-semibold text-red-700">Invalid QR code</p>
              <p className="text-sm text-slate-500">No vehicle matches this identifier.</p>
            </div>
          )}
        </div>
      </div>
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

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, PhoneCall, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';

const demoCreds = [
  { role: 'Administrator', email: 'admin@emergency.local', password: 'Admin@123' },
  { role: 'Vehicle Owner', email: 'aarav@example.com', password: 'Owner@123' },
  { role: 'Emergency Contact', email: 'priya@example.com', password: 'Contact@123' },
  { role: 'Responder', email: 'responder@emergency.local', password: 'Responder@123' },
];

export function LoginPage() {
  const { login } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@emergency.local');
  const [password, setPassword] = useState('Admin@123');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      push('success', 'Signed in successfully');
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const fill = (email: string, password: string) => {
    setEmail(email);
    setPassword(password);
    setError('');
  };

  return (
    <div className="min-h-screen bg-charcoal-900 flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between bg-navy p-12 relative overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-700/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div>
            <p className="text-lg font-extrabold text-white">AutoSafe</p>
            <p className="text-xs text-slate-400">Emergency Response Platform</p>
          </div>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-extrabold leading-tight text-white">
            Automatic car accident detection
            <span className="text-brand-400"> &amp; emergency calling.</span>
          </h1>
          <p className="mt-4 max-w-md text-slate-300">
            A full-stack prototype that detects possible collisions from sensor data, runs a
            false-alarm countdown, and notifies registered emergency contacts in real time.
          </p>
          <div className="mt-8 space-y-3">
            {[
              'Multi-input accident detection engine',
              '15-second false-alarm cancellation window',
              'Live emergency dashboard & incident history',
              'QR vehicle identification & role-based access',
            ].map((f) => (
              <div key={f} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <PhoneCall className="h-3 w-3" />
                </span>
                {f}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-500">
          Demo / Simulation Mode — no real emergency dispatch is performed.
        </p>
      </div>

      {/* Right login panel */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden flex items-center gap-2 justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <p className="text-xl font-extrabold text-white">AutoSafe</p>
          </div>

          <div className="rounded-2xl bg-charcoal-850 border border-charcoal-700 p-8">
            <h2 className="text-xl font-bold text-white">Sign in</h2>
            <p className="mt-1 text-sm text-slate-400">
              Access the emergency command center
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="label text-slate-300">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-charcoal-600 bg-charcoal-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label className="label text-slate-300">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-charcoal-600 bg-charcoal-800 px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    aria-label="Toggle password visibility"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-brand-700 bg-brand-900/40 px-3 py-2 text-sm text-brand-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-danger w-full py-2.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>

          <div className="mt-6 rounded-2xl bg-charcoal-850 border border-charcoal-700 p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Demo accounts — click to autofill
            </p>
            <div className="grid grid-cols-1 gap-2">
              {demoCreds.map((c) => (
                <button
                  key={c.role}
                  onClick={() => fill(c.email, c.password)}
                  className="flex items-center justify-between rounded-lg border border-charcoal-700 bg-charcoal-800 px-3 py-2 text-left hover:border-brand-600"
                >
                  <span className="text-sm font-medium text-slate-200">{c.role}</span>
                  <span className="text-xs text-slate-500">{c.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

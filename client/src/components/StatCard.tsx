import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  icon,
  tone = 'default',
  sub,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: 'default' | 'danger' | 'success' | 'info' | 'warning';
  sub?: string;
}) {
  const iconTones: Record<string, string> = {
    default: 'bg-slate-100 text-slate-600',
    danger: 'bg-red-100 text-red-600',
    success: 'bg-emerald-100 text-emerald-600',
    info: 'bg-blue-100 text-blue-600',
    warning: 'bg-amber-100 text-amber-600',
  };
  const valueTones: Record<string, string> = {
    default: 'text-slate-900',
    danger: 'text-red-600',
    success: 'text-emerald-600',
    info: 'text-blue-600',
    warning: 'text-amber-600',
  };
  return (
    <div className="card flex items-start gap-4 p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconTones[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 text-2xl font-bold leading-none ${valueTones[tone]}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

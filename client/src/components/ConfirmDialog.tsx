import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Modal } from './Modal';

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'success' | 'default';
  busy?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const toneClass =
    tone === 'success' ? 'btn bg-emerald-600 text-white hover:bg-emerald-700'
    : tone === 'default' ? 'btn-dark'
    : 'btn-danger';

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center text-center">
        <div
          className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${
            tone === 'danger' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <TriangleAlert className="h-6 w-6" />
        </div>
        <p className="text-sm text-slate-600">{message}</p>
        <div className="mt-5 flex w-full gap-3">
          <button onClick={onClose} disabled={loading} className="btn-secondary flex-1">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={loading} className={`${toneClass} flex-1`}>
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

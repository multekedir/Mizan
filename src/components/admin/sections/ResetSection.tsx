import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { db } from '../../../db/database';

export function ResetSection() {
  const [confirm, setConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    setResetting(true);
    await db.delete();
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6">
        <div className="flex items-start gap-4">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-500" strokeWidth={2} />
          <div>
            <p className="font-semibold text-mizan-text">This will permanently delete:</p>
            <ul className="mt-2 space-y-1 text-sm text-mizan-textMuted">
              <li>• All tasks (past and future)</li>
              <li>• All goals and progress</li>
              <li>• All family members</li>
              <li>• All settings and prayer configuration</li>
              <li>• Cached calendar data</li>
            </ul>
            <p className="mt-3 text-sm font-medium text-red-500">There is no undo.</p>
          </div>
        </div>
      </div>

      {!confirm ? (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-red-500/40 bg-red-500/10 px-6 py-4 text-base font-semibold text-red-500 transition-all hover:bg-red-500/20 active:scale-95"
        >
          <Trash2 className="h-5 w-5" strokeWidth={2} />
          Reset All Data
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-sm font-medium text-mizan-textMuted">
            Tap the button below to confirm. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-red-500 px-6 py-4 text-base font-bold text-white transition-all hover:bg-red-600 active:scale-95 disabled:opacity-60"
          >
            <Trash2 className="h-5 w-5" strokeWidth={2.5} />
            {resetting ? 'Resetting…' : 'Yes, delete everything and restart'}
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="w-full rounded-2xl bg-mizan-surfaceSoft px-6 py-3 text-sm font-semibold text-mizan-text transition-all hover:bg-mizan-surface active:scale-95"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

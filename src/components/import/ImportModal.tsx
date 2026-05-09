import { useRef, useState } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { useGoalStore } from '../../stores/goalStore';
import { GoogleAuthPanel } from './GoogleAuthPanel';

type Tab = 'tasks-json' | 'goals-json' | 'google';

interface Props {
  open: boolean;
  onClose: () => void;
}

const LONG_MS = 550;

const TAB_LABELS: [Tab, string][] = [
  ['tasks-json', 'Tasks'],
  ['goals-json', 'Goals'],
  ['google', 'Google'],
];

const TAB_HINT: Record<Tab, string> = {
  'tasks-json':
    'Paste a JSON array or the full assistant response. Supported fields: title, assignee, frequency (once/daily/weekly/monthly), day (e.g. Saturday), time, duration. Duplicate titles are skipped.',
  'goals-json':
    'Paste { "goals": [...] } or a flat array. Supported fields: title, date (YYYY-MM-DD), assignee, category, isRecurring. Each goal appears only on its date; re-importing the same title updates it without duplicating.',
  'google': '',
};

export function ImportModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('tasks-json');
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const importTaskJson = useTaskStore((s) => s.importFromJson);
  const importGoalJson = useGoalStore((s) => s.importFromJson);

  async function submit() {
    setMessage(null);
    let res: { ok: boolean; count?: number; error?: string };
    if (tab === 'tasks-json') {
      res = await importTaskJson(text);
    } else if (tab === 'goals-json') {
      res = await importGoalJson(text);
    } else {
      return;
    }
    if (res.ok) {
      setMessage(res.count !== undefined ? `Imported ${res.count} item${res.count === 1 ? '' : 's'}.` : 'Imported.');
      setText('');
    } else {
      setMessage(res.error ?? 'Import failed.');
    }
  }

  if (!open) return null;

  const googleConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 md:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="import-title"
    >
      <div className="kiosk-allow-select card-mizan text-mizan-text max-h-[88vh] w-full max-w-lg overflow-hidden shadow-xl">
        <div className="flex items-center justify-between border-b border-mizan-surfaceSoft px-4 py-3">
          <h2 id="import-title" className="text-lg font-bold">
            Import
          </h2>
          <button
            type="button"
            className="rounded-lg px-3 py-1 text-sm font-semibold opacity-70 hover:opacity-100"
            onClick={() => {
              setMessage(null);
              onClose();
            }}
          >
            Close
          </button>
        </div>

        <div className="flex gap-1 border-b border-mizan-surfaceSoft px-2 py-2 text-sm">
          {TAB_LABELS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`rounded-full px-4 py-1.5 font-medium ${
                tab === id
                  ? 'bg-mizan-accent text-mizan-textOnDark'
                  : 'bg-mizan-bg opacity-80'
              }`}
              onClick={() => {
                setMessage(null);
                setTab(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[min(56vh,480px)] overflow-y-auto p-4">
          {tab === 'google' ? (
            googleConfigured ? (
              <GoogleAuthPanel />
            ) : (
              <p className="text-sm opacity-70">
                Add <code className="text-xs">VITE_GOOGLE_CLIENT_ID</code> to your{' '}
                <code className="text-xs">.env</code> file.
              </p>
            )
          ) : (
            <>
              <p className="text-mizan-text/60 mb-3 text-xs leading-relaxed">
                {TAB_HINT[tab]}
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="border-mizan-surfaceSoft bg-mizan-bg focus:ring-mizan-success min-h-[200px] w-full rounded-2xl border p-3 font-mono text-xs outline-none focus:ring-2"
                placeholder="Paste JSON here…"
              />
              <button
                type="button"
                className="bg-mizan-success text-mizan-textOnDark mt-3 w-full rounded-2xl py-3 font-semibold"
                onClick={() => void submit()}
              >
                Import
              </button>
            </>
          )}
        </div>

        {message ? (
          <p
            className={`border-t border-mizan-surfaceSoft px-4 py-2 text-center text-sm font-medium ${
              message.startsWith('Imported') ? 'text-green-700' : 'text-red-600'
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Long-press bottom-right corner to open import (touch-first kiosk). */
export function ImportCornerTrigger({ onOpen }: { onOpen: () => void }) {
  const timer = useRef<number | undefined>(undefined);

  function clear() {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
  }

  function start() {
    clear();
    timer.current = window.setTimeout(() => {
      onOpen();
      clear();
    }, LONG_MS);
  }

  return (
    <button
      type="button"
      aria-label="Hold to open import"
      className="fixed bottom-2 right-2 z-40 h-14 w-14 cursor-pointer opacity-[0.03] hover:opacity-10"
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
    />
  );
}

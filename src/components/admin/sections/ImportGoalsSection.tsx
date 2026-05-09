import { useState } from 'react';
import { useGoalStore } from '../../../stores/goalStore';
import { StatusMsg } from '../shared';

const PLACEHOLDER = `{
  "goals": [
    {
      "id": "goal-001",
      "date": "2026-05-04",
      "title": "5 minutes of quiet Dhikr after Fajr",
      "assignee": "Both",
      "category": "iman",
      "isRecurring": false
    }
  ]
}`;

export function ImportGoalsSection() {
  const importJson = useGoalStore((s) => s.importFromJson);
  const importCsv = useGoalStore((s) => s.importFromCsv);
  const clearToday = useGoalStore((s) => s.clearToday);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function run(fn: (t: string) => Promise<{ ok: boolean; count?: number; error?: string }>) {
    setMsg(null);
    const res = await fn(text);
    if (res.ok) {
      setMsg(res.count !== undefined ? `Imported ${res.count} item${res.count === 1 ? '' : 's'}.` : 'Imported.');
      setText('');
    } else {
      setMsg(res.error ?? 'Import failed.');
    }
  }

  async function clear() {
    await clearToday();
    setMsg('Cleared.');
  }

  return (
    <div>
      <p className="mb-3 text-xs leading-relaxed text-mizan-text/50">
        Paste <code className="font-mono">{'{ "goals": [...] }'}</code> with fields{' '}
        <code className="font-mono">date, title, assignee, category, isRecurring</code>. Each goal appears only on
        its designated date.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="kiosk-allow-select min-h-[200px] w-full rounded-2xl border border-mizan-surfaceSoft bg-mizan-bg p-4 font-mono text-xs outline-none focus:ring-2 focus:ring-mizan-success"
        placeholder={PLACEHOLDER}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void run(importJson)}
          className="rounded-2xl bg-mizan-success px-5 py-3 font-semibold text-mizan-textOnDark active:scale-95"
        >
          Import JSON
        </button>
        <button
          type="button"
          onClick={() => void run(importCsv)}
          className="rounded-2xl bg-mizan-surfaceSoft px-5 py-3 font-semibold text-mizan-text active:scale-95"
        >
          Import CSV
        </button>
        <button
          type="button"
          onClick={() => void clear()}
          className="ml-auto rounded-2xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-400 active:scale-95"
        >
          Clear Today
        </button>
      </div>
      <StatusMsg msg={msg} />
    </div>
  );
}

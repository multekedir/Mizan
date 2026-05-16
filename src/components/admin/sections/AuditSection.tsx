import { useState, useEffect, useCallback } from 'react';
import { db, type AuditLogRow } from '../../../db/database';

const ENTITY_LABEL: Record<AuditLogRow['entity'], string> = {
  person: 'Person',
  task: 'Task',
  goal: 'Goal',
};

const ENTITY_COLOR: Record<AuditLogRow['entity'], string> = {
  person: 'text-mizan-personRiver',
  task: 'text-mizan-personFern',
  goal: 'text-mizan-personPlum',
};

export function AuditSection() {
  const [entries, setEntries] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await db.auditLog.orderBy('ts').reverse().limit(100).toArray();
    setEntries(rows);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <p className="text-sm text-mizan-text/50">Loading…</p>;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-mizan-text/50">No activity recorded yet.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-start gap-3 rounded-2xl bg-mizan-surfaceSoft/40 px-4 py-3"
        >
          <span
            className={`mt-0.5 text-xs font-bold uppercase tracking-wider ${ENTITY_COLOR[e.entity]}`}
          >
            {ENTITY_LABEL[e.entity]}
          </span>
          <span
            className={`text-sm font-semibold ${
              e.action === 'add' ? 'text-mizan-success' : 'text-red-500'
            }`}
          >
            {e.action === 'add' ? '+' : '−'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-mizan-text truncate">{e.title}</p>
            {e.assignee && (
              <p className="text-xs text-mizan-text/50">{e.assignee}</p>
            )}
          </div>
          <span className="shrink-0 text-xs text-mizan-text/40">
            {new Date(e.ts).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

import { create } from 'zustand';
import { db, type TaskRow } from '../db/database';
import { getLogicalDayKey, firstOccurrenceKey } from '../lib/logicalDay';
import { parseBool } from '../lib/parseBool';
import { useGoalStore } from './goalStore';

interface TaskState {
  tasks: TaskRow[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addTask: (title: string, assignee: string, recurring?: boolean, schedule?: string, time?: string, duration?: string, logicalDayKey?: string, goalId?: string) => Promise<void>;
  editTask: (id: string, title: string, assignee: string, time?: string, duration?: string, goalId?: string | null, recurring?: boolean, schedule?: string | null) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  moveToNextDay: (id: string) => Promise<void>;
  importFromJson: (raw: string) => Promise<{ ok: boolean; count?: number; error?: string }>;
  importFromCsv: (raw: string) => Promise<{ ok: boolean; count?: number; error?: string }>;
  toggleComplete: (id: string) => Promise<void>;
  clearToday: () => Promise<void>;
}

const _DAY_NAME: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function _scheduleFor(freq: string, day?: string): string | undefined {
  if (freq === 'daily') return 'daily';
  if (freq === 'weekly') {
    const n = day ? _DAY_NAME[day.toLowerCase()] : undefined;
    return `weekly:${n ?? 0}`;
  }
  if (freq === 'monthly') {
    const match = day?.match(/^(\d+)/);
    return `monthly:${match?.[1] ?? '1'}`;
  }
  return undefined;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  hydrated: false,

  hydrate: async () => {
    const key = getLogicalDayKey();
    const rows = await db.tasks.where('logicalDayKey').equals(key).sortBy('sortOrder');
    set({ tasks: rows, hydrated: true });
  },

  addTask: async (title, assignee, recurring = false, schedule?, time?, duration?, logicalDayKey?, goalId?) => {
    const key = logicalDayKey ?? (recurring ? firstOccurrenceKey(schedule) : getLogicalDayKey());
    const order = await db.tasks.where('logicalDayKey').equals(key).count();
    await db.tasks.put({
      id: crypto.randomUUID(),
      title: title.trim(),
      assignee: assignee.trim() || 'Family',
      recurring,
      schedule: recurring ? (schedule ?? 'daily') : undefined,
      time: time || undefined,
      duration: duration || undefined,
      goalId: goalId || undefined,
      completed: false,
      logicalDayKey: key,
      sortOrder: order + 1,
    });
    await get().hydrate();
  },

  editTask: async (id, title, assignee, time?, duration?, goalId?, recurring?, schedule?) => {
    const patch: Partial<import('../db/database').TaskRow> = {
      title: title.trim(),
      assignee: assignee.trim() || 'Family',
      time: time || undefined,
      duration: duration || undefined,
    };
    if (goalId !== undefined) patch.goalId = goalId === null ? undefined : goalId;
    if (recurring !== undefined) patch.recurring = recurring;
    // null = clear schedule (task became non-recurring); string = set new schedule
    if (schedule !== undefined) patch.schedule = schedule === null ? undefined : schedule;
    await db.tasks.update(id, patch);
    if (goalId !== undefined) void useGoalStore.getState().refreshProgress();
    await get().hydrate();
  },

  deleteTask: async (id) => {
    const row = await db.tasks.get(id);
    await db.tasks.delete(id);
    await get().hydrate();
    if (row?.goalId) void useGoalStore.getState().refreshProgress();
  },

  moveToNextDay: async (id) => {
    const row = await db.tasks.get(id);
    if (!row) return;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    const tomorrowKey = getLogicalDayKey(tomorrow);
    if (row.recurring) {
      await db.tasks.update(id, { logicalDayKey: tomorrowKey, completed: false });
    } else {
      await db.tasks.update(id, { logicalDayKey: tomorrowKey });
    }
    await get().hydrate();
  },

  importFromJson: async (raw) => {
    try {
      const data = JSON.parse(raw) as unknown;

      let items: unknown[];
      if (Array.isArray(data)) {
        items = data;
      } else if (
        data &&
        typeof data === 'object' &&
        'tasks' in data &&
        Array.isArray((data as Record<string, unknown>).tasks)
      ) {
        items = (data as { tasks: unknown[] }).tasks;
      } else {
        return { ok: false, error: 'Expected a JSON array or { "tasks": [...] } object.' };
      }

      const todayKey = getLogicalDayKey();

      // Collect all logical day keys this import will touch.
      const allKeys = new Set<string>();
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const freq = String(o.frequency ?? '').toLowerCase();
        const recurring = freq ? freq !== 'once' : parseBool(o.recurring ?? false);
        const schedule = recurring ? _scheduleFor(freq || 'daily', o.day ? String(o.day) : undefined) : undefined;
        allKeys.add(schedule ? firstOccurrenceKey(schedule) : todayKey);
      }

      // Build per-key title sets from existing DB rows (for dedup).
      const existingTitles = new Map<string, Set<string>>();
      for (const key of allKeys) {
        const rows = await db.tasks.where('logicalDayKey').equals(key).toArray();
        existingTitles.set(key, new Set(rows.map((r) => r.title)));
      }

      const orderMap: Record<string, number> = {};
      for (const key of allKeys) {
        orderMap[key] = existingTitles.get(key)!.size;
      }

      let count = 0;
      await db.transaction('rw', db.tasks, async () => {
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const o = item as Record<string, unknown>;

          const title = String(o.title ?? '').trim();
          if (!title) continue;

          const assignee = String(o.assignee ?? 'Family').trim() || 'Family';
          const freq = String(o.frequency ?? '').toLowerCase();
          const recurring = freq ? freq !== 'once' : parseBool(o.recurring ?? false);
          const schedule = recurring
            ? _scheduleFor(freq || 'daily', o.day ? String(o.day) : undefined)
            : undefined;
          const time = o.time ? String(o.time).trim() || undefined : undefined;
          const duration = o.duration ? String(o.duration).trim() || undefined : undefined;
          const goalId = o.goalId ? String(o.goalId).trim() || undefined : undefined;
          const logicalDayKey = schedule ? firstOccurrenceKey(schedule) : todayKey;

          const seen = existingTitles.get(logicalDayKey) ?? new Set<string>();
          if (seen.has(title)) continue;

          orderMap[logicalDayKey] = (orderMap[logicalDayKey] ?? 0) + 1;
          await db.tasks.put({
            id: crypto.randomUUID(),
            title,
            assignee,
            recurring,
            schedule: schedule ?? undefined,
            time: time ?? undefined,
            duration: duration ?? undefined,
            goalId,
            completed: false,
            logicalDayKey,
            sortOrder: orderMap[logicalDayKey],
          });
          seen.add(title);
          existingTitles.set(logicalDayKey, seen);
          count++;
        }
      });

      await get().hydrate();
      return { ok: true, count };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Import failed.' };
    }
  },

  importFromCsv: async (raw) => {
    try {
      const lines = raw
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) return { ok: false, error: 'Need a header row and one data row.' };
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const ti = header.indexOf('title');
      const ai = header.indexOf('assignee');
      const ri = header.indexOf('recurring');
      if (ti < 0) return { ok: false, error: 'CSV must include a title column.' };
      const key = getLogicalDayKey();
      let order = (await db.tasks.where('logicalDayKey').equals(key).count()) ?? 0;
      let count = 0;
      await db.transaction('rw', db.tasks, async () => {
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim());
          const title = (cols[ti] ?? '').trim();
          if (!title) continue;
          const assignee = ai >= 0 ? (cols[ai] ?? '').trim() || 'Family' : 'Family';
          const recurring = ri >= 0 ? parseBool(cols[ri] ?? false) : false;
          order += 1;
          count++;
          await db.tasks.put({
            id: crypto.randomUUID(),
            title,
            assignee,
            recurring,
            completed: false,
            logicalDayKey: key,
            sortOrder: order,
          });
        }
      });
      await get().hydrate();
      return { ok: true, count };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Import failed.' };
    }
  },

  toggleComplete: async (id) => {
    const row = await db.tasks.get(id);
    if (!row) return;
    const nowComplete = !row.completed;
    await db.tasks.update(id, { completed: nowComplete });
    await get().hydrate();
    if (row.goalId) {
      void useGoalStore.getState().refreshProgress();
      if (nowComplete) {
        const goal = await db.goals.get(row.goalId);
        if (goal) {
          const { useCelebrationStore } = await import('./celebrationStore');
          useCelebrationStore.getState().show(goal.title, row.title, goal.category);
        }
      }
    }
    // Keep completed tasks on today's board (strikethrough). Daily reset clones recurring
    // tasks into the new day; users can still use "move to tomorrow" if we expose it later.
  },

  clearToday: async () => {
    const key = getLogicalDayKey();
    await db.tasks.where('logicalDayKey').equals(key).delete();
    await get().hydrate();
  },
}));

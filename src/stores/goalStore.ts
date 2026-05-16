import { create } from 'zustand';
import { db, writeAudit, type GoalRow } from '../db/database';
import { categoryKeyFromImport, inferCategoryKey, type CategoryKey } from '../lib/categories';
import { getLogicalDayKey } from '../lib/logicalDay';
import { parseBool } from '../lib/parseBool';

export interface GoalProgress {
  total: number;
  completed: number;
}

interface GoalState {
  goals: GoalRow[];
  goalProgress: Record<string, GoalProgress>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  refreshProgress: () => Promise<void>;
  addGoal: (title: string, assignee?: string, recurring?: boolean, category?: CategoryKey) => Promise<string>;
  deleteGoal: (id: string) => Promise<void>;
  clearToday: () => Promise<void>;
  importFromJson: (raw: string) => Promise<{ ok: boolean; count?: number; error?: string }>;
  importFromCsv: (raw: string) => Promise<{ ok: boolean; count?: number; error?: string }>;
  toggleComplete: (id: string) => Promise<void>;
}

export const useGoalStore = create<GoalState>((set, get) => ({
  goals: [],
  goalProgress: {},
  hydrated: false,

  hydrate: async () => {
    const key = getLogicalDayKey();
    const rows = await db.goals.where('logicalDayKey').equals(key).sortBy('sortOrder');

    // Compute progress for goals that have IDs
    const goalIds = rows.map((g) => g.id).filter(Boolean);
    const progress: Record<string, GoalProgress> = {};
    if (goalIds.length > 0) {
      const linkedTasks = await db.tasks
        .where('goalId')
        .anyOf(goalIds)
        .toArray();
      for (const goalId of goalIds) {
        const linked = linkedTasks.filter((t) => t.goalId === goalId);
        progress[goalId] = { total: linked.length, completed: linked.filter((t) => t.completed).length };
      }
    }

    set({ goals: rows, goalProgress: progress, hydrated: true });
  },

  refreshProgress: async () => {
    const { goals } = get();
    const goalIds = goals.map((g) => g.id).filter(Boolean);
    if (!goalIds.length) return;
    const linkedTasks = await db.tasks.where('goalId').anyOf(goalIds).toArray();
    const progress: Record<string, GoalProgress> = {};
    for (const goalId of goalIds) {
      const linked = linkedTasks.filter((t) => t.goalId === goalId);
      progress[goalId] = { total: linked.length, completed: linked.filter((t) => t.completed).length };
    }
    set({ goalProgress: progress });
  },

  addGoal: async (title, assignee, recurring = true, categoryOverride) => {
    const key = getLogicalDayKey();
    const order = await db.goals.where('logicalDayKey').equals(key).count();
    const id = crypto.randomUUID();
    const cleanTitle = title.trim();
    const finalAssignee = assignee?.trim() || undefined;
    await db.goals.put({
      id,
      title: cleanTitle,
      assignee: finalAssignee,
      category: categoryOverride ?? inferCategoryKey(title),
      recurring,
      completed: false,
      logicalDayKey: key,
      sortOrder: order + 1,
    });
    await writeAudit('add', 'goal', cleanTitle, finalAssignee);
    await get().hydrate();
    return id;
  },

  deleteGoal: async (id) => {
    const row = await db.goals.get(id);
    await db.goals.delete(id);
    if (row) await writeAudit('remove', 'goal', row.title, row.assignee);
    // Clear goalId from any tasks that were linked to this goal
    const linked = await db.tasks.where('goalId').equals(id).toArray();
    for (const t of linked) await db.tasks.update(t.id, { goalId: undefined });
    await get().hydrate();
  },

  clearToday: async () => {
    const key = getLogicalDayKey();
    await db.goals.where('logicalDayKey').equals(key).delete();
    await get().hydrate();
  },

  importFromJson: async (raw) => {
    try {
      const parsed = JSON.parse(raw) as unknown;

      let items: unknown[];
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (
        parsed &&
        typeof parsed === 'object' &&
        'goals' in parsed &&
        Array.isArray((parsed as Record<string, unknown>).goals)
      ) {
        items = (parsed as { goals: unknown[] }).goals;
      } else {
        return { ok: false, error: 'Expected a JSON array or { "goals": [...] } object.' };
      }

      // Collect all unique dates referenced by this import.
      const allDates = new Set<string>();
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const date =
          o.date && typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date)
            ? o.date
            : getLogicalDayKey();
        allDates.add(date);
      }

      // Build per-date title → GoalRow map from existing DB rows (for dedup).
      const existingByDateTitle = new Map<string, Map<string, GoalRow>>();
      for (const dateKey of allDates) {
        const rows = await db.goals.where('logicalDayKey').equals(dateKey).toArray();
        const byTitle = new Map<string, GoalRow>();
        for (const g of rows) byTitle.set(g.title, g);
        existingByDateTitle.set(dateKey, byTitle);
      }

      const orderMap: Record<string, number> = {};
      for (const dateKey of allDates) {
        orderMap[dateKey] = existingByDateTitle.get(dateKey)!.size;
      }

      let count = 0;
      await db.transaction('rw', db.goals, async () => {
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const o = item as Record<string, unknown>;

          const title = String(o.title ?? '').trim();
          if (!title) continue;

          const recurring = parseBool(o.recurring ?? o.isRecurring ?? false);
          const logicalDayKey =
            o.date && typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date)
              ? o.date
              : getLogicalDayKey();
          const assignee = o.assignee ? String(o.assignee).trim() : undefined;
          const category = categoryKeyFromImport(o.category);

          const byTitle = existingByDateTitle.get(logicalDayKey)!;
          const existing = byTitle.get(title);

          if (existing) {
            await db.goals.update(existing.id, { assignee, category, recurring });
          } else {
            orderMap[logicalDayKey]++;
            count++;
            const newId = crypto.randomUUID();
            const completed = parseBool(o.completed ?? false);
            await db.goals.put({
              id: newId,
              title,
              assignee,
              category,
              recurring,
              completed,
              logicalDayKey,
              sortOrder: orderMap[logicalDayKey],
            });
            byTitle.set(title, {
              id: newId,
              title,
              assignee,
              category,
              logicalDayKey,
              recurring,
              completed,
              sortOrder: orderMap[logicalDayKey],
            });
          }
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
      const ri = header.indexOf('recurring');
      const di = header.indexOf('date');
      const ai = header.indexOf('assignee');
      const ci = header.indexOf('category');
      if (ti < 0) return { ok: false, error: 'CSV must include a title column.' };

      let count = 0;
      await db.transaction('rw', db.goals, async () => {
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim());
          const title = (cols[ti] ?? '').trim();
          if (!title) continue;
          const recurring = ri >= 0 ? parseBool(cols[ri] ?? false) : false;
          const logicalDayKey =
            di >= 0 && cols[di]?.match(/^\d{4}-\d{2}-\d{2}$/)
              ? cols[di]
              : getLogicalDayKey();
          const order = await db.goals.where('logicalDayKey').equals(logicalDayKey).count();
          count++;
          await db.goals.put({
            id: crypto.randomUUID(),
            title,
            assignee: ai >= 0 ? (cols[ai] ?? '').trim() || undefined : undefined,
            category: ci >= 0 ? categoryKeyFromImport((cols[ci] ?? '').trim()) : undefined,
            recurring,
            completed: false,
            logicalDayKey,
            sortOrder: order + 1,
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
    const row = await db.goals.get(id);
    if (!row) return;
    await db.goals.update(id, { completed: !row.completed });
    await get().hydrate();
  },
}));

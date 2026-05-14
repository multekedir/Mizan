import { toZonedTime } from 'date-fns-tz';
import { db } from '../db/database';
import { getLogicalDayKey, getTimezone } from './logicalDay';
import type { TaskRow, GoalRow } from '../db/database';

function newId(): string {
  return crypto.randomUUID();
}

function keyToUtcDays(key: string): number {
  // key is YYYY-MM-DD in the app timezone; treat it as a pure calendar day.
  const [yy, mm, dd] = key.split('-').map((x) => parseInt(x, 10));
  if (!yy || !mm || !dd) return 0;
  return Math.floor(Date.UTC(yy, mm - 1, dd) / 86_400_000);
}

function monthsSince(anchorKey: string, currentKey: string): number {
  const [ay, am] = anchorKey.split('-').map((x) => parseInt(x, 10));
  const [cy, cm] = currentKey.split('-').map((x) => parseInt(x, 10));
  if (!ay || !am || !cy || !cm) return 0;
  return (cy - ay) * 12 + (cm - am);
}

function isValidDayOfWeek(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function isValidMonthDay(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 31;
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Returns true if a recurring task/goal should appear on the given zoned date.
 *
 * "daily"          → always
 * "weekly:N"       → only when getDay() === N
 * "weekly2:A:B"    → only when getDay() === A or B
 * "monthly:N"      → monthly on N, clamped to last day of shorter months
 * "interval:days:N"
 * "interval:weeks:N"
 * "interval:months:N"
 * undefined        → treated as "daily"
 */
export function shouldAppearToday(
  schedule: string | undefined,
  anchorLogicalDayKey: string,
  zonedNow: Date,
): boolean {
  const s = schedule ?? 'daily';
  const currentKey = getLogicalDayKey(zonedNow);

  if (s === 'daily') return true;

  if (s.startsWith('weekly:')) {
    const targetDay = Number.parseInt(s.slice(7), 10);
    if (!isValidDayOfWeek(targetDay)) return false;

    return zonedNow.getDay() === targetDay;
  }

  if (s.startsWith('weekly2:')) {
    const parts = s.split(':');
    const a = Number.parseInt(parts[1] ?? '', 10);
    const b = Number.parseInt(parts[2] ?? '', 10);

    if (!isValidDayOfWeek(a) || !isValidDayOfWeek(b)) {
      return false;
    }

    const dow = zonedNow.getDay();
    return dow === a || dow === b;
  }

  if (s.startsWith('monthly:')) {
    const targetDate = Number.parseInt(s.slice(8), 10);
    if (!isValidMonthDay(targetDate)) return false;

    const effectiveDate = Math.min(targetDate, daysInMonth(zonedNow));
    return zonedNow.getDate() === effectiveDate;
  }

  if (s.startsWith('interval:')) {
    const parts = s.split(':');
    const unit = parts[1] ?? '';
    const n = Math.max(1, Number.parseInt(parts[2] ?? '1', 10) || 1);

    const diffDays = keyToUtcDays(currentKey) - keyToUtcDays(anchorLogicalDayKey);

    if (diffDays < 0) return false;

    if (unit === 'days') {
      return diffDays % n === 0;
    }

    if (unit === 'weeks') {
      return diffDays % (n * 7) === 0;
    }

    if (unit === 'months') {
      const diffMonths = monthsSince(anchorLogicalDayKey, currentKey);
      const [, , anchorDayRaw] = anchorLogicalDayKey.split('-');
      const anchorDay = Number.parseInt(anchorDayRaw ?? '', 10);

      if (!isValidMonthDay(anchorDay)) return false;

      const effectiveDate = Math.min(anchorDay, daysInMonth(zonedNow));

      return (
        diffMonths >= 0 &&
        diffMonths % n === 0 &&
        zonedNow.getDate() === effectiveDate
      );
    }

    return false;
  }

  return true;
}

/**
 * At 4:00 AM America/Los_Angeles boundaries:
 * - Non-recurring old tasks are deleted.
 * - Daily recurring tasks are cloned into the new day.
 * - Weekly recurring tasks on their target day are cloned.
 * - Weekly recurring tasks on the WRONG day are left in the DB untouched
 *   (hidden from today's view by logicalDayKey, surfaced on their correct day).
 */
export async function runDailyResetIfNeeded(): Promise<void> {
  const currentKey = getLogicalDayKey();
  const metaRow = await db.meta.get('lastResetLogicalDayKey');
  if (metaRow?.value === currentKey) return;

  const zonedNow = toZonedTime(new Date(), getTimezone());
  const allTasks = await db.tasks.toArray();
  const allGoals = await db.goals.toArray();

  // Titles already in today to prevent duplicates
  const todayTaskTitles = new Set(
    allTasks
      .filter((t) => t.logicalDayKey === currentKey)
      .map((t) => t.title.toLowerCase().trim()),
  );
  const todayGoalTitles = new Set(
    allGoals
      .filter((g) => g.logicalDayKey === currentKey)
      .map((g) => g.title.toLowerCase().trim()),
  );

  await db.transaction('rw', db.tasks, db.goals, db.meta, async () => {
    for (const t of allTasks) {
      if (t.logicalDayKey === currentKey) continue;

      if (!t.recurring) {
        await db.tasks.delete(t.id);
        continue;
      }

      const taskAnchor = t.anchorLogicalDayKey ?? t.logicalDayKey;
      if (!shouldAppearToday(t.schedule, taskAnchor, zonedNow)) {
        // Wrong day for this weekly task — leave it in DB, do not clone
        continue;
      }

      // Correct day (or daily): move to today, preserving the original anchor
      await db.tasks.delete(t.id);
      const titleKey = t.title.toLowerCase().trim();
      if (!todayTaskTitles.has(titleKey)) {
        todayTaskTitles.add(titleKey);
        const cloned: TaskRow = {
          ...t,
          id: newId(),
          logicalDayKey: currentKey,
          anchorLogicalDayKey: taskAnchor,
          completed: false,
        };
        await db.tasks.add(cloned);
      }
    }

    for (const g of allGoals) {
      if (g.logicalDayKey === currentKey) continue;

      if (!g.recurring) {
        await db.goals.delete(g.id);
        continue;
      }

      const goalAnchor = g.anchorLogicalDayKey ?? g.logicalDayKey;
      if (!shouldAppearToday(g.schedule as string | undefined, goalAnchor, zonedNow)) {
        continue;
      }

      await db.goals.delete(g.id);
      const titleKey = g.title.toLowerCase().trim();
      if (!todayGoalTitles.has(titleKey)) {
        todayGoalTitles.add(titleKey);
        const cloned: GoalRow = {
          ...g,
          id: newId(),
          logicalDayKey: currentKey,
          anchorLogicalDayKey: goalAnchor,
          completed: false,
        };
        await db.goals.add(cloned);
      }
    }

    await db.meta.put({ key: 'lastResetLogicalDayKey', value: currentKey });
  });
}

export async function ensureResetMeta(): Promise<void> {
  const row = await db.meta.get('lastResetLogicalDayKey');
  if (!row) {
    await db.meta.put({ key: 'lastResetLogicalDayKey', value: getLogicalDayKey() });
  }
}

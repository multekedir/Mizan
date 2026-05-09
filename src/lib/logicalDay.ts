import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const TIMEZONE = 'America/Los_Angeles';
const RESET_HOUR = 4;

/** YYYY-MM-DD key for the "logical day" that starts at 4:00 AM local. */
export function getLogicalDayKey(date: Date = new Date()): string {
  const zoned = toZonedTime(date, TIMEZONE);
  const y = zoned.getFullYear();
  const m = zoned.getMonth();
  const d = zoned.getDate();
  const h = zoned.getHours();
  const base = new Date(y, m, d);
  if (h < RESET_HOUR) {
    base.setDate(base.getDate() - 1);
  }
  return formatInTimeZone(base, TIMEZONE, 'yyyy-MM-dd');
}

export function getTimezone(): string {
  return TIMEZONE;
}

/**
 * Returns the logicalDayKey for the first correct appearance of a recurring task.
 *
 * - daily / undefined  → today (starts immediately)
 * - weekly:N           → today if today's DOW === N, else next occurrence of that weekday
 * - monthly:N          → today if today's date === N, else the next calendar date N
 * - interval / other   → today (anchor = creation day)
 */
export function firstOccurrenceKey(schedule: string | undefined): string {
  const today = new Date();
  const zoned = toZonedTime(today, TIMEZONE);

  if (!schedule || schedule === 'daily') return getLogicalDayKey(today);

  if (schedule.startsWith('weekly:')) {
    const targetDow = parseInt(schedule.slice(7), 10);
    const todayDow = zoned.getDay();
    const daysAhead = (targetDow - todayDow + 7) % 7;
    if (daysAhead === 0) return getLogicalDayKey(today);
    const target = new Date(today);
    target.setDate(target.getDate() + daysAhead);
    target.setHours(12, 0, 0, 0);
    return getLogicalDayKey(target);
  }

  if (schedule.startsWith('monthly:')) {
    const targetDate = parseInt(schedule.slice(8), 10);
    const todayDate = zoned.getDate();
    if (todayDate === targetDate) return getLogicalDayKey(today);
    const year = zoned.getFullYear();
    const month = zoned.getMonth();
    const candidate = new Date(year, todayDate < targetDate ? month : month + 1, targetDate, 12, 0, 0);
    return getLogicalDayKey(candidate);
  }

  return getLogicalDayKey(today);
}

/** Day of week (0=Sun … 6=Sat) in the app's local timezone. */
export function getZonedDayOfWeek(date: Date = new Date()): number {
  return toZonedTime(date, TIMEZONE).getDay();
}

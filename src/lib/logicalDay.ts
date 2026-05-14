import { addDays, getDaysInMonth } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const TIMEZONE = 'America/Los_Angeles';
const RESET_HOUR = 4;

function clampMonthDay(year: number, month: number, day: number): number {
  const daysInMonth = getDaysInMonth(new Date(year, month, 1));
  return Math.min(Math.max(day, 1), daysInMonth);
}

/** YYYY-MM-DD key for the "logical day" that starts at 4:00 AM local. */
export function getLogicalDayKey(date: Date = new Date()): string {
  const zoned = toZonedTime(date, TIMEZONE);

  const logicalDate =
    zoned.getHours() < RESET_HOUR
      ? addDays(zoned, -1)
      : zoned;

  return formatInTimeZone(logicalDate, TIMEZONE, 'yyyy-MM-dd');
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
  const now = new Date();
  const zoned = toZonedTime(now, TIMEZONE);

  if (!schedule || schedule === 'daily') {
    return getLogicalDayKey(now);
  }

  if (schedule.startsWith('weekly:')) {
    const targetDow = Number.parseInt(schedule.slice(7), 10);

    if (!Number.isInteger(targetDow) || targetDow < 0 || targetDow > 6) {
      return getLogicalDayKey(now);
    }

    const todayDow = zoned.getDay();
    const daysAhead = (targetDow - todayDow + 7) % 7;

    const target =
      daysAhead === 0
        ? zoned
        : addDays(zoned, daysAhead);

    return formatInTimeZone(target, TIMEZONE, 'yyyy-MM-dd');
  }

  if (schedule.startsWith('monthly:')) {
    const rawTargetDate = Number.parseInt(schedule.slice(8), 10);

    if (!Number.isInteger(rawTargetDate) || rawTargetDate < 1 || rawTargetDate > 31) {
      return getLogicalDayKey(now);
    }

    const year = zoned.getFullYear();
    const month = zoned.getMonth();
    const todayDate = zoned.getDate();

    const targetMonth = todayDate <= rawTargetDate ? month : month + 1;
    const targetYear = targetMonth > 11 ? year + 1 : year;
    const normalizedTargetMonth = targetMonth % 12;

    const safeDay = clampMonthDay(
      targetYear,
      normalizedTargetMonth,
      rawTargetDate,
    );

    const target = new Date(
      targetYear,
      normalizedTargetMonth,
      safeDay,
      12,
      0,
      0,
    );

    return formatInTimeZone(target, TIMEZONE, 'yyyy-MM-dd');
  }

  return getLogicalDayKey(now);
}

/** Day of week (0=Sun … 6=Sat) in the app's local timezone. */
export function getZonedDayOfWeek(date: Date = new Date()): number {
  return toZonedTime(date, TIMEZONE).getDay();
}

import type { SuggestedTask, SuggestedEvent } from '../services/assistantService';
import type { GhostTask, GhostEvent, AssistantMessage } from '../types/assistant';
import { getZonedDayOfWeek } from './logicalDay';

// ── date label parsing ────────────────────────────────────────────────────────

const MONTH_NUMS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse a day label like "Sun May 10" → "2026-05-10".
 * Returns null if the string is not a recognised date label.
 * Year rolls forward only if the date is strictly before today (midnight-to-midnight).
 */
export function parseDateLabel(time: string | null | undefined): string | null {
  if (!time) return null;
  const m = time.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3,})\s+(\d{1,2})/i);
  if (!m) return null;
  const month = MONTH_NUMS[m[1].slice(0, 3).toLowerCase()];
  const day = parseInt(m[2], 10);
  if (!month || !day) return null;

  const today = new Date();
  let year = today.getFullYear();
  // Compare date-only so today's date does not wrap to next year
  const todayMidnight = new Date(year, today.getMonth(), today.getDate());
  if (new Date(year, month - 1, day) < todayMidnight) year += 1;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── recurring day parsing ─────────────────────────────────────────────────────

const DAY_NAMES: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export function parseSuggestedDay(
  suggestedDay: string | null | undefined,
  frequency: string,
  todayDow: number,
): { selectedDay: number; selectedMonthDay: number } {
  if (!suggestedDay) return { selectedDay: todayDow, selectedMonthDay: 1 };

  if (frequency === 'weekly') {
    for (const word of suggestedDay.toLowerCase().split(/\s+/)) {
      const n = DAY_NAMES[word];
      if (n !== undefined) return { selectedDay: n, selectedMonthDay: 1 };
    }
    return { selectedDay: todayDow, selectedMonthDay: 1 };
  }

  if (frequency === 'monthly') {
    const n = parseInt(suggestedDay.replace(/\D/g, ''), 10);
    return { selectedDay: todayDow, selectedMonthDay: n >= 1 && n <= 31 ? n : 1 };
  }

  return { selectedDay: todayDow, selectedMonthDay: 1 };
}

// ── ghost builders ────────────────────────────────────────────────────────────

export function buildGhostTasks(tasks: SuggestedTask[]): GhostTask[] {
  const todayDow = getZonedDayOfWeek();
  return tasks.map((t) => {
    const { selectedDay, selectedMonthDay } = parseSuggestedDay(t.day, t.frequency, todayDow);
    return {
      id: crypto.randomUUID(),
      title: t.title,
      assignee: t.assignee,
      frequency: t.frequency,
      day: t.day,
      time: t.time ?? null,
      duration: t.duration ?? null,
      goalId: t.goalId ?? null,
      selected: true,
      committed: false,
      selectedDay,
      selectedMonthDay,
    };
  });
}

export function buildGhostEvents(events: SuggestedEvent[]): GhostEvent[] {
  return events.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    selected: true,
    committed: false,
  }));
}

// ── duplicate filtering ───────────────────────────────────────────────────────

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Remove ghost task suggestions whose titles closely match an existing task.
 * Used as a client-side safety net after server-side dedup.
 */
export function filterDuplicateGhostTasks(
  suggestions: GhostTask[],
  existing: { title: string }[],
): GhostTask[] {
  if (existing.length === 0) return suggestions;
  const existingTitles = new Set(existing.map((t) => normalizeTitle(t.title)));
  return suggestions.filter((s) => !existingTitles.has(normalizeTitle(s.title)));
}

// ── message hydration ─────────────────────────────────────────────────────────

export function rawToMessage(raw: { role: string; content: string }): AssistantMessage {
  return {
    id: crypto.randomUUID(),
    role: raw.role as 'user' | 'assistant',
    content: raw.content,
    ghostTasks: [],
    ghostEvents: [],
    timestamp: new Date(),
  };
}

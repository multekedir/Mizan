import { getPrayerTimesForDate, getFivePrayers } from './prayerService';
import { useTaskStore } from '../stores/taskStore';
import { useGoalStore } from '../stores/goalStore';
import { usePeopleStore } from '../stores/peopleStore';
import { useCalendarStore } from '../stores/calendarStore';
import { useAuthStore, isGoogleTokenValid } from '../stores/authStore';
import {
  GoogleCalendarService,
  hasApiKeyConfig,
  listEventsWithApiKey,
  type NormalizedEvent,
} from './googleCalendarService';
import { db } from '../db/database';
import { getLogicalDayKey } from '../lib/logicalDay';

const BACKEND_URL =
  (import.meta.env.VITE_ASSISTANT_URL as string | undefined) ?? 'http://localhost:8000';

export interface SuggestedTask {
  title: string;
  assignee: string;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly';
  day?: string | null;
  time?: string | null;
  duration?: string | null;
  goalId?: string | null;
}

export interface SuggestedEvent {
  title: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  recurrence: string | null;
}

export interface AssistantResponse {
  message: string;
  tasks: SuggestedTask[];
  suggested_events: SuggestedEvent[];
  mode: 'chat' | 'tasks' | 'light_day';
  memory_updates: string[];
  goal?: { title: string } | null;
}

export interface RawHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

function eventsForAssistantPayload(events: NormalizedEvent[]): { title: string; start: string; end: string }[] {
  return events.map((ev) => ({
    title: ev.title,
    // ISO for reliable server-side parsing; human-readable line still added in prompt from title+start
    start: ev.start.toISOString(),
    end: ev.end.toISOString(),
  }));
}

function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatTaskForAssistant(t: {
  title: string;
  assignee: string;
  completed: boolean;
  schedule?: string | null;
}) {
  return {
    title: t.title,
    assignee: t.assignee,
    completed: t.completed,
    schedule: t.schedule ?? null,
  };
}

/**
 * OAuth first (signed-in user), then API key calendar, then cache — matches Schedule column priority.
 */
async function fetchUpcomingCalendarEvents(): Promise<{ title: string; start: string; end: string }[]> {
  const min = new Date();
  const max = new Date();
  max.setDate(max.getDate() + 14);

  const tokens = useAuthStore.getState().googleTokens;
  if (isGoogleTokenValid(tokens)) {
    try {
      const svc = new GoogleCalendarService(tokens.accessToken);
      const events = await svc.listEvents(min, max);
      useCalendarStore.getState().setEvents(events);
      return eventsForAssistantPayload(events);
    } catch {
      // fall through
    }
  }

  if (hasApiKeyConfig()) {
    try {
      const events = await listEventsWithApiKey(min, max);
      useCalendarStore.getState().setEvents(events);
      return eventsForAssistantPayload(events);
    } catch {
      // fall through
    }
  }

  const cached = useCalendarStore.getState().events;
  if (cached.length > 0) {
    return eventsForAssistantPayload(cached);
  }

  return [];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

async function buildLiveContext() {
  const now = new Date();
  const pt = getPrayerTimesForDate(now);
  const prayers = getFivePrayers(pt);
  const prayerMap = Object.fromEntries(prayers.map((p) => [p.key, p.time]));

  const tasks = useTaskStore.getState().tasks;
  const goals = useGoalStore.getState().goals;
  const people = usePeopleStore.getState().people;

  const todayKey = getLogicalDayKey();

  // Compute tomorrow's logical day key by advancing the date part by one day
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const tomorrowDate = new Date(ty, tm - 1, td + 1);
  const tomorrowKey = [
    tomorrowDate.getFullYear(),
    String(tomorrowDate.getMonth() + 1).padStart(2, '0'),
    String(tomorrowDate.getDate()).padStart(2, '0'),
  ].join('-');

  const [pastCompleted, allRecurring, tomorrowDbTasks] = await Promise.all([
    db.tasks.filter((t) => t.logicalDayKey !== todayKey && t.completed).limit(30).toArray(),
    db.tasks.filter((t) => t.recurring).toArray(),
    db.tasks.where('logicalDayKey').equals(tomorrowKey).toArray(),
  ]);

  // Deduplicate recurring tasks by normalized title (keep most recent schedule/assignee)
  const recurringMap = new Map<string, { title: string; assignee: string; schedule: string | undefined }>();
  for (const t of allRecurring) {
    recurringMap.set(normalizeTitleKey(t.title), {
      title: t.title,
      assignee: t.assignee,
      schedule: t.schedule,
    });
  }

  const calendarEvents = await fetchUpcomingCalendarEvents();

  // Filter calendar events for tomorrow by UTC date prefix (good enough for planning purposes)
  const tomorrowCalEvents = calendarEvents.filter((ev) => ev.start.startsWith(tomorrowKey));

  const tomorrowTitles = new Set(tomorrowDbTasks.map((t) => normalizeTitleKey(t.title)));

  const liveContext = {
    members: people.map((p) => ({ name: p.name })),
    current_time: formatTime(now),
    prayer_times: {
      fajr: formatTime(prayerMap.fajr),
      dhuhr: formatTime(prayerMap.dhuhr),
      asr: formatTime(prayerMap.asr),
      maghrib: formatTime(prayerMap.maghrib),
      isha: formatTime(prayerMap.isha),
    },
    current_tasks: tasks.map(formatTaskForAssistant),
    recurring_tasks: Array.from(recurringMap.values()).map((t) => ({
      title: t.title,
      assignee: t.assignee,
      completed: false,
      schedule: t.schedule ?? null,
    })),
    current_goals: goals.map((g) => ({ id: g.id, title: g.title, assignee: g.assignee ?? undefined, completed: g.completed })),
    completed_history: pastCompleted.map((t) => ({
      title: t.title,
      assignee: t.assignee,
      day: t.logicalDayKey,
    })),
    calendar_events: calendarEvents,
    tomorrow_tasks: tomorrowDbTasks.map(formatTaskForAssistant),
    tomorrow_events: tomorrowCalEvents,
  };

  return { liveContext, tomorrowTitles };
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? `Backend error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function sendMessage(
  message: string,
  onToken: (token: string | null) => void,
): Promise<AssistantResponse> {
  const { liveContext: live_context, tomorrowTitles } = await buildLiveContext();

  const res = await fetch(`${BACKEND_URL}/v1/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, live_context }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? `Backend error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (!done && value) {
      buffer += decoder.decode(value, { stream: true });
    }
    if (done) {
      buffer += decoder.decode();
    }

    const lines = buffer.split(/\r?\n/);
    buffer = done ? '' : (lines.pop() ?? '');

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trimStart();

      if (payload === '[DONE]') {
        throw new Error('Stream ended without final response payload.');
      }

      if (payload.startsWith('[DONE]')) {
        const finalJson = payload.slice('[DONE]'.length).trim();
        if (!finalJson) {
          throw new Error('Stream ended without final response payload.');
        }
        const parsed = JSON.parse(finalJson) as AssistantResponse;
        // Client-side dedup: remove suggestions that duplicate tomorrow's existing tasks
        if (tomorrowTitles.size > 0 && parsed.tasks.length > 0) {
          parsed.tasks = parsed.tasks.filter((t) => !tomorrowTitles.has(normalizeTitleKey(t.title)));
        }
        return parsed;
      }

      let chunk: { token?: string; is_json?: boolean; error?: string };
      try {
        chunk = JSON.parse(payload) as typeof chunk;
      } catch {
        continue;
      }

      if (chunk.error) {
        throw new Error(chunk.error);
      }

      if (chunk.token !== undefined) {
        onToken(chunk.is_json ? null : chunk.token);
      }
    }

    if (done) break;
  }

  throw new Error('Stream ended without a final assistant response.');
}

// ---------------------------------------------------------------------------
// History (owned by backend)
// ---------------------------------------------------------------------------

export async function fetchHistory(): Promise<RawHistoryMessage[]> {
  const data = await api<{ messages: RawHistoryMessage[] }>('/v1/history');
  return data.messages;
}

export async function clearHistory(): Promise<void> {
  await api('/v1/history', { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Notes (owned by backend)
// ---------------------------------------------------------------------------

export async function fetchNotes(): Promise<string[]> {
  const data = await api<{ notes: string[] }>('/v1/notes');
  return data.notes;
}

export async function deleteNote(index: number): Promise<string[]> {
  const data = await api<{ notes: string[] }>(`/v1/notes/${index}`, { method: 'DELETE' });
  return data.notes;
}

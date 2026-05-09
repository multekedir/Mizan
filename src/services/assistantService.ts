import { getPrayerTimesForDate, getFivePrayers } from './prayerService';
import { useTaskStore } from '../stores/taskStore';
import { useGoalStore } from '../stores/goalStore';
import { usePeopleStore } from '../stores/peopleStore';
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

export interface AssistantResponse {
  message: string;
  tasks: SuggestedTask[];
  mode: 'chat' | 'tasks' | 'light_day';
  memory_updates: string[];
  goal?: { title: string } | null;
}

export interface RawHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
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
  const [pastCompleted, allRecurring] = await Promise.all([
    db.tasks.filter((t) => t.logicalDayKey !== todayKey && t.completed).limit(30).toArray(),
    db.tasks.filter((t) => t.recurring).toArray(),
  ]);

  // Deduplicate recurring tasks by title (keep most recent schedule/assignee)
  const recurringMap = new Map<string, { title: string; assignee: string; schedule: string | undefined }>();
  for (const t of allRecurring) {
    recurringMap.set(t.title.toLowerCase(), { title: t.title, assignee: t.assignee, schedule: t.schedule });
  }

  return {
    members: people.map((p) => ({ name: p.name })),
    current_time: formatTime(now),
    prayer_times: {
      fajr: formatTime(prayerMap.fajr),
      dhuhr: formatTime(prayerMap.dhuhr),
      asr: formatTime(prayerMap.asr),
      maghrib: formatTime(prayerMap.maghrib),
      isha: formatTime(prayerMap.isha),
    },
    current_tasks: tasks.map((t) => ({ title: t.title, assignee: t.assignee, completed: t.completed, schedule: t.schedule ?? null })),
    recurring_tasks: Array.from(recurringMap.values()).map((t) => ({
      title: t.title,
      assignee: t.assignee,
      completed: false,
      schedule: t.schedule ?? null,
    })),
    current_goals: goals.map((g) => ({ id: g.id, title: g.title, assignee: g.assignee ?? undefined, completed: g.completed })),
    completed_history: pastCompleted.map((t) => t.title),
    calendar_events: [] as { title: string; start: string; end: string }[],
  };
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
  const live_context = await buildLiveContext();

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
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);

      if (payload.startsWith('[DONE] ')) {
        return JSON.parse(payload.slice(7)) as AssistantResponse;
      }

      let chunk: { token?: string; is_json?: boolean; error?: string };
      try {
        chunk = JSON.parse(payload) as typeof chunk;
      } catch {
        continue; // ignore malformed SSE chunks
      }
      if (chunk.error) throw new Error(chunk.error);
      // For JSON-mode responses, pass null token so frontend shows typing indicator
      if (chunk.token !== undefined) onToken(chunk.is_json ? null : chunk.token);
    }
  }

  throw new Error('Stream ended without a [DONE] event.');
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

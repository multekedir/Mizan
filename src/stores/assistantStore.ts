import { create } from 'zustand';
import {
  sendMessage as apiSendMessage,
  fetchHistory,
  clearHistory,
  fetchNotes,
  deleteNote,
} from '../services/assistantService';
import { useTaskStore } from './taskStore';
import { useGoalStore } from './goalStore';
import { useAuthStore, isGoogleTokenValid } from './authStore';
import {
  createCalendarEvent,
  type RecurrenceFrequency,
} from '../services/googleCalendarService';

function toRecurrenceFrequency(raw: string | null | undefined): RecurrenceFrequency {
  const v = (raw ?? 'none').trim().toLowerCase();
  if (v === 'daily' || v === 'weekly' || v === 'monthly' || v === 'none') return v;
  return 'none';
}
import {
  parseDateLabel,
  buildGhostTasks,
  buildGhostEvents,
  rawToMessage,
} from '../lib/assistantHelpers';
import type { AssistantMessage } from '../types/assistant';
export type { GhostTask, GhostEvent, AssistantMessage } from '../types/assistant';

interface AssistantState {
  messages: AssistantMessage[];
  isLoading: boolean;
  error: string | null;

  familyNotes: string[];
  notesLoaded: boolean;

  /** Load history + notes from backend (called when modal opens). */
  hydrate: () => Promise<void>;
  removeNote: (index: number) => Promise<void>;

  sendUserMessage: (text: string) => Promise<void>;
  toggleGhostTask: (messageId: string, taskId: string) => void;
  setGhostTaskDay: (messageId: string, taskId: string, day: number) => void;
  setGhostTaskMonthDay: (messageId: string, taskId: string, day: number) => void;
  commitSelectedTasks: (messageId: string) => Promise<void>;
  dismissMessageTasks: (messageId: string) => void;
  toggleGhostEvent: (messageId: string, eventId: string) => void;
  commitSelectedEvents: (messageId: string) => Promise<void>;
  clearConversation: () => Promise<void>;
  clearError: () => void;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,
  familyNotes: [],
  notesLoaded: false,

  hydrate: async () => {
    try {
      const [rawHistory, notes] = await Promise.all([fetchHistory(), fetchNotes()]);
      set({ messages: rawHistory.map(rawToMessage), familyNotes: notes, notesLoaded: true });
    } catch {
      set({ notesLoaded: true });
    }
  },

  removeNote: async (index) => {
    const notes = await deleteNote(index);
    set({ familyNotes: notes });
  },

  sendUserMessage: async (text) => {
    const userMsg: AssistantMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      ghostTasks: [],
      ghostEvents: [],
      timestamp: new Date(),
    };
    set((s) => ({ messages: [...s.messages, userMsg], isLoading: true, error: null }));

    const assistantMsgId = crypto.randomUUID();
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: assistantMsgId,
          role: 'assistant' as const,
          content: '',
          ghostTasks: [],
          ghostEvents: [],
          timestamp: new Date(),
          isTyping: true,
        },
      ],
    }));

    try {
      const response = await apiSendMessage(text, (token) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: token === null ? m.content : m.content + token,
                  // Stay in typing state for JSON-mode (null tokens); clear once real text arrives
                  isTyping: token === null,
                }
              : m,
          ),
        }));
      });

      if (response.memory_updates.length > 0) {
        const notes = await fetchNotes();
        set({ familyNotes: notes });
      }

      const ghostTasks = buildGhostTasks(response.tasks);

      let goalTitle: string | undefined;
      if (response.goal?.title) {
        const existing = useGoalStore.getState().goals.find(
          (g) => g.title.toLowerCase() === response.goal!.title.toLowerCase(),
        );
        let goalId: string;
        if (existing) {
          goalId = existing.id;
        } else {
          goalId = await useGoalStore.getState().addGoal(response.goal.title);
        }
        goalTitle = response.goal.title;
        for (const t of ghostTasks) {
          if (!t.goalId) t.goalId = goalId;
        }
      }

      if (response.mode === 'light_day') {
        const pendingIds = useTaskStore.getState().tasks
          .filter((t) => !t.completed)
          .map((t) => t.id);
        for (const id of pendingIds) {
          await useTaskStore.getState().moveToNextDay(id);
        }
      }

      const ghostEvents = buildGhostEvents(response.suggested_events ?? []);

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: response.message || m.content,
                ghostTasks,
                ghostEvents,
                goalTitle,
                isTyping: false,
              }
            : m,
        ),
        isLoading: false,
      }));
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Something went wrong. Make sure the backend is running.',
      });
    }
  },

  toggleGhostTask: (messageId, taskId) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, ghostTasks: m.ghostTasks.map((t) => (t.id === taskId ? { ...t, selected: !t.selected } : t)) }
          : m,
      ),
    }));
  },

  setGhostTaskDay: (messageId, taskId, day) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, ghostTasks: m.ghostTasks.map((t) => (t.id === taskId ? { ...t, selectedDay: day } : t)) }
          : m,
      ),
    }));
  },

  setGhostTaskMonthDay: (messageId, taskId, day) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, ghostTasks: m.ghostTasks.map((t) => (t.id === taskId ? { ...t, selectedMonthDay: day } : t)) }
          : m,
      ),
    }));
  },

  commitSelectedTasks: async (messageId) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg) return;

    const addTask = useTaskStore.getState().addTask;
    const toCommit = msg.ghostTasks.filter((t) => t.selected && !t.committed);
    const committedIds: string[] = [];

    try {
      for (const task of toCommit) {
        const recurring =
          task.frequency === 'daily' || task.frequency === 'weekly' || task.frequency === 'monthly';
        const schedule =
          task.frequency === 'daily' ? 'daily'
          : task.frequency === 'weekly' ? `weekly:${task.selectedDay}`
          : task.frequency === 'monthly' ? `monthly:${task.selectedMonthDay}`
          : undefined;

        const targetDayKey = parseDateLabel(task.time) ?? undefined;
        const time = targetDayKey ? undefined : (task.time ?? undefined);
        const duration = task.duration ?? undefined;
        const goalId = task.goalId ?? undefined;

        await addTask(task.title, task.assignee, recurring, schedule, time, duration, targetDayKey, goalId);
        committedIds.push(task.id);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to add one or more tasks.' });
    }

    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              ghostTasks: m.ghostTasks.map((t) =>
                committedIds.includes(t.id) ? { ...t, committed: true } : t,
              ),
            }
          : m,
      ),
    }));
  },

  dismissMessageTasks: (messageId) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, ghostTasks: [] } : m)),
    }));
  },

  toggleGhostEvent: (messageId, eventId) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              ghostEvents: m.ghostEvents.map((e) =>
                e.id === eventId ? { ...e, selected: !e.selected } : e,
              ),
            }
          : m,
      ),
    }));
  },

  commitSelectedEvents: async (messageId) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg) return;

    const tokens = useAuthStore.getState().googleTokens;
    if (!isGoogleTokenValid(tokens)) {
      set({ error: 'Sign in with Google to add calendar events.' });
      return;
    }

    const toCommit = msg.ghostEvents.filter((e) => e.selected && !e.committed);
    const committedIds: string[] = [];
    const skipped: string[] = [];
    let commitError: string | null = null;

    for (const ev of toCommit) {
      if (!ev.date) {
        skipped.push(ev.title);
        continue;
      }
      try {
        await createCalendarEvent(
          {
            title: ev.title,
            date: ev.date,
            startTime: ev.start_time ?? '9:00 AM',
            endTime: ev.end_time ?? '10:00 AM',
            recurrence: toRecurrenceFrequency(ev.recurrence),
          },
          tokens.accessToken,
        );
        committedIds.push(ev.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        commitError = msg === 'CALENDAR_PERMISSION_DENIED'
          ? 'Calendar permission denied. Sign out and sign back in with Google to grant calendar access.'
          : msg || 'Failed to add event to Google Calendar.';
        break;
      }
    }

    const errorParts: string[] = [];
    if (commitError) errorParts.push(commitError);
    if (skipped.length > 0) {
      errorParts.push(`Could not add "${skipped.join('", "')}" — no date returned by assistant.`);
    }
    if (errorParts.length > 0) set({ error: errorParts.join(' ') });

    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              ghostEvents: m.ghostEvents.map((e) =>
                committedIds.includes(e.id) ? { ...e, committed: true } : e,
              ),
            }
          : m,
      ),
    }));
  },

  clearConversation: async () => {
    await clearHistory();
    set({ messages: [], error: null });
  },

  clearError: () => set({ error: null }),
}));

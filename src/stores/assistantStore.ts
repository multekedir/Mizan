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
import { getZonedDayOfWeek } from '../lib/logicalDay';
import type { SuggestedTask } from '../services/assistantService';

const MONTH_NUMS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse a day label like "Sun May 10" → "2026-05-10", or return null if not a date label. */
function parseDateLabel(time: string | null | undefined): string | null {
  if (!time) return null;
  const m = time.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3,})\s+(\d{1,2})/i);
  if (!m) return null;
  const month = MONTH_NUMS[m[1].slice(0, 3).toLowerCase()];
  const day = parseInt(m[2], 10);
  if (!month || !day) return null;
  const today = new Date();
  let year = today.getFullYear();
  if (new Date(year, month - 1, day) < today) year += 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const DAY_NAMES: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function parseSuggestedDay(
  suggestedDay: string | null | undefined,
  frequency: string,
  todayDow: number,
): { selectedDay: number; selectedMonthDay: number } {
  if (!suggestedDay) return { selectedDay: todayDow, selectedMonthDay: 1 };
  if (frequency === 'weekly') {
    // Handle "first Sunday", "every Monday", "Saturday", "6", etc.
    const words = suggestedDay.toLowerCase().split(/\s+/);
    for (const word of words) {
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

export interface GhostTask extends SuggestedTask {
  id: string;
  selected: boolean;
  committed: boolean;
  /** For weekly tasks: day of week (0=Sun…6=Sat). */
  selectedDay: number;
  /** For monthly tasks: day of month (1–31). */
  selectedMonthDay: number;
  /** Suggested time label from the assistant e.g. "6:00 AM". */
  time?: string | null;
  /** Estimated duration e.g. "15 min". */
  duration?: string | null;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ghostTasks: GhostTask[];
  timestamp: Date;
  isTyping?: boolean;  // true while streaming a JSON-mode response
  goalTitle?: string;
}

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
  clearConversation: () => Promise<void>;
  clearError: () => void;
}

function rawToMessage(raw: { role: string; content: string }): AssistantMessage {
  return {
    id: crypto.randomUUID(),
    role: raw.role as 'user' | 'assistant',
    content: raw.content,
    ghostTasks: [],
    timestamp: new Date(),
  };
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
      const messages = rawHistory.map(rawToMessage);
      set({ messages, familyNotes: notes, notesLoaded: true });
    } catch {
      // Backend not running yet — open with empty state
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
      timestamp: new Date(),
    };

    set((s) => ({ messages: [...s.messages, userMsg], isLoading: true, error: null }));

    // Create a placeholder assistant message that streams tokens into it
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: AssistantMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      ghostTasks: [],
      timestamp: new Date(),
    };
    set((s) => ({ messages: [...s.messages, assistantMsg] }));

    try {
      const response = await apiSendMessage(text, (token) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: token === null ? m.content : m.content + token, isTyping: token === null && m.content === '' }
              : m,
          ),
        }));
      });

      // Refresh notes if backend saved new ones
      if (response.memory_updates.length > 0) {
        const notes = await fetchNotes();
        set({ familyNotes: notes });
      }

      const todayDow = getZonedDayOfWeek();
      const ghostTasks: GhostTask[] = response.tasks.map((t) => {
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
        // attach goalId to all ghost tasks that don't already have one
        for (const t of ghostTasks) {
          if (!t.goalId) t.goalId = goalId;
        }
      }

      // Light day: move all pending tasks to tomorrow
      if (response.mode === 'light_day') {
        const pendingIds = useTaskStore.getState().tasks
          .filter((t) => !t.completed)
          .map((t) => t.id);
        for (const id of pendingIds) {
          await useTaskStore.getState().moveToNextDay(id);
        }
      }

      // Replace placeholder content with final parsed message + attach tasks
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: response.message || m.content, ghostTasks, goalTitle }
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

    for (const task of toCommit) {
      const recurring = task.frequency === 'daily' || task.frequency === 'weekly' || task.frequency === 'monthly';
      const schedule =
        task.frequency === 'daily' ? 'daily'
        : task.frequency === 'weekly' ? `weekly:${task.selectedDay}`
        : task.frequency === 'monthly' ? `monthly:${task.selectedMonthDay}`
        : undefined;

      // If time is a date label ("Sun May 10"), store on that day and clear the time field
      const targetDayKey = parseDateLabel(task.time) ?? undefined;
      const time = targetDayKey ? undefined : (task.time ?? undefined);
      const duration = task.duration ?? undefined;

      const goalId = task.goalId ?? undefined;
      await addTask(task.title, task.assignee, recurring, schedule, time, duration, targetDayKey, goalId);
    }

    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, ghostTasks: m.ghostTasks.map((t) => (t.selected && !t.committed ? { ...t, committed: true } : t)) }
          : m,
      ),
    }));
  },

  dismissMessageTasks: (messageId) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, ghostTasks: [] } : m)),
    }));
  },

  clearConversation: async () => {
    await clearHistory();
    set({ messages: [], error: null });
  },

  clearError: () => set({ error: null }),
}));

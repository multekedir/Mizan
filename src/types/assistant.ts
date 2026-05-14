import type { SuggestedTask, SuggestedEvent } from '../services/assistantService';

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

export interface GhostEvent extends SuggestedEvent {
  id: string;
  selected: boolean;
  committed: boolean;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ghostTasks: GhostTask[];
  ghostEvents: GhostEvent[];
  timestamp: Date;
  isTyping?: boolean;
  goalTitle?: string;
}

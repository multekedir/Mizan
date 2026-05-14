import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CalendarDays, Check, Target } from 'lucide-react';
import { GhostTaskCard } from './GhostTaskCard';
import { GhostEventCard } from './GhostEventCard';
import type { AssistantMessage, GhostTask } from '../../stores/assistantStore';
import {
  PRAYER_BLOCK_ORDER,
  PRAYER_BLOCK_DISPLAY,
  getPrayerBlockKey,
} from '../../lib/prayerBlocks';
import type { PrayerBlockKey } from '../../lib/prayerBlocks';

// ── Prayer block grouping ─────────────────────────────────────────────────────

function groupByBlock(
  tasks: GhostTask[],
): Array<{ key: PrayerBlockKey | null; tasks: GhostTask[] }> {
  const blockMap = new Map<PrayerBlockKey | null, GhostTask[]>();
  for (const task of tasks) {
    const key = getPrayerBlockKey(task.time);
    const bucket = blockMap.get(key) ?? [];
    bucket.push(task);
    blockMap.set(key, bucket);
  }
  const ordered: Array<{ key: PrayerBlockKey | null; tasks: GhostTask[] }> = [];
  for (const key of PRAYER_BLOCK_ORDER) {
    const bucket = blockMap.get(key);
    if (bucket?.length) {
      ordered.push({ key, tasks: bucket });
      blockMap.delete(key);
    }
  }
  for (const [key, tasks] of blockMap.entries()) {
    if (tasks.length) ordered.push({ key, tasks });
  }
  return ordered;
}

// ── Duration helpers ──────────────────────────────────────────────────────────

/** Warn when summed task durations exceed this (11 hours). */
const LONG_DAY_WARNING_MINS = 11 * 60;

function parseDurationMins(duration: string | null | undefined): number {
  if (!duration) return 0;

  const normalized = duration.toLowerCase().trim();

  let mins = 0;

  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  const minuteMatch = normalized.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);

  if (hourMatch) {
    mins += Math.round(Number.parseFloat(hourMatch[1]) * 60);
  }

  if (minuteMatch) {
    mins += Number.parseInt(minuteMatch[1], 10);
  }

  if (mins === 0 && /^\d+$/.test(normalized)) {
    mins = Number.parseInt(normalized, 10);
  }

  return Number.isFinite(mins) ? mins : 0;
}

function formatMins(mins: number): string {
  if (mins <= 0) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  message: AssistantMessage;
  onToggleTask: (taskId: string) => void;
  onDayChange: (taskId: string, day: number) => void;
  onMonthDayChange: (taskId: string, day: number) => void;
  onCommit: () => Promise<void>;
  onDismiss: () => void;
  onToggleEvent: (eventId: string) => void;
  onCommitEvents: () => Promise<void>;
}

export function ChatMessage({ message, onToggleTask, onDayChange, onMonthDayChange, onCommit, onDismiss, onToggleEvent, onCommitEvents }: Props) {
  const isUser = message.role === 'user';

  const taskState = useMemo(() => {
    const uncommitted = message.ghostTasks.filter((t) => !t.committed);
    const selectedCount = uncommitted.filter((t) => t.selected).length;
    const committedCount = message.ghostTasks.filter((t) => t.committed).length;
    const allResolved =
      message.ghostTasks.length > 0 && message.ghostTasks.every((t) => t.committed);
    const hasPrayerBlocks = message.ghostTasks.some((t) => getPrayerBlockKey(t.time) !== null);
    const groups = hasPrayerBlocks ? groupByBlock(message.ghostTasks) : null;
    const grandTotal = hasPrayerBlocks
      ? message.ghostTasks.reduce((sum, t) => sum + parseDurationMins(t.duration), 0)
      : 0;
    const isLongDay = grandTotal > LONG_DAY_WARNING_MINS;
    return {
      uncommitted,
      selectedCount,
      committedCount,
      allResolved,
      hasPrayerBlocks,
      groups,
      grandTotal,
      isLongDay,
    };
  }, [message.ghostTasks]);

  const eventState = useMemo(() => {
    const uncommitted = message.ghostEvents.filter((e) => !e.committed);
    const selectedCount = uncommitted.filter((e) => e.selected).length;
    const allResolved =
      message.ghostEvents.length > 0 && message.ghostEvents.every((e) => e.committed);
    return { selectedCount, allResolved };
  }, [message.ghostEvents]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}
    >
      {/* Bubble */}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-mizan-accent text-mizan-textOnDark rounded-br-md'
            : 'bg-mizan-surface text-mizan-text border border-mizan-surfaceSoft rounded-bl-md'
        }`}
      >
        {!isUser && message.isTyping && !message.content ? (
          <span className="flex gap-1 items-center h-5">
            <span className="w-2 h-2 rounded-full bg-mizan-text/40 animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 rounded-full bg-mizan-text/40 animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-mizan-text/40 animate-bounce [animation-delay:300ms]" />
          </span>
        ) : (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
      </div>

      {/* Ghost task cards (assistant only) */}
      {message.ghostTasks.length > 0 && (
        <div className="w-full max-w-[92%] flex flex-col gap-2">
          {message.goalTitle && (
            <div className="mb-1 flex items-center gap-2 px-1">
              <Target className="text-mizan-accent h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
              <span className="text-mizan-accent text-sm font-semibold">Goal: {message.goalTitle}</span>
            </div>
          )}

          {taskState.hasPrayerBlocks && taskState.groups ? (
            <>
              {taskState.grandTotal > 0 && (
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-xs text-mizan-text/40 uppercase tracking-wide font-semibold">Day total</span>
                  <span
                    className={`flex items-center gap-0.5 text-xs font-bold ${taskState.isLongDay ? 'text-mizan-warning' : 'text-mizan-text/50'}`}
                  >
                    {formatMins(taskState.grandTotal)}
                    {taskState.isLongDay && (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.5} />
                    )}
                  </span>
                </div>
              )}
              {taskState.groups.map(({ key, tasks }, groupIdx) => {
                const blockTotal = tasks.reduce((sum, t) => sum + parseDurationMins(t.duration), 0);
                return (
                  <div key={key ?? '_unblocked'} className="flex flex-col gap-2">
                    {key && (
                      <div className={`flex items-center gap-2 px-1 ${groupIdx > 0 ? 'mt-2' : ''}`}>
                        <span className="text-xs font-bold text-mizan-text/50 uppercase tracking-widest whitespace-nowrap">
                          {PRAYER_BLOCK_DISPLAY[key] ?? key}
                        </span>
                        <div className="flex-1 h-px bg-mizan-surfaceSoft" />
                        {blockTotal > 0 && (
                          <span className="text-xs text-mizan-text/40 font-medium shrink-0">
                            {formatMins(blockTotal)}
                          </span>
                        )}
                      </div>
                    )}
                    {tasks.map((task) => (
                      <GhostTaskCard
                        key={task.id}
                        task={task}
                        onToggle={() => onToggleTask(task.id)}
                        onDayChange={(day) => onDayChange(task.id, day)}
                        onMonthDayChange={(day) => onMonthDayChange(task.id, day)}
                        hidePrayerTime
                      />
                    ))}
                  </div>
                );
              })}
            </>
          ) : (
            // Flat list (no prayer blocks)
            message.ghostTasks.map((task) => (
              <GhostTaskCard
                key={task.id}
                task={task}
                onToggle={() => onToggleTask(task.id)}
                onDayChange={(day) => onDayChange(task.id, day)}
                onMonthDayChange={(day) => onMonthDayChange(task.id, day)}
              />
            ))
          )}

          {!taskState.allResolved && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onDismiss}
                className="bg-mizan-surfaceSoft text-mizan-text flex-1 rounded-2xl py-2.5 text-sm font-semibold active:scale-[0.98]"
              >
                Skip
              </button>
              <button
                type="button"
                disabled={taskState.selectedCount === 0}
                onClick={() => void onCommit()}
                className="bg-mizan-accent text-mizan-textOnDark flex-1 rounded-2xl py-2.5 text-sm font-semibold disabled:opacity-40 active:scale-[0.98]"
              >
                Add {taskState.selectedCount} Task{taskState.selectedCount !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {taskState.allResolved && (
            <p className="text-mizan-success flex items-center gap-1 px-1 text-xs font-medium">
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden />
              <span>
                {taskState.committedCount} task{taskState.committedCount !== 1 ? 's' : ''} added
              </span>
            </p>
          )}
        </div>
      )}

      {/* Ghost calendar events */}
      {message.ghostEvents.length > 0 && (
        <div className="w-full max-w-[92%] flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1 mb-1">
            <CalendarDays className="text-mizan-accent h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
            <span className="text-mizan-accent text-sm font-semibold">Calendar Events</span>
          </div>

          {message.ghostEvents.map((ev) => (
            <GhostEventCard
              key={ev.id}
              event={ev}
              onToggle={() => onToggleEvent(ev.id)}
            />
          ))}

          {!eventState.allResolved && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={eventState.selectedCount === 0}
                onClick={() => void onCommitEvents()}
                className="bg-mizan-accent text-mizan-textOnDark flex-1 rounded-2xl py-2.5 text-sm font-semibold disabled:opacity-40 active:scale-[0.98]"
              >
                Add {eventState.selectedCount} to Calendar
              </button>
            </div>
          )}

          {eventState.allResolved && (
            <p className="text-mizan-success flex items-center gap-1 px-1 text-xs font-medium">
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden />
              <span>Added to Google Calendar</span>
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

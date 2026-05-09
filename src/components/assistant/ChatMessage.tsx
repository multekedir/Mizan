import { motion } from 'framer-motion';
import { AlertTriangle, Check, Target } from 'lucide-react';
import { GhostTaskCard } from './GhostTaskCard';
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
  const unblocked = blockMap.get(null);
  if (unblocked?.length) ordered.push({ key: null, tasks: unblocked });
  return ordered;
}

// ── Duration helpers ──────────────────────────────────────────────────────────

function parseDurationMins(duration: string | null | undefined): number {
  if (!duration) return 0;
  let mins = 0;
  const hrMatch = duration.match(/(\d+(?:\.\d+)?)\s*hr/i);
  const minMatch = duration.match(/(\d+)\s*min/i);
  if (hrMatch) mins += Math.round(parseFloat(hrMatch[1]) * 60);
  if (minMatch) mins += parseInt(minMatch[1], 10);
  return mins;
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
}

export function ChatMessage({ message, onToggleTask, onDayChange, onMonthDayChange, onCommit, onDismiss }: Props) {
  const isUser = message.role === 'user';
  const uncommitted = message.ghostTasks.filter((t) => !t.committed);
  const selectedCount = uncommitted.filter((t) => t.selected).length;
  const committedCount = message.ghostTasks.filter((t) => t.committed).length;
  const allResolved =
    message.ghostTasks.length > 0 && message.ghostTasks.every((t) => t.committed);

  const hasPrayerBlocks = message.ghostTasks.some((t) => getPrayerBlockKey(t.time) !== null);

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

          {hasPrayerBlocks ? (() => {
            const groups = groupByBlock(message.ghostTasks);
            const grandTotal = message.ghostTasks.reduce(
              (sum, t) => sum + parseDurationMins(t.duration), 0,
            );
            return (
              <>
                {grandTotal > 0 && (
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-xs text-mizan-text/40 uppercase tracking-wide font-semibold">Day total</span>
                    <span
                      className={`flex items-center gap-0.5 text-xs font-bold ${grandTotal > 660 ? 'text-mizan-warning' : 'text-mizan-text/50'}`}
                    >
                      {formatMins(grandTotal)}
                      {grandTotal > 660 && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.5} />
                      )}
                    </span>
                  </div>
                )}
                {groups.map(({ key, tasks }, groupIdx) => {
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
            );
          })() : (
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

          {!allResolved && (
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
                disabled={selectedCount === 0}
                onClick={() => void onCommit()}
                className="bg-mizan-accent text-mizan-textOnDark flex-1 rounded-2xl py-2.5 text-sm font-semibold disabled:opacity-40 active:scale-[0.98]"
              >
                Add {selectedCount} Task{selectedCount !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {allResolved && (
            <p className="text-mizan-success flex items-center gap-1 px-1 text-xs font-medium">
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden />
              <span>
                {committedCount} task{committedCount !== 1 ? 's' : ''} added
              </span>
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

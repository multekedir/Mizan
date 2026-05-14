import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LayoutGroup, motion, AnimatePresence } from 'framer-motion';
import { Clock, Plus, Repeat, X } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { useGoalStore } from '../../stores/goalStore';
import { usePeopleStore } from '../../stores/peopleStore';
import { db, type TaskRow } from '../../db/database';
import { getLogicalDayKey, getZonedDayOfWeek } from '../../lib/logicalDay';
import { shouldAppearToday } from '../../lib/dailyReset';
import { parseTaskNL, DAY_SHORT } from '../../lib/parseTaskNL';
import { ProgressArc } from './ProgressArc';
import { TaskHeroCard } from './TaskHeroCard';
import { TaskEditModal } from './TaskEditModal';
import { AssistantModal } from '../assistant/AssistantModal';
import { useAllDoneCelebrationStore } from '../../stores/allDoneCelebrationStore';

// ── Day helpers ───────────────────────────────────────────────────────────────

function dayKeyForOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0); // noon — avoids 4 AM reset-hour edge
  return getLogicalDayKey(d);
}

function dayLabel(offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ── Prayer-block grouping ─────────────────────────────────────────────────────

const PRAYER_BLOCK_LABELS: Record<string, string> = {
  'before jum':    "Before Jumu'ah",
  'after fajr':    'After Fajr',
  'during nap':    'During Nap',
  'after dhuhr':   'After Dhuhr',
  'after asr':     'After Asr',
  'after maghrib': 'After Maghrib',
  'before isha':   'Before Isha',
  'after isha':    'After Isha',
  'before sleep':  'Before Sleep',
};

const TASK_BLOCK_ORDER = [
  'before jum', 'after fajr', 'during nap', 'after dhuhr', 'after asr',
  'after maghrib', 'before isha', 'after isha', 'before sleep',
];

function getBlockKey(time: string | null | undefined): string | null {
  if (!time) return null;
  const lower = time.toLowerCase().trim();
  for (const key of TASK_BLOCK_ORDER) {
    if (lower.startsWith(key)) return key;
  }
  return null;
}

function groupTasksByBlock(
  taskList: TaskRow[],
): Array<{ key: string | null; label: string; tasks: TaskRow[] }> {
  const map = new Map<string | null, TaskRow[]>();
  for (const t of taskList) {
    const key = getBlockKey(t.time);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  const ordered: Array<{ key: string | null; label: string; tasks: TaskRow[] }> = [];
  for (const key of [...TASK_BLOCK_ORDER, null]) {
    const group = map.get(key);
    if (group?.length) {
      ordered.push({ key, label: key ? (PRAYER_BLOCK_LABELS[key] ?? key) : '', tasks: group });
      map.delete(key);
    }
  }
  return ordered;
}

// ── Quick-add form (today only) ───────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const addTask = useTaskStore((s) => s.addTask);
  const people = usePeopleStore((s) => s.people);
  const defaultAssignee = people[0]?.name ?? 'Family';

  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [hideFreq, setHideFreq] = useState(false);
  const [hideTime, setHideTime] = useState(false);

  const memberNames = useMemo(() => people.map((p) => p.name), [people]);
  const parsed = useMemo(() => parseTaskNL(title, memberNames), [title, memberNames]);

  // Auto-select detected assignee pill
  /* eslint-disable react-hooks/set-state-in-effect -- mirror NLP assignee into picker */
  useEffect(() => {
    if (parsed.assignee) setAssignee(parsed.assignee);
  }, [parsed.assignee]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reset chip overrides whenever the user retypes
  const prevTitle = useRef('');
  useEffect(() => {
    if (title !== prevTitle.current) {
      setHideFreq(false);
      setHideTime(false);
      prevTitle.current = title;
    }
  }, [title]);

  const finalFreq = hideFreq ? 'once' : parsed.frequency;
  const finalDay = hideFreq ? null : parsed.dayOfWeek;
  const finalMonthDay = hideFreq ? null : parsed.monthDay;
  const finalTime = hideTime ? null : parsed.time;

  function freqChipContent(): ReactNode {
    const repeatIcon = <Repeat className="h-3 w-3 shrink-0" aria-hidden strokeWidth={2} />;
    if (finalFreq === 'daily')
      return (
        <>
          {repeatIcon}
          <span>Daily</span>
        </>
      );
    if (finalFreq === 'weekly')
      return (
        <>
          {repeatIcon}
          <span>{finalDay !== null ? `Weekly · ${DAY_SHORT[finalDay]}` : 'Weekly'}</span>
        </>
      );
    if (finalFreq === 'monthly')
      return (
        <>
          {repeatIcon}
          <span>{finalMonthDay !== null ? `Monthly · ${ordinal(finalMonthDay)}` : 'Monthly'}</span>
        </>
      );
    if (finalFreq === 'custom')
      return (
        <>
          {repeatIcon}
          <span>{parsed.customFrequency ?? 'Custom'}</span>
        </>
      );
    return null;
  }

  async function submit() {
    const taskTitle = parsed.title || title.trim();
    if (!taskTitle) { onDone(); return; }

    const recurring = finalFreq !== 'once';
    const todayDow = getZonedDayOfWeek();
    const schedule =
      finalFreq === 'daily' ? 'daily'
      : finalFreq === 'weekly' ? `weekly:${finalDay ?? todayDow}`
      : finalFreq === 'monthly' ? `monthly:${finalMonthDay ?? 1}`
      : finalFreq === 'custom'
        ? (() => {
            const cf = (parsed.customFrequency ?? '').toLowerCase();
            if (cf === 'twice a week') return `weekly2:${todayDow}:${(todayDow + 3) % 7}`;

            if (cf.includes('day')) {
              const n = parsed.interval ?? (cf.includes('other') ? 2 : 1);
              return `interval:days:${Math.max(1, n)}`;
            }
            if (cf.includes('week')) {
              const n = parsed.interval ?? 2;
              return `interval:weeks:${Math.max(1, n)}`;
            }
            if (cf.includes('month')) {
              const n = parsed.interval ?? 1;
              return `interval:months:${Math.max(1, n)}`;
            }

            // fallback (still recurring)
            return 'daily';
          })()
      : undefined;

    await addTask(taskTitle, assignee || defaultAssignee, recurring, schedule, finalTime ?? undefined);
    setTitle('');
    onDone();
  }

  const showFreqChip = finalFreq !== 'once';
  const showTimeChip = finalTime !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="kiosk-allow-select card-mizan flex flex-col gap-3 p-4"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') onDone();
        }}
        className="border-mizan-surfaceSoft bg-mizan-bg focus:ring-mizan-success w-full rounded-2xl border px-4 py-2.5 text-base font-medium outline-none focus:ring-2"
        placeholder="Task… try 'vacuum daily' or 'call dentist for Dad'"
      />

      {/* Live parse chips */}
      {(showFreqChip || showTimeChip) && (
        <div className="flex flex-wrap gap-2">
          {showFreqChip && (
            <button
              type="button"
              onClick={() => setHideFreq(true)}
              title="Tap to remove"
              className="flex items-center gap-1 rounded-full bg-mizan-success/15 px-2.5 py-1 text-xs font-semibold text-mizan-success transition-colors hover:bg-mizan-success/25 active:scale-95"
            >
              {freqChipContent()}
              <X className="ml-0.5 h-3 w-3 shrink-0 opacity-60" strokeWidth={2.5} aria-hidden />
            </button>
          )}
          {showTimeChip && (
            <button
              type="button"
              onClick={() => setHideTime(true)}
              title="Tap to remove"
              className="flex items-center gap-1 rounded-full bg-mizan-success/15 px-2.5 py-1 text-xs font-semibold text-mizan-success transition-colors hover:bg-mizan-success/25 active:scale-95"
            >
              <Clock className="h-3 w-3 shrink-0" aria-hidden strokeWidth={2} />
              <span>{finalTime}</span>
              <X className="ml-0.5 h-3 w-3 shrink-0 opacity-60" strokeWidth={2.5} aria-hidden />
            </button>
          )}
        </div>
      )}

      {/* Assignee pills */}
      <div className="flex flex-wrap gap-2">
        {people.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setAssignee(p.name)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              assignee === p.name
                ? 'bg-mizan-accent text-mizan-textOnDark'
                : 'bg-mizan-surfaceSoft text-mizan-text'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          className="bg-mizan-success text-mizan-textOnDark flex-1 rounded-2xl py-2.5 text-sm font-semibold"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onDone}
          className="bg-mizan-surfaceSoft text-mizan-text flex-1 rounded-2xl py-2.5 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function TaskHeroSection() {
  const todayTasks = useTaskStore((s) => s.tasks);
  const toggle = useTaskStore((s) => s.toggleComplete);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const goals = useGoalStore((s) => s.goals);
  const showCelebration = useAllDoneCelebrationStore((s) => s.show);

  const [dayOffset, setDayOffset] = useState(0);
  const [offsetTasks, setOffsetTasks] = useState<TaskRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  const isToday = dayOffset === 0;
  const tasks = isToday ? todayTasks : offsetTasks;
  const completed = tasks.filter((t) => t.completed).length;
  const total = tasks.length;

  const taskGroups = useMemo(() => groupTasksByBlock(tasks), [tasks]);
  const hasBlocks = taskGroups.some((g) => g.key !== null);

  // Find the most-represented goal among today's tasks
  const dominantGoalTitle = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.goalId) counts.set(t.goalId, (counts.get(t.goalId) ?? 0) + 1);
    }
    let topId: string | null = null;
    let topCount = 0;
    for (const [id, count] of counts) {
      if (count > topCount) { topCount = count; topId = id; }
    }
    return topId ? (goals.find((g) => g.id === topId)?.title ?? undefined) : undefined;
  }, [tasks, goals]);

  // Fire the all-done toast only when transitioning into the all-done state
  const mounted = useRef(false);
  const wasAllDone = useRef(false);
  useEffect(() => {
    const nowAllDone = isToday && total > 0 && completed === total;
    if (!mounted.current) {
      mounted.current = true;
      wasAllDone.current = nowAllDone;
      return;
    }
    if (nowAllDone && !wasAllDone.current) {
      showCelebration(dominantGoalTitle ?? "Today's Plan", total);
    }
    wasAllDone.current = nowAllDone;
  }, [completed, total, isToday, dominantGoalTitle, showCelebration]);

  async function loadOffsetTasks(offset: number) {
    const key = dayKeyForOffset(offset);
    const explicit = await db.tasks.where('logicalDayKey').equals(key).sortBy('sortOrder');
    if (offset <= 0) {
      setOffsetTasks(explicit);
      return;
    }
    // For future days: also project recurring tasks that should appear on that day
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offset);
    targetDate.setHours(12, 0, 0, 0);
    const explicitTitles = new Set(explicit.map((t) => t.title.toLowerCase()));
    const allRecurring = await db.tasks.filter((t) => t.recurring).toArray();
    const projected = allRecurring
      .filter((t) => {
        if (t.logicalDayKey === key) return false;
        if (explicitTitles.has(t.title.toLowerCase())) return false;
        return shouldAppearToday(t.schedule, t.logicalDayKey, targetDate);
      })
      .map((t) => ({ ...t, id: `proj-${t.id}`, completed: false }));
    // Deduplicate projected by title (keep first occurrence)
    const seenTitles = new Set(explicitTitles);
    const uniqueProjected = projected.filter((t) => {
      const key = t.title.toLowerCase();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });
    setOffsetTasks([...explicit, ...uniqueProjected]);
  }

  // Load tasks from DB when viewing another day
  /* eslint-disable react-hooks/set-state-in-effect -- hydrate offset-day tasks */
  useEffect(() => {
    if (isToday) return;
    void loadOffsetTasks(dayOffset);
  }, [dayOffset, isToday]);

  // Refresh offset view when store changes (e.g. a task was moved here)
  useEffect(() => {
    if (isToday) return;
    void loadOffsetTasks(dayOffset);
  }, [todayTasks, dayOffset, isToday]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function navigate(dir: -1 | 1) {
    setAdding(false);
    setDayOffset((o) => Math.max(-6, Math.min(6, o + dir)));
  }

  async function handleToggle(id: string) {
    if (isToday) {
      await toggle(id);
    } else {
      // Toggle directly in DB for other days, then refresh
      const row = await db.tasks.get(id);
      if (!row) return;
      await db.tasks.update(id, { completed: !row.completed });
      const key = dayKeyForOffset(dayOffset);
      setOffsetTasks(await db.tasks.where('logicalDayKey').equals(key).sortBy('sortOrder'));
    }
  }

  async function handleDelete(id: string) {
    await deleteTask(id);
    if (!isToday) {
      const key = dayKeyForOffset(dayOffset);
      setOffsetTasks(await db.tasks.where('logicalDayKey').equals(key).sortBy('sortOrder'));
    }
  }

  return (
    <>
      <AssistantModal open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      <TaskEditModal open={addTaskOpen} onClose={() => setAddTaskOpen(false)} />

      <div className="card-mizan flex flex-1 min-h-0 flex-col gap-3 p-4">

        {/* Header with nav */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={dayOffset <= -6}
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-mizan-text/50 hover:bg-mizan-surfaceSoft hover:text-mizan-text disabled:opacity-20 transition-colors active:scale-95"
            aria-label="Previous day"
          >
            ‹
          </button>

          <AnimatePresence mode="wait">
            <motion.h2
              key={dayOffset}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
              className={`flex-1 text-center text-base font-bold uppercase tracking-wide ${
                isToday ? 'text-mizan-text opacity-60' : 'text-mizan-accent'
              }`}
            >
              {dayLabel(dayOffset)}
            </motion.h2>
          </AnimatePresence>

          <button
            type="button"
            onClick={() => navigate(1)}
            disabled={dayOffset >= 6}
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-mizan-text/50 hover:bg-mizan-surfaceSoft hover:text-mizan-text disabled:opacity-20 transition-colors active:scale-95"
            aria-label="Next day"
          >
            ›
          </button>
        </div>

        <div className="shrink-0"><ProgressArc completed={completed} total={total} /></div>

        <AnimatePresence mode="wait">
          <motion.div
            key={dayOffset}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
            className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1 pr-0.5"
          >
            <LayoutGroup>
              {tasks.length === 0 && !adding ? (
                <p className="text-mizan-text/60 text-center text-sm pt-4">
                  {isToday ? 'No tasks yet — tap + to add one.' : 'No tasks for this day.'}
                </p>
              ) : hasBlocks ? (
                taskGroups.map((group) => (
                  <div key={group.key ?? '__unscheduled__'} className="flex flex-col gap-2">
                    {group.key && (
                      <div className="flex items-center gap-2 px-1 pt-1">
                        <span className="text-mizan-text/40 text-xs font-semibold uppercase tracking-wider shrink-0">
                          {group.label}
                        </span>
                        <div className="flex-1 border-t border-mizan-surfaceSoft/40" />
                      </div>
                    )}
                    {group.tasks.map((t) => (
                      <TaskHeroCard
                        key={t.id}
                        task={t}
                        onToggle={() => void handleToggle(t.id)}
                        onDelete={() => void handleDelete(t.id)}
                        hidePrayerTime={!!group.key}
                      />
                    ))}
                  </div>
                ))
              ) : (
                tasks.map((t) => (
                  <TaskHeroCard
                    key={t.id}
                    task={t}
                    onToggle={() => void handleToggle(t.id)}
                    onDelete={() => void handleDelete(t.id)}
                  />
                ))
              )}
            </LayoutGroup>

            <AnimatePresence>
              {adding && <QuickAddForm onDone={() => setAdding(false)} />}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>

        {/* Bottom action buttons — add/assistant only for today */}
        {isToday && !adding && (
          <div className="mx-auto flex shrink-0 items-center gap-4">
            <button
              type="button"
              onClick={() => setAddTaskOpen(true)}
              className="bg-mizan-surfaceSoft text-mizan-text flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-colors active:scale-95"
              aria-label="Add task"
              title="Add Task"
            >
              <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
            </button>

            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="bg-mizan-surfaceSoft text-mizan-text flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-colors active:scale-95"
              aria-label="Smart assistant"
              title="Smart Assistant"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-mizan-shell p-0.5 ring-2 ring-mizan-accent/40 shadow-kiosk-inner">
                <svg width="38" height="38" viewBox="0 0 1024 1024" aria-hidden>
                  <use href="/icons.svg#mizan-glyph" />
                </svg>
              </span>
            </button>
          </div>
        )}

        {/* Jump back to today when browsing */}
        {!isToday && (
          <button
            type="button"
            onClick={() => setDayOffset(0)}
            className="bg-mizan-surfaceSoft text-mizan-text mx-auto shrink-0 rounded-2xl px-5 py-2 text-sm font-semibold active:scale-95"
          >
            Back to Today
          </button>
        )}
      </div>
    </>
  );
}

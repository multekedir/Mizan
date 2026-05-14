import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { usePeopleStore } from '../../stores/peopleStore';
import { useGoalStore } from '../../stores/goalStore';
import { GoalFormModal } from '../goals/GoalFormModal';
import { getZonedDayOfWeek } from '../../lib/logicalDay';
import type { TaskRow } from '../../db/database';

// ── Prayer block time options ─────────────────────────────────────────────────

const TIME_BLOCKS: { key: string; label: string; value: string }[] = [
  { key: 'after fajr',    label: 'Fajr',    value: 'After Fajr' },
  { key: 'after dhuhr',   label: 'Dhuhr',   value: 'After Dhuhr' },
  { key: 'after asr',     label: 'Asr',      value: 'After Asr' },
  { key: 'after maghrib', label: 'Maghrib',  value: 'After Maghrib' },
  { key: 'before isha',   label: 'Pre-Isha', value: 'Before Isha' },
  { key: 'after isha',    label: 'Isha',     value: 'After Isha' },
  { key: 'before sleep',  label: 'Sleep',    value: 'Before Sleep' },
  { key: 'before jum',    label: "Jumu'ah",  value: "Before Jumu'ah" },
  { key: 'during nap',    label: 'Nap',      value: 'During Nap' },
];

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function detectBlock(time: string | undefined): string | undefined {
  if (!time) return undefined;
  const lower = time.toLowerCase().trim();
  return TIME_BLOCKS.find((b) => lower.startsWith(b.key))?.key;
}

function parseSchedule(schedule?: string): {
  freq: 'daily' | 'weekly' | 'monthly';
  weekDay: number;
  monthDay: number;
} {
  const today = new Date();
  if (!schedule || schedule === 'daily') {
    return { freq: 'daily', weekDay: today.getDay(), monthDay: today.getDate() };
  }
  if (schedule.startsWith('weekly')) {
    const day = parseInt(schedule.split(':')[1] ?? String(today.getDay()));
    return { freq: 'weekly', weekDay: isNaN(day) ? today.getDay() : day, monthDay: today.getDate() };
  }
  if (schedule.startsWith('monthly')) {
    const day = parseInt(schedule.split(':')[1] ?? String(today.getDate()));
    return { freq: 'monthly', weekDay: today.getDay(), monthDay: isNaN(day) ? today.getDate() : day };
  }
  return { freq: 'daily', weekDay: today.getDay(), monthDay: today.getDate() };
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  task?: TaskRow | null;
  open: boolean;
  onClose: () => void;
}

export function TaskEditModal({ task, open, onClose }: Props) {
  const editTask = useTaskStore((s) => s.editTask);
  const addTask = useTaskStore((s) => s.addTask);
  const people = usePeopleStore((s) => s.people);
  const goals = useGoalStore((s) => s.goals);

  const isCreate = !task;

  const [title, setTitle] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [timeBlock, setTimeBlock] = useState<string | undefined>(undefined);
  const [duration, setDuration] = useState('');
  const [goalId, setGoalId] = useState<string | undefined>(undefined);
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  const [isRecurring, setIsRecurring] = useState(false);
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [weekDay, setWeekDay] = useState(getZonedDayOfWeek());
  const [monthDay, setMonthDay] = useState(new Date().getDate());

  const inputRef = useRef<HTMLInputElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sync form with task prop when modal opens */
  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title);
        setAssignees(task.assignee ? task.assignee.split(', ').filter(Boolean) : []);
        setTimeBlock(detectBlock(task.time));
        setDuration(task.duration ?? '');
        setGoalId(task.goalId);
        setIsRecurring(task.recurring);
        const parsed = parseSchedule(task.schedule);
        setFreq(parsed.freq);
        setWeekDay(parsed.weekDay);
        setMonthDay(parsed.monthDay);
      } else {
        setTitle('');
        setAssignees(people[0] ? [people[0].name] : []);
        setTimeBlock(undefined);
        setDuration('');
        setGoalId(undefined);
        setIsRecurring(false);
        setFreq('daily');
        setWeekDay(getZonedDayOfWeek());
        setMonthDay(new Date().getDate());
      }
      setGoalModalOpen(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, task, people]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleAssignee(name: string) {
    setAssignees((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function toggleBlock(key: string) {
    setTimeBlock((prev) => (prev === key ? undefined : key));
  }

  async function save() {
    if (!title.trim()) return;

    const time = timeBlock ? TIME_BLOCKS.find((b) => b.key === timeBlock)?.value : undefined;
    const assigneeValue = assignees.length > 0 ? assignees.join(', ') : 'Family';
    const schedule = isRecurring
      ? freq === 'daily' ? 'daily'
        : freq === 'weekly' ? `weekly:${weekDay}`
        : `monthly:${monthDay}`
      : undefined;

    if (isCreate) {
      await addTask(title.trim(), assigneeValue, isRecurring, schedule, time, duration.trim() || undefined, undefined, goalId);
    } else {
      const finalGoalId: string | null | undefined =
        task!.goalId === goalId ? undefined
        : goalId === undefined ? null
        : goalId;

      const newSchedule = schedule ?? null;
      const recurringChanged = isRecurring !== task!.recurring;
      const scheduleChanged = newSchedule !== (task!.schedule ?? null);
      const finalRecurring = recurringChanged ? isRecurring : undefined;
      const finalSchedule = (recurringChanged || scheduleChanged) ? newSchedule : undefined;

      const realId = task!.id.startsWith('proj-') ? task!.id.slice(5) : task!.id;
      await editTask(realId, title.trim(), assigneeValue, time, duration.trim() || undefined, finalGoalId, finalRecurring, finalSchedule);
    }
    onClose();
  }

  const linkedGoal = goals.find((g) => g.id === goalId);

  return (
    <>
      <GoalFormModal
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        onCreated={(id) => { setGoalId(id); setGoalModalOpen(false); }}
        nested
      />

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={onClose}
            />

            {/* Centered card */}
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
              <motion.div
                key="card"
                initial={{ opacity: 0, scale: 0.92, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 16 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="kiosk-allow-select w-full max-w-sm max-h-full overflow-y-auto"
              >
                <div className="bg-mizan-surface rounded-3xl shadow-2xl border border-mizan-surfaceSoft overflow-hidden">

                  {/* Header */}
                  <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <h2 className="text-mizan-text text-base font-bold">{isCreate ? 'Add Task' : 'Edit Task'}</h2>
                    <button
                      type="button"
                      onClick={onClose}
                      className="text-mizan-text/30 hover:text-mizan-text transition-colors"
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" strokeWidth={2} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-4 px-5 pb-5">

                    {/* Title */}
                    <input
                      ref={inputRef}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void save();
                        if (e.key === 'Escape') onClose();
                      }}
                      className="border-mizan-surfaceSoft bg-mizan-bg focus:ring-mizan-success w-full rounded-2xl border px-4 py-2.5 text-sm font-medium outline-none focus:ring-2"
                      placeholder="Task title…"
                    />

                    {/* Assignee — multi-select */}
                    <div>
                      <p className="text-mizan-text/50 mb-2 text-xs font-semibold uppercase tracking-wide">
                        For
                        {assignees.length > 1 && (
                          <span className="ml-1.5 text-mizan-accent normal-case tracking-normal">
                            {assignees.length === people.length
                              ? 'Family task'
                              : assignees.join(' & ')}
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {people.map((p) => {
                          const selected = assignees.includes(p.name);
                          return (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => toggleAssignee(p.name)}
                              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors active:scale-95 ${
                                selected
                                  ? 'bg-mizan-accent text-mizan-textOnDark'
                                  : 'bg-mizan-surfaceSoft text-mizan-text'
                              }`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Prayer block picker */}
                    <div>
                      <p className="text-mizan-text/50 mb-2 text-xs font-semibold uppercase tracking-wide">Time</p>
                      <div className="grid grid-cols-3 gap-2">
                        {TIME_BLOCKS.map((b) => {
                          const selected = timeBlock === b.key;
                          return (
                            <button
                              key={b.key}
                              type="button"
                              onClick={() => toggleBlock(b.key)}
                              className={`rounded-2xl px-2 py-2 text-xs font-semibold transition-all active:scale-95 ${
                                selected
                                  ? 'bg-mizan-success text-mizan-textOnDark'
                                  : 'bg-mizan-surfaceSoft text-mizan-text/60 hover:text-mizan-text'
                              }`}
                            >
                              {b.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Duration */}
                    <div>
                      <p className="text-mizan-text/50 mb-2 text-xs font-semibold uppercase tracking-wide">Duration</p>
                      <input
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void save();
                          if (e.key === 'Escape') onClose();
                        }}
                        className="border-mizan-surfaceSoft bg-mizan-bg focus:ring-mizan-success w-full rounded-2xl border px-4 py-2.5 text-sm font-medium outline-none focus:ring-2"
                        placeholder="e.g. 15 min, 1 hr"
                      />
                    </div>

                    {/* Recurring */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-mizan-text/50 text-xs font-semibold uppercase tracking-wide">Recurring</p>
                        <button
                          type="button"
                          onClick={() => setIsRecurring((v) => !v)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors active:scale-95 ${
                            isRecurring ? 'bg-mizan-success' : 'bg-mizan-surfaceSoft'
                          }`}
                          aria-pressed={isRecurring}
                        >
                          <span
                            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              isRecurring ? 'translate-x-[22px]' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>

                      <AnimatePresence initial={false}>
                        {isRecurring && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                          >
                            <div className="flex flex-col gap-3">
                              {/* Frequency */}
                              <div className="flex gap-2">
                                {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                                  <button
                                    key={f}
                                    type="button"
                                    onClick={() => setFreq(f)}
                                    className={`flex-1 rounded-2xl py-2 text-xs font-semibold capitalize transition-all active:scale-95 ${
                                      freq === f
                                        ? 'bg-mizan-accent text-mizan-textOnDark'
                                        : 'bg-mizan-surfaceSoft text-mizan-text/60 hover:text-mizan-text'
                                    }`}
                                  >
                                    {f}
                                  </button>
                                ))}
                              </div>

                              {/* Weekly — day of week */}
                              {freq === 'weekly' && (
                                <div className="grid grid-cols-7 gap-1">
                                  {WEEK_DAYS.map((d, i) => (
                                    <button
                                      key={d}
                                      type="button"
                                      onClick={() => setWeekDay(i)}
                                      className={`rounded-xl py-1.5 text-[10px] font-bold transition-all active:scale-95 ${
                                        weekDay === i
                                          ? 'bg-mizan-accent text-mizan-textOnDark'
                                          : 'bg-mizan-surfaceSoft text-mizan-text/50 hover:text-mizan-text'
                                      }`}
                                    >
                                      {d}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Monthly — day of month stepper */}
                              {freq === 'monthly' && (
                                <div className="flex items-center gap-3">
                                  <span className="text-mizan-text/50 text-xs font-semibold">Day of month</span>
                                  <div className="ml-auto flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setMonthDay((d) => Math.max(1, d - 1))}
                                      className="bg-mizan-surfaceSoft text-mizan-text flex h-8 w-8 items-center justify-center rounded-full text-base font-bold active:scale-95"
                                    >
                                      −
                                    </button>
                                    <span className="text-mizan-text w-6 text-center text-sm font-bold">{monthDay}</span>
                                    <button
                                      type="button"
                                      onClick={() => setMonthDay((d) => Math.min(31, d + 1))}
                                      className="bg-mizan-surfaceSoft text-mizan-text flex h-8 w-8 items-center justify-center rounded-full text-base font-bold active:scale-95"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Goal linker */}
                    <div>
                      <p className="text-mizan-text/50 mb-2 text-xs font-semibold uppercase tracking-wide">Goal</p>

                      {goals.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => setGoalModalOpen(true)}
                          className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-mizan-surfaceSoft px-4 py-2.5 text-sm text-mizan-text/50 transition-colors hover:border-mizan-accent hover:text-mizan-accent active:scale-95"
                        >
                          <Plus className="h-4 w-4" strokeWidth={2.5} />
                          <span>Create a goal</span>
                        </button>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {goals.map((g) => {
                            const selected = goalId === g.id;
                            return (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => setGoalId(selected ? undefined : g.id)}
                                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors active:scale-95 ${
                                  selected
                                    ? 'bg-mizan-accent text-mizan-textOnDark'
                                    : 'bg-mizan-surfaceSoft text-mizan-text'
                                }`}
                              >
                                <span className="max-w-[140px] truncate">{g.title}</span>
                                {selected && <X className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2.5} />}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => setGoalModalOpen(true)}
                            className="flex items-center gap-1 rounded-full bg-mizan-surfaceSoft px-3 py-1.5 text-sm font-semibold text-mizan-text/50 transition-colors hover:text-mizan-accent active:scale-95"
                            title="Create new goal"
                          >
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                          </button>
                        </div>
                      )}

                      {linkedGoal && (
                        <p className="text-mizan-text/40 mt-1.5 text-xs">
                          Linked to "{linkedGoal.title}"
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void save()}
                        disabled={!title.trim()}
                        className="bg-mizan-success text-mizan-textOnDark flex-1 rounded-2xl py-3 text-sm font-semibold transition-opacity disabled:opacity-40 active:scale-95"
                      >
                        {isCreate ? 'Add' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="bg-mizan-surfaceSoft text-mizan-text rounded-2xl px-5 py-3 text-sm font-semibold active:scale-95"
                      >
                        Cancel
                      </button>
                    </div>

                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

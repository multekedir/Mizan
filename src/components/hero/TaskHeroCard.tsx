import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, X } from 'lucide-react';
import type { TaskRow } from '../../db/database';
import { useTaskStore } from '../../stores/taskStore';
import { usePeopleStore } from '../../stores/peopleStore';
import { TaskEditModal } from './TaskEditModal';

const PRAYER_BLOCK_PREFIXES = [
  'before jum', 'after fajr', 'after dhuhr', 'after asr',
  'after maghrib', 'before isha', 'after isha', 'before sleep', 'during nap',
];

function isPrayerBlockTime(time: string | null | undefined): boolean {
  if (!time) return false;
  const lower = time.toLowerCase().trim();
  return PRAYER_BLOCK_PREFIXES.some((p) => lower.startsWith(p));
}

function initials(name: string): string {
  if (name === 'Both') return '♡';
  if (name.includes(',')) return '♡';  // multi-person family task
  const p = name.trim().split(/\s+/);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function displayAssignee(name: string): string {
  if (name === 'Both') return 'Mom & Dad';
  if (name.includes(',')) return name.split(', ').filter(Boolean).join(' & ');
  return name;
}

interface Props {
  task: TaskRow;
  onToggle: () => void;
  onDelete?: () => void;
  hidePrayerTime?: boolean;
}

export function TaskHeroCard({ task, onToggle, onDelete, hidePrayerTime = false }: Props) {
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const moveToNextDay = useTaskStore((s) => s.moveToNextDay);
  const gradientFor = usePeopleStore((s) => s.gradientFor);

  const [editOpen, setEditOpen] = useState(false);
  const [confirmingMove, setConfirmingMove] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // For multi-person tasks use the first person's gradient
  const primaryAssignee = task.assignee.split(', ')[0] ?? task.assignee;
  const ring = gradientFor(primaryAssignee);

  return (
    <>
      <TaskEditModal task={task} open={editOpen} onClose={() => setEditOpen(false)} />

      <motion.div layout className="card-mizan">
        {/* Main row */}
        <div
          className={`flex min-h-[72px] items-center gap-2 px-4 py-3 sm:gap-3 ${task.completed ? 'opacity-60' : ''}`}
        >
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-mizan-text sm:h-12 sm:w-12 ${ring}`}
          >
            {initials(task.assignee)}
          </div>

          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="min-w-0 flex-1 text-left"
            aria-label={`Edit task: ${task.title}`}
          >
            <p
              className={`text-mizan-text whitespace-normal break-words text-base font-semibold leading-snug ${
                task.completed ? 'line-through opacity-80' : ''
              }`}
            >
              {task.title}
            </p>
            <p className="text-mizan-text/60 whitespace-normal break-words text-xs">
              {displayAssignee(task.assignee)}
              {task.time && !(hidePrayerTime && isPrayerBlockTime(task.time))
                ? <span className="ml-1.5 text-mizan-success font-medium">· {task.time}</span>
                : null}
              {task.duration ? <span className="ml-1.5 text-mizan-text/40">· {task.duration}</span> : null}
            </p>
          </button>

          {/* Move to next day */}
          <button
            type="button"
            onClick={() => setConfirmingMove((v) => !v)}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-base transition-colors active:scale-95 ${
              confirmingMove
                ? 'bg-mizan-success/20 text-mizan-success'
                : 'text-mizan-text/30 hover:text-mizan-success'
            }`}
            aria-label="Move to next day"
            title="Move to tomorrow"
          >
            <ArrowRight className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => {
              if (task.recurring) {
                setConfirmingDelete((v) => !v);
              } else if (onDelete) {
                onDelete();
              } else {
                void deleteTask(task.id);
              }
            }}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition-colors active:scale-95 ${
              confirmingDelete
                ? 'bg-mizan-accent/20 text-mizan-warning'
                : 'text-mizan-text/30 hover:text-mizan-warning'
            }`}
            aria-label={`Delete ${task.title}`}
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>

          {/* Complete */}
          <button
            type="button"
            onClick={onToggle}
            className="border-mizan-warning focus:ring-mizan-accent flex h-11 w-11 items-center justify-center rounded-full border-2 bg-transparent transition-transform active:scale-95 focus:outline-none focus:ring-2 sm:h-12 sm:w-12"
            aria-pressed={task.completed}
            aria-label={`Complete ${task.title}`}
          >
            {task.completed ? (
              <motion.span
                initial={{ scale: 0.3, rotate: -40 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                className="bg-mizan-accent flex h-8 w-8 items-center justify-center rounded-full text-mizan-textOnDark"
              >
                <Check className="h-5 w-5" strokeWidth={3} />
              </motion.span>
            ) : null}
          </button>
        </div>

        {/* Move confirmation panel */}
        <AnimatePresence>
          {confirmingMove && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 border-t border-mizan-surfaceSoft/60 px-4 py-3">
                <p className="text-mizan-text/70 text-sm">Move to tomorrow?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingMove(false)}
                    className="bg-mizan-surfaceSoft text-mizan-text rounded-2xl px-4 py-1.5 text-sm font-semibold active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveToNextDay(task.id)}
                    className="bg-mizan-success text-white inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-1.5 text-sm font-semibold active:scale-95"
                  >
                    Move
                    <ArrowRight className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete confirmation panel — recurring tasks only */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 border-t border-mizan-surfaceSoft/60 px-4 py-3">
                <p className="text-mizan-text/70 text-sm">Remove recurring task?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="bg-mizan-surfaceSoft text-mizan-text rounded-2xl px-4 py-1.5 text-sm font-semibold active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { void moveToNextDay(task.id); setConfirmingDelete(false); }}
                    className="bg-mizan-surfaceSoft text-mizan-text rounded-2xl px-4 py-1.5 text-sm font-semibold active:scale-95"
                  >
                    Skip today
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteTask(task.id)}
                    className="bg-mizan-accent text-mizan-textOnDark rounded-2xl px-4 py-1.5 text-sm font-semibold active:scale-95"
                  >
                    Remove all
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

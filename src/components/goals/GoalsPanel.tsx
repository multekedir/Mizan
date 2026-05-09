import { useState } from 'react';
import { GoalFormModal } from './GoalFormModal';
import {
  Heart,
  BookOpen,
  Moon,
  Users,
  Home,
  Dumbbell,
  Calendar,
  Target,
  Plus,
  X,
  Check,
} from 'lucide-react';
import { useGoalStore } from '../../stores/goalStore';
import { usePeopleStore } from '../../stores/peopleStore';
import { motion, AnimatePresence } from 'framer-motion';
import type { GoalRow } from '../../db/database';

// ── Category visuals ──────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  iman:        <Heart className="w-5 h-5" />,
  quran:       <BookOpen className="w-5 h-5" />,
  prayer:      <Moon className="w-5 h-5" />,
  dua:         <Heart className="w-5 h-5" />,
  charity:     <Heart className="w-5 h-5" />,
  parenting:   <Users className="w-5 h-5" />,
  fasting:     <Moon className="w-5 h-5" />,
  spiritual:   <Heart className="w-5 h-5" />,
  home:        <Home className="w-5 h-5" />,
  fitness:     <Dumbbell className="w-5 h-5" />,
  review:      <Calendar className="w-5 h-5" />,
  default:     <Target className="w-5 h-5" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  iman:        'text-rose-600 bg-rose-100',
  quran:       'text-amber-600 bg-amber-100',
  prayer:      'text-indigo-600 bg-indigo-100',
  dua:         'text-rose-600 bg-rose-100',
  charity:     'text-rose-600 bg-rose-100',
  parenting:   'text-sky-600 bg-sky-100',
  fasting:     'text-purple-600 bg-purple-100',
  spiritual:   'text-violet-600 bg-violet-100',
  home:        'text-orange-600 bg-orange-100',
  fitness:     'text-lime-600 bg-lime-100',
  review:      'text-neutral-600 bg-neutral-100',
  default:     'text-mizan-text bg-mizan-surfaceSoft',
};

// ── Assignee avatar (mirrors task card style) ─────────────────────────────────

function AssigneeAvatar({ name }: { name?: string }) {
  const gradientFor = usePeopleStore((s) => s.gradientFor);
  if (!name) return null;
  const initials = name.slice(0, 2).toUpperCase();
  const gradient = gradientFor(name);
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-mizan-text ${gradient}`}
    >
      {initials}
    </span>
  );
}

// ── Goal row ──────────────────────────────────────────────────────────────────

function GoalItem({ goal }: { goal: GoalRow }) {
  const toggleComplete = useGoalStore((s) => s.toggleComplete);
  const deleteGoal = useGoalStore((s) => s.deleteGoal);
  const progress = useGoalStore((s) => s.goalProgress[goal.id]);

  const key = goal.category?.toLowerCase() || 'default';
  const icon = CATEGORY_ICONS[key] ?? CATEGORY_ICONS.default;
  const colorClass = CATEGORY_COLORS[key] ?? CATEGORY_COLORS.default;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-start gap-3 rounded-3xl bg-mizan-surfaceSoft p-3"
    >
      {/* Icon */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${colorClass}`}>
        {icon}
      </div>

      {/* Title + assignee + progress */}
      <div className="min-w-0 flex-1 pt-1">
        <p className={`text-mizan-text text-sm font-semibold leading-snug ${goal.completed ? 'line-through opacity-50' : ''}`}>
          {goal.title}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {goal.assignee && (() => {
            const names = goal.assignee.split(', ').filter(Boolean);
            return (
              <>
                <div className="flex -space-x-1.5">
                  {names.map((n) => <AssigneeAvatar key={n} name={n} />)}
                </div>
                <span className="text-mizan-text/60 text-xs font-medium">
                  {names.length > 1 ? names.join(' & ') : names[0]}
                </span>
              </>
            );
          })()}
          {progress && progress.total > 0 && (
            <span className="text-mizan-text/50 text-xs">
              {progress.completed}/{progress.total} tasks
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => void deleteGoal(goal.id)}
          className="text-mizan-text/25 hover:text-mizan-warning flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors active:scale-95"
          aria-label={`Delete ${goal.title}`}
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>

        <button
          type="button"
          onClick={() => void toggleComplete(goal.id)}
          className={`flex h-9 w-9 items-center justify-center rounded-2xl border-2 transition-all active:scale-95 ${
            goal.completed
              ? 'bg-mizan-success border-mizan-success text-white'
              : 'border-mizan-text/30 hover:border-mizan-success'
          }`}
          aria-pressed={goal.completed}
          aria-label={`Toggle ${goal.title}`}
        >
          {goal.completed && (
            <motion.span
              initial={{ scale: 0.4 }}
              animate={{ scale: 1 }}
              className="flex items-center justify-center"
            >
              <Check className="h-5 w-5" strokeWidth={3} />
            </motion.span>
          )}
        </button>
      </div>
    </motion.li>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function GoalsPanel() {
  const goals = useGoalStore((s) => s.goals);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <GoalFormModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <div className="card-mizan text-mizan-text flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide opacity-60">Goals</h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="bg-mizan-surfaceSoft text-mizan-text hover:bg-mizan-accent hover:text-mizan-textOnDark flex h-8 w-8 items-center justify-center rounded-full transition-colors active:scale-95"
          aria-label="Add goal"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>

      <ul className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {goals.length === 0 ? (
          <li className="text-sm opacity-50">
            No goals for today — import via Admin or tap +.
          </li>
        ) : (
          <AnimatePresence initial={false}>
            {goals.map((g) => <GoalItem key={g.id} goal={g} />)}
          </AnimatePresence>
        )}
      </ul>
    </div>
    </>
  );
}

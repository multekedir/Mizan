import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, BookOpen, Moon, Users, Home, Dumbbell,
  Calendar, Target, X,
} from 'lucide-react';
import { useGoalStore } from '../../stores/goalStore';
import { usePeopleStore } from '../../stores/peopleStore';

// ── Category picker data ──────────────────────────────────────────────────────

const CATEGORIES: { key: string; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'iman',      label: 'Iman',      icon: <Heart className="w-5 h-5" />,    color: 'text-rose-600 bg-rose-100' },
  { key: 'quran',     label: 'Quran',     icon: <BookOpen className="w-5 h-5" />, color: 'text-amber-600 bg-amber-100' },
  { key: 'prayer',    label: 'Prayer',    icon: <Moon className="w-5 h-5" />,     color: 'text-indigo-600 bg-indigo-100' },
  { key: 'parenting', label: 'Parenting', icon: <Users className="w-5 h-5" />,    color: 'text-sky-600 bg-sky-100' },
  { key: 'home',      label: 'Home',      icon: <Home className="w-5 h-5" />,     color: 'text-orange-600 bg-orange-100' },
  { key: 'fitness',   label: 'Fitness',   icon: <Dumbbell className="w-5 h-5" />, color: 'text-lime-600 bg-lime-100' },
  { key: 'spiritual', label: 'Spiritual', icon: <Heart className="w-5 h-5" />,    color: 'text-violet-600 bg-violet-100' },
  { key: 'fasting',   label: 'Fasting',   icon: <Moon className="w-5 h-5" />,     color: 'text-purple-600 bg-purple-100' },
  { key: 'review',    label: 'Review',    icon: <Calendar className="w-5 h-5" />, color: 'text-neutral-600 bg-neutral-100' },
  { key: 'default',   label: 'Other',     icon: <Target className="w-5 h-5" />,   color: 'text-mizan-text bg-mizan-surfaceSoft' },
];

function inferCategoryKey(title: string): string | undefined {
  const t = title.toLowerCase();
  if (/iman|quran|dhikr|dua|prayer|spiritual|deen|faith|allah|worship|tafsir/.test(t)) return 'iman';
  if (/fit|health|exercise|workout|gym|weight|active|body/.test(t)) return 'fitness';
  if (/clean|house|home|tidy|organiz|room|kitchen|bathroom|declutter/.test(t)) return 'home';
  if (/child|kid|parent|parenting|family|gentle/.test(t)) return 'parenting';
  if (/study|learn|knowledge|read|book/.test(t)) return 'review';
  if (/sabr|patient|patience|calm/.test(t)) return 'spiritual';
  if (/productiv|focus|discipline|habit/.test(t)) return 'review';
  return undefined;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  nested?: boolean;
}

export function GoalFormModal({ open, onClose, onCreated, nested = false }: Props) {
  const addGoal = useGoalStore((s) => s.addGoal);
  const people = usePeopleStore((s) => s.people);

  const [title, setTitle] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [manualCategory, setManualCategory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- reset form when `open` is true */
  useEffect(() => {
    if (open) {
      setTitle('');
      setAssignees([]);
      setCategory(undefined);
      setManualCategory(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, people]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- category derived from title */
  useEffect(() => {
    if (!manualCategory) {
      setCategory(inferCategoryKey(title) ?? undefined);
    }
  }, [title, manualCategory]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleAssignee(name: string) {
    setAssignees((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  async function submit() {
    if (!title.trim()) return;
    const resolved = category ?? 'default';
    const cat = resolved === 'default' ? undefined : resolved;
    const assigneeValue = assignees.length > 0 ? assignees.join(', ') : undefined;
    const id = await addGoal(title.trim(), assigneeValue, true, cat);
    onCreated?.(id);
    onClose();
  }

  const resolvedCategory = category ?? 'default';
  const catData = CATEGORIES.find((c) => c.key === resolvedCategory) ?? CATEGORIES[CATEGORIES.length - 1];

  return (
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
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm ${nested ? 'z-[60]' : 'z-40'}`}
            onClick={onClose}
          />

          {/* Centered container */}
          <div className={`fixed inset-0 flex items-center justify-center px-4 ${nested ? 'z-[70]' : 'z-50'}`}>
            <motion.div
              key="card"
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="kiosk-allow-select w-full max-w-sm"
            >
              <div className="bg-mizan-surface rounded-3xl shadow-2xl border border-mizan-surfaceSoft overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <h2 className="text-mizan-text text-base font-bold">New Goal</h2>
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

                  {/* Title + live category preview */}
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors ${catData.color}`}>
                      {catData.icon}
                    </div>
                    <input
                      ref={inputRef}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submit();
                        if (e.key === 'Escape') onClose();
                      }}
                      className="border-mizan-surfaceSoft bg-mizan-bg focus:ring-mizan-success min-w-0 flex-1 rounded-2xl border px-4 py-2.5 text-sm font-medium outline-none focus:ring-2"
                      placeholder="What's your goal?"
                    />
                  </div>

                  {/* Category picker */}
                  <div>
                    <p className="text-mizan-text/50 mb-2 text-xs font-semibold uppercase tracking-wide">Category</p>
                    <div className="grid grid-cols-5 gap-2">
                      {CATEGORIES.map((cat) => {
                        const selected = resolvedCategory === cat.key;
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => { setCategory(cat.key); setManualCategory(true); }}
                            className={`flex flex-col items-center gap-1 rounded-2xl p-2 transition-all active:scale-95 ${
                              selected
                                ? `${cat.color} ring-2 ring-offset-1 ring-current`
                                : 'bg-mizan-surfaceSoft text-mizan-text/50 hover:text-mizan-text'
                            }`}
                            title={cat.label}
                          >
                            {cat.icon}
                            <span className="text-[10px] font-semibold leading-none">{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Assignee picker — multi-select */}
                  <div>
                    <p className="text-mizan-text/50 mb-2 text-xs font-semibold uppercase tracking-wide">
                      For
                      {assignees.length > 1 && (
                        <span className="ml-1.5 text-mizan-accent normal-case tracking-normal">
                          {assignees.length === people.length
                            ? 'Family goal'
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

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={!title.trim()}
                      className="bg-mizan-success text-mizan-textOnDark flex-1 rounded-2xl py-3 text-sm font-semibold transition-opacity disabled:opacity-40 active:scale-95"
                    >
                      Add Goal
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
  );
}

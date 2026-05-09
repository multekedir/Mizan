import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Sparkles, X } from 'lucide-react';
import { useAllDoneCelebrationStore } from '../../stores/allDoneCelebrationStore';

const MESSAGES = [
  'Alhamdulillah! Every single task — done. May Allah accept it all.',
  'MashaAllah! You finished your entire day\'s plan. Keep going with barakah.',
  'Alhamdulillah! The whole day, completed. Your consistency is beautiful.',
  'Well done! A full day of intention and action. May it be full of barakah.',
  'SubhanAllah! Every task done — may each deed weigh heavy on your scales.',
  'MashaAllah! An entire day lived with intention. Truly beautiful.',
  'Alhamdulillah! You showed up and followed through. May Allah reward your effort.',
  'Well done! Small consistent steps lead to big change. Today was a great one.',
];

function pick(): string {
  return MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
}

function AllDoneToast({ goalTitle, taskCount }: { goalTitle: string; taskCount: number }) {
  const dismiss = useAllDoneCelebrationStore((s) => s.dismiss);

  useEffect(() => {
    const id = setTimeout(dismiss, 6000);
    return () => clearTimeout(id);
  }, [dismiss]);

  const message = pick();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="pointer-events-auto mx-auto w-full max-w-sm"
    >
      <div className="rounded-3xl border border-mizan-accent/20 bg-mizan-surface shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-mizan-accent via-mizan-success to-mizan-accent" />
        <div className="flex items-start gap-3 p-4">
          <Sparkles className="text-mizan-accent mt-0.5 h-7 w-7 shrink-0" aria-hidden strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <p className="text-mizan-text text-sm leading-relaxed">{message}</p>
            <p className="text-mizan-text/40 mt-2 flex items-center gap-1 text-xs whitespace-normal break-words">
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden />
              <span>
                All {taskCount} tasks complete · {goalTitle}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-mizan-text/30 hover:text-mizan-text mt-0.5 shrink-0 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function AllTasksCelebration() {
  const active = useAllDoneCelebrationStore((s) => s.active);

  return (
    <AnimatePresence>
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
          <AllDoneToast key={active.key} goalTitle={active.goalTitle} taskCount={active.taskCount} />
        </div>
      )}
    </AnimatePresence>
  );
}

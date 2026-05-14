import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Sparkles, X } from 'lucide-react';
import type { CategoryKey } from '../../lib/categories';
import { useCelebrationStore } from '../../stores/celebrationStore';

const CELEBRATION_MESSAGES = {
  iman: [
    'Alhamdulillah! Another beautiful step closer to Allah. Small consistent deeds are most beloved to Him ❤️',
    "MashaAllah! You're nurturing your Iman with sincerity. May Allah accept every effort from you.",
    "SubhanAllah! Every bit of worship you do is seen and rewarded. Keep going with barakah.",
    'Beautiful! Consistency in Iman is true success. Allah is pleased with your striving.',
  ],

  fitness: [
    'Well done! Taking care of your body is a form of gratitude to Allah. Keep honoring this blessing.',
    "Great effort! Your health is an amanah (trust). You're doing something very valuable.",
    'MashaAllah! Every step toward fitness is an act of self-care and self-respect.',
  ],

  house: [
    "Alhamdulillah! A clean and peaceful home brings so much barakah. You're creating that.",
    'Wonderful! Your home feels calmer and more welcoming already. Thank you for your effort.',
    'Beautiful work! A tidy home lifts the spirits of the whole family.',
    'MashaAllah! Taking care of your home is an act of worship. May Allah put barakah in it.',
    "Well done! A clean home is a blessing. You're making it a place of peace and rest.",
    'Alhamdulillah! Every small effort to organize and clean is seen by Allah. Keep going.',
    'Your home is starting to feel more peaceful. This kind of care is truly valuable.',
    "Beautiful! Maintaining a clean home is part of half our faith. You're doing beautifully.",
    'Such a blessing to have a tidy space. May Allah reward your intention and hard work.',
    "You're not just cleaning — you're creating a calm sanctuary for your family. MashaAllah!",
    'The Prophet ﷺ helped with household chores. Your efforts are following his beautiful example.',
    "A clean home makes it easier for the heart to focus on worship. You're doing something meaningful.",
  ],

  parenting: [
    'MashaAllah! Being intentional and gentle with your child is one of the greatest deeds.',
    "Such beautiful effort. The love and presence you're giving your child is priceless.",
    'Well done! Patience with children is a form of worship. May Allah reward you abundantly.',
  ],

  productivity: [
    "Great focus! You're building discipline and making the most of your time.",
    'Well done! Small consistent actions lead to big results. Keep the momentum going!',
  ],

  knowledge: [
    "MashaAllah! Seeking knowledge is a path to Paradise. May Allah increase you in it.",
    "Beautiful! Every bit of learning brings you closer to understanding Allah's deen.",
  ],

  patience: [
    'Alhamdulillah! Practicing patience is one of the heaviest deeds on the scale.',
    "You're doing beautifully. Sabr is truly beautiful. Allah is with the patient ones.",
  ],

  generic: [
    'Alhamdulillah! You completed another task toward your goal. Keep going with barakah.',
    "Well done! Every small win adds up. You're making real progress inshaAllah.",
    'Beautiful effort! Consistency is the key. May Allah bless your intentions and actions.',
    "You're doing great! Small steps lead to big changes over time. Stay consistent ❤️",
  ],
};

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Maps goal.category values directly to message buckets
const CATEGORY_BUCKET: Partial<Record<CategoryKey, keyof typeof CELEBRATION_MESSAGES>> = {
  iman:      'iman',
  quran:     'iman',
  prayer:    'iman',
  spiritual: 'iman',
  fasting:   'iman',
  fitness:   'fitness',
  home:      'house',
  parenting: 'parenting',
  review:    'productivity',
};

function getMessage(goalTitle: string, goalCategory?: CategoryKey): string {
  // Check explicit category first (most reliable)
  if (goalCategory) {
    const bucket = CATEGORY_BUCKET[goalCategory];
    if (bucket) return pick(CELEBRATION_MESSAGES[bucket]);
  }

  // Fall back to regex on title
  const t = goalTitle.toLowerCase();
  if (/iman|quran|dhikr|dua|prayer|spiritual|deen|faith|allah|worship|tafsir/.test(t))
    return pick(CELEBRATION_MESSAGES.iman);
  if (/fit|health|exercise|workout|gym|weight|active|body/.test(t))
    return pick(CELEBRATION_MESSAGES.fitness);
  if (/clean|house|home|tidy|organiz|room|kitchen|bathroom|declutter/.test(t))
    return pick(CELEBRATION_MESSAGES.house);
  if (/child|kid|parent|parenting|family|gentle/.test(t))
    return pick(CELEBRATION_MESSAGES.parenting);
  if (/study|learn|knowledge|read|book/.test(t))
    return pick(CELEBRATION_MESSAGES.knowledge);
  if (/sabr|patient|patience|calm/.test(t))
    return pick(CELEBRATION_MESSAGES.patience);
  if (/productiv|focus|discipline|habit/.test(t))
    return pick(CELEBRATION_MESSAGES.productivity);

  return pick(CELEBRATION_MESSAGES.generic);
}

function CelebrationToast({ goalTitle, goalCategory, taskTitle }: { goalTitle: string; goalCategory?: CategoryKey; taskTitle: string }) {
  const dismiss = useCelebrationStore((s) => s.dismiss);

  useEffect(() => {
    const id = setTimeout(dismiss, 6000);
    return () => clearTimeout(id);
  }, [dismiss]);

  const message = getMessage(goalTitle, goalCategory);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="pointer-events-auto mx-auto w-full max-w-sm"
    >
      <div className="rounded-3xl border border-mizan-accent/20 bg-mizan-surface shadow-2xl overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-mizan-accent via-mizan-success to-mizan-accent" />
        <div className="flex items-start gap-3 p-4">
          <Sparkles className="text-mizan-accent mt-0.5 h-7 w-7 shrink-0" aria-hidden strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <p className="text-mizan-text text-sm leading-relaxed">{message}</p>
            <p className="text-mizan-text/40 mt-2 flex items-center gap-1 text-xs whitespace-normal break-words">
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden />
              <span>
                {taskTitle} · {goalTitle}
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

export function GoalCelebration() {
  const active = useCelebrationStore((s) => s.active);

  return (
    <AnimatePresence>
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
          <CelebrationToast key={active.key} goalTitle={active.goalTitle} goalCategory={active.goalCategory} taskTitle={active.taskTitle} />
        </div>
      )}
    </AnimatePresence>
  );
}

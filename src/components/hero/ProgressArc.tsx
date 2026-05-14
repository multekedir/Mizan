import { motion } from 'framer-motion';

interface Props {
  completed: number;
  total: number;
}

const PARTICLES = Array.from({ length: 24 }, (_, i) => {
  const angle = (i * 360) / 24;
  const dist = 80 + (i % 4) * 18;
  const size = 4 + (i % 3) * 3;
  const colors = ['#D2A04A', '#A67B32', '#F0C878', '#C8902A'];
  return { id: i, angle, dist, size, color: colors[i % 4], delay: (i / 24) * 0.5 };
});

function CelebrationBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {PARTICLES.map((p) => {
        const rad = ((p.angle - 90) * Math.PI) / 180;
        const tx = Math.cos(rad) * p.dist;
        const ty = Math.sin(rad) * p.dist;
        return (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{ width: p.size, height: p.size, backgroundColor: p.color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
            animate={{ x: tx, y: ty, opacity: 0, scale: 1 }}
            transition={{ delay: p.delay, duration: 1.0, ease: [0.2, 0.8, 0.4, 1] }}
          />
        );
      })}
    </div>
  );
}

export function ProgressArc({ completed, total }: Props) {
  const pct = total > 0 ? Math.min(1, completed / total) : 0;
  const allDone = total > 0 && completed >= total;
  const safeTotal = Math.max(0, total);

  const a11y =
    safeTotal > 0
      ? ({
          role: 'progressbar' as const,
          'aria-valuenow': completed,
          'aria-valuemin': 0,
          'aria-valuemax': safeTotal,
          'aria-label': `${completed} of ${safeTotal} tasks completed`,
        } as const)
      : { 'aria-label': 'No tasks for this day' };

  return (
    <motion.div layout className="relative mx-auto w-full max-w-[280px] min-h-[5.5rem] px-1" {...a11y}>
      {allDone && <CelebrationBurst />}

      <div className="relative z-10 flex flex-col items-center pt-1 text-center">
        <motion.span
          key={completed}
          initial={{ scale: 0.92, opacity: 0.75 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="text-mizan-text text-4xl font-bold tabular-nums tracking-tight"
        >
          {completed}
        </motion.span>
        <p className="text-mizan-textMuted mt-0.5 text-sm font-medium tabular-nums">
          of {safeTotal} task{safeTotal === 1 ? '' : 's'} completed
        </p>

        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-mizan-border/50">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#C4A06A] via-mizan-accent to-mizan-success"
            initial={false}
            animate={{ width: `${pct * 100}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 20 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

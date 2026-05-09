import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  completed: number;
  total: number;
}

const CX = 100;
const CY = 100;

const RINGS = [
  { r: 78, color: 'rgba(210, 160, 74, 0.4)', width: 8 },
  { r: 64, color: 'rgba(210, 160, 74, 0.65)', width: 7 },
  { r: 50, color: 'rgba(166, 123, 50, 0.95)', width: 6 },
];

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

  return (
    <motion.div layout className="relative mx-auto w-full max-w-[210px]">
      <AnimatePresence mode="sync" initial={false}>
        {allDone ? (
          <motion.div
            key="full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="relative"
          >
            {/* Full circle rings */}
            <svg viewBox="0 0 200 200" className="w-full" aria-hidden>
              {RINGS.map(({ r, color, width }, i) => {
                const circ = 2 * Math.PI * r;
                return (
                  <motion.circle
                    key={i}
                    cx={CX}
                    cy={CY}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={width}
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    initial={{ strokeDashoffset: circ }}
                    animate={{ strokeDashoffset: 0 }}
                    transform={`rotate(-90 ${CX} ${CY})`}
                    transition={{ delay: i * 0.1 + 0.1, type: 'spring', stiffness: 60, damping: 18 }}
                  />
                );
              })}
            </svg>

            {/* Centered text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              <motion.span
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.35, type: 'spring', stiffness: 200, damping: 15 }}
                className="text-mizan-text text-4xl font-bold tabular-nums"
              >
                {completed}
              </motion.span>
              <span className="text-mizan-text/70 text-sm font-medium tabular-nums">
                {completed}/{total} tasks
              </span>
            </div>

            <CelebrationBurst />
          </motion.div>
        ) : (
          <motion.div
            key="arc"
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Semicircle arc */}
            <svg viewBox="0 20 200 82" className="w-full overflow-visible" aria-hidden>
              {RINGS.map(({ r, color, width }, i) => {
                const len = Math.PI * r;
                return (
                  <motion.path
                    key={i}
                    d={`M ${CX - r} ${CY} A ${r} ${r} 0 0 0 ${CX + r} ${CY}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={width}
                    strokeLinecap="round"
                    strokeDasharray={`${len}`}
                    initial={{ strokeDashoffset: len }}
                    animate={{ strokeDashoffset: len * (1 - pct) }}
                    transition={{ type: 'spring', stiffness: 80, damping: 18 }}
                  />
                );
              })}
            </svg>

            {/* Text below the arc in normal flow */}
            <div className="flex flex-col items-center pt-3 pb-1 text-center">
              <motion.span
                key={completed}
                initial={{ scale: 0.85, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-mizan-text text-4xl font-bold tabular-nums"
              >
                {completed}
              </motion.span>
              <span className="text-mizan-text/70 text-sm font-medium tabular-nums">
                {completed}/{total || 0} tasks
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

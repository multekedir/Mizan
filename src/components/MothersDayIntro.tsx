import { useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const AUTO_DISMISS_MS = 60_000;

function envMothersDayIntroEnabled(): boolean {
  const v = String(import.meta.env.VITE_MOTHERS_DAY_INTRO ?? '')
    .trim()
    .toLowerCase();

  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * Splash on initial load when enabled.
 * Same URL as the app; no query params or extra routes required.
 */
export function shouldShowMothersDayIntro(): boolean {
  if (typeof window === 'undefined') return false;
  return envMothersDayIntroEnabled();
}

type Props = {
  onDismiss: () => void;
};

export function MothersDayIntro({ onDismiss }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onDismissRef = useRef(onDismiss);

  onDismissRef.current = onDismiss;

  const dismiss = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    onDismissRef.current();
  }, []);

  useEffect(() => {
    timerRef.current = window.setTimeout(() => {
      dismiss();
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [dismiss]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mothers-day-heading"
      tabIndex={0}
      onClick={() => dismiss()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          e.preventDefault();
          dismiss();
        }
      }}
      className="
        fixed inset-0 z-[9999]
        flex cursor-pointer items-center justify-center
        overflow-hidden
        bg-[#eadbb8]
        px-10 text-[#12352e]
        font-sans
      "
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.65 }}
    >
      {/* Warm background glow */}
      <div
        className="
          pointer-events-none absolute inset-0
          bg-[radial-gradient(circle_at_50%_36%,rgba(255,250,238,0.95)_0%,rgba(234,219,184,0.94)_52%,rgba(205,169,92,0.42)_100%)]
        "
        aria-hidden
      />

      <motion.main
        className="
          relative z-10
          grid h-[72vh] max-h-[640px] w-full max-w-[1040px]
          grid-cols-[1fr_1fr]
          overflow-hidden
          rounded-[2rem]
          border border-[#d6c28b]
          bg-[#fff8e8]
          shadow-[0_38px_110px_rgba(73,52,18,0.20)]
        "
        initial={{ opacity: 0, y: 22, rotate: -0.45, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, rotate: -0.45, scale: 1 }}
        transition={{ delay: 0.12, duration: 0.7, ease: 'easeOut' }}
      >
        {/* Subtle postcard paper texture */}
        <div
          className="
            pointer-events-none absolute inset-0
            opacity-[0.22]
            bg-[linear-gradient(90deg,rgba(120,90,30,0.045)_1px,transparent_1px),linear-gradient(rgba(120,90,30,0.028)_1px,transparent_1px)]
            bg-[size:36px_36px]
          "
          aria-hidden
        />

        {/* Left side */}
        <section className="relative flex flex-col justify-start px-14 pt-16 pb-12">
          <h1
            id="mothers-day-heading"
            className="
              font-display text-[4.25rem] font-normal leading-[0.95]
              tracking-[-0.045em] text-[#10372f]
            "
          >
            Happy
            <br />
            Mother&apos;s Day
          </h1>

          <div
            className="mt-8 h-px w-28 bg-gradient-to-r from-[#bda85f] to-transparent"
            aria-hidden
          />

          <p className="mt-8 max-w-md text-[1.06rem] font-medium leading-relaxed text-[#64786e]">
            We made Mizan for you
            <br />
            to make your days lighter
            <br />
            and your heart a little more at ease.
          </p>

          <p className="mt-8 font-handwriting text-[2rem] leading-none text-[#587166]">
            From Multi and Zaydu
          </p>
        </section>

        {/* Dashed postcard divider */}
        <div
          className="
            absolute bottom-10 left-1/2 top-10
            w-px border-l border-dashed border-[#cdbb7d]
          "
          aria-hidden
        />

        {/* Right side poem */}
        <section className="relative flex flex-col px-12 pt-14 pb-10">
          <div
            className="
              mt-2 max-w-md
              font-handwriting text-[2.5rem] leading-[1.1]
              tracking-normal text-[#173c34]
            "
          >
            <p>you are my star</p>
            <p>that guides me at night,</p>

            <p className="mt-8">my moon</p>
            <p>that lights my darkness,</p>

            <p className="mt-8">my sun</p>
            <p>that brightens my day.</p>
          </div>

          <div className="mt-auto space-y-4 pb-1">
            <div className="h-px w-full bg-[#d9c990]" />
            <div className="h-px w-10/12 bg-[#d9c990]" />
            <div className="h-px w-8/12 bg-[#d9c990]" />

            <p className="pt-2 text-right text-[0.92rem] font-semibold tracking-wide text-[#7b8d80]/70">
              Tap anywhere to continue
            </p>
          </div>
        </section>
      </motion.main>
    </motion.div>
  );
}

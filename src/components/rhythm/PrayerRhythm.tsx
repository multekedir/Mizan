import { useEffect, useMemo, useState } from 'react';
import {
  getAthanPrayer,
  getFivePrayers,
  getNextPrayerInfo,
  getPrayerTimesForDate,
} from '../../services/prayerService';
import { PRAYER_ICONS } from '../../lib/prayerIcons';
import { useSettingsStore } from '../../stores/settingsStore';

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function PrayerRhythm() {
  const { included, showAthan } = useSettingsStore((s) => s.prayerConfig);
  const prayerCalcKey = useSettingsStore(
    (s) => `${s.prayerConfig.madhab}-${s.prayerConfig.calculationMethod}`,
  );

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setTick((x) => x + 1), 30000);
    return () => window.clearInterval(interval);
  }, []);

  const now = useMemo(() => {
    void tick;
    return new Date();
  }, [tick]);

  const pt = useMemo(() => {
    void prayerCalcKey;
    return getPrayerTimesForDate(now);
  }, [now, prayerCalcKey]);
  const allEntries = useMemo(() => getFivePrayers(pt), [pt]);
  const entries = useMemo(
    () => allEntries.filter((e) => included.includes(e.key)),
    [allEntries, included],
  );

  const { nextKey, currentKey } = useMemo(() => {
    void prayerCalcKey;
    return getNextPrayerInfo(now);
  }, [now, prayerCalcKey]);
  const athanKey = useMemo(() => {
    void prayerCalcKey;
    if (!showAthan) return null;
    return getAthanPrayer(now)?.key ?? null;
  }, [now, showAthan, prayerCalcKey]);

  return (
    <div className="card-mizan text-mizan-text shrink-0 flex flex-col gap-2 p-4">
      <h2 className="text-sm font-bold uppercase tracking-widest opacity-60 mb-1">
        Prayer Times
      </h2>

      <ul className="flex flex-col gap-1">
        {entries.map((e) => {
          const isAthan = e.key === athanKey;
          const isNext = e.key === nextKey;
          const isCurrent = e.key === currentKey;
          const isHighlighted = isNext;

          const Icon = PRAYER_ICONS[e.key];
          const iconClass =
            isAthan
              ? 'text-mizan-accent h-6 w-6'
              : isHighlighted
                ? 'text-mizan-accent h-5 w-5'
                : isCurrent
                  ? 'text-mizan-success h-5 w-5'
                  : 'text-mizan-text/30 h-5 w-5';

          return (
            <li
              key={e.key}
              className={`flex items-center justify-between rounded-2xl px-4 py-3 transition-all ${
                isAthan
                  ? 'bg-mizan-accent/15 ring-2 ring-mizan-accent animate-pulse'
                  : isHighlighted
                    ? 'bg-mizan-accent/10 ring-1 ring-mizan-accent/50'
                    : isCurrent
                      ? 'bg-mizan-success/10'
                      : 'hover:bg-mizan-surfaceSoft/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`${iconClass} shrink-0`}
                  aria-hidden
                  strokeWidth={isAthan ? 2.25 : 2}
                />

                <span
                  className={`font-medium ${isAthan || isHighlighted ? 'text-mizan-accent' : ''}`}
                >
                  {e.label}
                </span>
              </div>

              <span
                className={`tabular-nums font-semibold ${
                  isAthan || isHighlighted ? 'text-mizan-accent' : 'text-mizan-text/80'
                }`}
              >
                {formatTime(e.time)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

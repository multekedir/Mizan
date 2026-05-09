import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatCountdown,
  getAthanPrayer,
  getNextPrayerInfo,
} from '../../services/prayerService';
import { lucideIconForNextPrayer, PRAYER_ICONS } from '../../lib/prayerIcons';
import type { PrayerEntry } from '../../services/prayerService';
import { playAthan, preloadAthan, stopAthan } from '../../services/athanAudio';
import { fetchCurrentWeather } from '../../services/weatherService';
import type { WeatherSnapshot } from '../../services/types';
import { WeatherLucide } from '../weather/WeatherLucide';
import { PRAYER_LABELS, useSettingsStore, type PrayerKey } from '../../stores/settingsStore';

function clockParts(d: Date): { time: string; ampm: string } {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return { time: `${h12}:${String(m).padStart(2, '0')}`, ampm };
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function gregorianDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function hijriDate(d: Date): string {
  try {
    return d.toLocaleDateString('en-u-ca-islamic', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function HeaderBar() {
  const showAthanSetting = useSettingsStore((s) => s.prayerConfig.showAthan);
  const athanEnabledSetting = useSettingsStore((s) => s.prayerConfig.athanEnabled);
  const showHijriSetting = useSettingsStore((s) => s.prayerConfig.showHijri);
  const prayerCalcKey = useSettingsStore(
    (s) => `${s.prayerConfig.madhab}-${s.prayerConfig.calculationMethod}`,
  );

  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [nextInfo, setNextInfo] = useState(() => getNextPrayerInfo(new Date()));
  const [athanPrayer, setAthanPrayer] = useState<PrayerEntry | null>(() => getAthanPrayer(new Date()));
  const [athanDismissed, setAthanDismissed] = useState(false);

  const prevAthanKey = useRef<string | null>(athanPrayer?.key ?? null);
  // Timestamp when the page last became visible after being hidden (sleep/tab switch)
  const wokenAt = useRef<Date | null>(null);

  useEffect(() => {
    preloadAthan();
  }, []);

  // Track screen sleep: record the moment page becomes visible again
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        wokenAt.current = new Date();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      const n = new Date();
      const cfg = useSettingsStore.getState().prayerConfig;
      setNow(n);
      setNextInfo(getNextPrayerInfo(n));
      const athan = cfg.showAthan ? getAthanPrayer(n) : null;
      setAthanPrayer(athan);

      const newKey = athan?.key ?? null;
      const mayPlaySound =
        cfg.athanEnabled &&
        newKey !== null &&
        cfg.athanPrayers.includes(newKey as PrayerKey);

      if (newKey !== null && newKey !== prevAthanKey.current) {
        setAthanDismissed(false);
        const missedDuringSleep =
          wokenAt.current !== null && athan!.time < wokenAt.current;
        if (mayPlaySound && !missedDuringSleep) {
          playAthan(newKey as PrayerKey);
        }
        if (
          cfg.notificationsEnabled &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          const label = PRAYER_LABELS[newKey as PrayerKey] ?? newKey;
          try {
            new Notification(`${label}`, {
              body: 'Prayer time — Mizan',
              tag: `mizan-athan-${newKey}`,
            });
          } catch {
            /* ignore */
          }
        }
      } else if (newKey === null && prevAthanKey.current !== null) {
        stopAthan();
      }
      prevAthanKey.current = newKey;
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if ((!showAthanSetting || !athanEnabledSetting) && prevAthanKey.current) {
      stopAthan();
    }
  }, [showAthanSetting, athanEnabledSetting]);

  /* eslint-disable react-hooks/set-state-in-effect -- refresh prayer-derived state when calculation settings change */
  useEffect(() => {
    const n = new Date();
    setNextInfo(getNextPrayerInfo(n));
    setAthanPrayer(showAthanSetting ? getAthanPrayer(n) : null);
  }, [prayerCalcKey, showAthanSetting]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    void fetchCurrentWeather().then(setWeather);
    const w = window.setInterval(
      () => void fetchCurrentWeather().then(setWeather),
      15 * 60 * 1000,
    );
    return () => window.clearInterval(w);
  }, []);

  function handleAthanTap() {
    if (athanPrayer) {
      stopAthan();
      setAthanDismissed(true);
    }
  }

  const minutesUntil = Math.max(
    0,
    Math.floor((nextInfo.nextTime.getTime() - now.getTime()) / 60000),
  );
  const countdown = formatCountdown(minutesUntil);
  const { time, ampm } = clockParts(now);
  const hijri = hijriDate(now);
  const showAthanCard = showAthanSetting && athanPrayer !== null && !athanDismissed;
  const NextIcon = useMemo(
    () => lucideIconForNextPrayer(nextInfo.nextKey),
    [nextInfo.nextKey],
  );
  const AthanIconEl = athanPrayer ? PRAYER_ICONS[athanPrayer.key] : null;

  return (
    <>
      {/* ── Left: Athan or Next Prayer ── */}
      {showAthanCard ? (
        <button
          type="button"
          onClick={handleAthanTap}
          className="card-mizan flex flex-col justify-center gap-1.5 px-4 py-3 bg-mizan-accent/10 ring-2 ring-mizan-accent/60 text-left active:scale-[0.98] transition-transform"
        >
          <p className="text-mizan-accent text-xs font-semibold uppercase tracking-widest animate-pulse">
            Athan · tap to stop
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {AthanIconEl && (
              <AthanIconEl
                className="text-mizan-accent h-6 w-6 shrink-0 animate-pulse leading-none"
                aria-hidden
                strokeWidth={2.25}
              />
            )}
            <span className="text-mizan-accent text-2xl font-bold leading-none">
              {athanPrayer.label}
            </span>
          </div>
        </button>
      ) : (
        <div className="card-mizan text-mizan-text flex flex-col justify-center gap-1.5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-50">
            Next Prayer
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {createElement(NextIcon, {
              className: 'text-mizan-accent h-5 w-5 shrink-0 leading-none',
              'aria-hidden': true,
              strokeWidth: 2,
            })}
            <span className="text-xl font-bold leading-none">
              {nextInfo.nextName}
            </span>
            <span className="text-mizan-accent text-base font-semibold leading-none">
              in {countdown}
            </span>
          </div>
        </div>
      )}

      {/* ── Center: Greeting + Date ── */}
      <div className="card-mizan text-mizan-text flex flex-col items-center justify-center gap-1 px-4 py-3 text-center">
        <p className="text-2xl font-bold leading-tight">
          {greeting(now)}
        </p>
        <p className="text-xs font-medium opacity-60">{gregorianDate(now)}</p>
        {showHijriSetting && hijri ? (
          <p className="text-xs opacity-40">{hijri}</p>
        ) : null}
      </div>

      {/* ── Right: Weather + Clock ── */}
      <div className="card-mizan text-mizan-text flex items-center justify-between gap-4 px-4 py-3">
        {/* Weather stack */}
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-50">
            Weather
          </p>
          {weather ? (
            <>
              <p className="flex items-center gap-2.5 text-xs font-semibold capitalize">
                <WeatherLucide name={weather.lucideIcon} className="text-mizan-text h-9 w-9 shrink-0" />
                {weather.description}
              </p>
              <p className="text-lg font-bold">{weather.tempC}°C</p>
            </>
          ) : (
            <p className="text-xs opacity-40">Loading…</p>
          )}
        </div>

        {/* Clock */}
        <div className="flex items-start tabular-nums">
          <span className="text-5xl font-bold tracking-tight">
            {time}
          </span>
          <span className="ml-1 mt-1 text-lg font-bold opacity-70">
            {ampm}
          </span>
        </div>
      </div>
    </>
  );
}

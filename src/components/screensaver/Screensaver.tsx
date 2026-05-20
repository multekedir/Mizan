import { createElement, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { formatCountdown, getNextPrayerInfo } from '../../services/prayerService';
import { lucideIconForNextPrayer } from '../../lib/prayerIcons';
import { fetchCurrentWeather } from '../../services/weatherService';
import type { WeatherSnapshot } from '../../services/types';
import { WeatherLucide } from '../weather/WeatherLucide';

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

interface Props {
  onDismiss: () => void;
}

export function Screensaver({ onDismiss }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [nextInfo, setNextInfo] = useState(() => getNextPrayerInfo(new Date()));
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  // Clock + prayer ticker
  useEffect(() => {
    const t = window.setInterval(() => {
      const n = new Date();
      setNow(n);
      setNextInfo(getNextPrayerInfo(n));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // Fetch weather once (hits the in-memory cache — essentially free)
  useEffect(() => {
    void fetchCurrentWeather().then(setWeather);
  }, []);

  const minutesUntil = Math.max(
    0,
    Math.floor((nextInfo.nextTime.getTime() - now.getTime()) / 60000),
  );
  const countdown = formatCountdown(minutesUntil);

  const h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const timeStr = `${h12}:${String(m).padStart(2, '0')}`;

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const hijri = hijriDate(now);

  const NextIcon = useMemo(
    () => lucideIconForNextPrayer(nextInfo.nextKey),
    [nextInfo.nextKey],
  );

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-12 overflow-hidden cursor-pointer select-none"
      style={{ background: 'linear-gradient(160deg, #173B34 0%, #0D2823 60%, #071510 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      onPointerDown={onDismiss}
    >
      {/* Radial gold glow behind center */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(210,160,74,0.10) 0%, transparent 70%)',
        }}
      />

      {/* ── Clock ── */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-start leading-none">
          <span
            className="font-display tabular-nums text-mizan-textOnDark"
            style={{ fontSize: '11rem', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}
          >
            {timeStr}
          </span>
          <span className="ml-4 mt-8 text-kiosk-2xl font-bold text-mizan-textOnDark/55">
            {ampm}
          </span>
        </div>
        <p className="text-kiosk-xl text-mizan-textOnDark/45 tracking-wide">{dateStr}</p>
        {hijri && (
          <p className="text-kiosk-sm text-mizan-textOnDark/25 tracking-wide">{hijri}</p>
        )}
      </div>

      {/* Thin divider */}
      <div className="h-px w-72 rounded-full bg-mizan-textOnDark/10" />

      {/* ── Weather + Prayer ── */}
      <div className="flex items-center gap-20">

        {/* Weather */}
        {weather ? (
          <div className="flex flex-col items-center gap-3">
            <WeatherLucide
              name={weather.lucideIcon}
              className="h-14 w-14 text-mizan-accentGlow"
            />
            <p className="text-kiosk-3xl font-bold text-mizan-textOnDark leading-none">
              {weather.tempF}°F
            </p>
            <p className="text-kiosk-base text-mizan-textOnDark/45 capitalize">
              {weather.description}
            </p>
          </div>
        ) : (
          <div className="w-32" />
        )}

        {/* Vertical divider */}
        <div className="h-24 w-px rounded-full bg-mizan-textOnDark/10" />

        {/* Next prayer */}
        <div className="flex flex-col items-center gap-3">
          {createElement(NextIcon, {
            className: 'h-12 w-12 text-mizan-accent',
            strokeWidth: 1.75,
          })}
          <p className="text-kiosk-3xl font-bold text-mizan-textOnDark leading-none">
            {nextInfo.nextName}
          </p>
          <p className="text-kiosk-lg text-mizan-accent font-semibold">in {countdown}</p>
        </div>
      </div>

      {/* Tap hint */}
      <p
        className="absolute bottom-8 text-mizan-textOnDark/20 tracking-widest uppercase"
        style={{ fontSize: '0.75rem' }}
      >
        tap anywhere to continue
      </p>
    </motion.div>
  );
}

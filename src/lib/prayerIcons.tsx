import type { LucideIcon } from 'lucide-react';
import { Moon, Sun, SunMedium, Sunrise, Sunset } from 'lucide-react';
import type { NextPrayerKey, PrayerKey } from '../services/prayerService';

/** Lucide icons by prayer — visual cue for time of day */
export const PRAYER_ICONS: Record<PrayerKey, LucideIcon> = {
  fajr: Sunrise,
  dhuhr: Sun,
  asr: SunMedium,
  maghrib: Sunset,
  isha: Moon,
};

/** Next prayer from adhan may be `sunrise` (not in the five-prayer list). */
export function lucideIconForNextPrayer(key: NextPrayerKey): LucideIcon {
  if (key === 'sunrise') return Sunrise;
  return PRAYER_ICONS[key as PrayerKey] ?? Moon;
}

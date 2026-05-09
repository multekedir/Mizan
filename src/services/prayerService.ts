import {
  Coordinates,
  CalculationMethod,
  PrayerTimes,
  Madhab,
  Prayer,
} from 'adhan';
import type {
  PrayerCalculationMethodId,
  PrayerConfig,
  PrayerMadhab,
} from '../stores/settingsStore';

/** Portland, Oregon — can be made configurable later */
const DEFAULT_COORDINATES = new Coordinates(45.5152, -122.6784);

const METHOD_BUILDERS: Record<
  PrayerCalculationMethodId,
  () => ReturnType<typeof CalculationMethod.NorthAmerica>
> = {
  NorthAmerica: CalculationMethod.NorthAmerica,
  MuslimWorldLeague: CalculationMethod.MuslimWorldLeague,
  Egyptian: CalculationMethod.Egyptian,
};

let activeMadhab: PrayerMadhab = 'Shafi';
let activeMethod: PrayerCalculationMethodId = 'NorthAmerica';
const activeCoordinates = DEFAULT_COORDINATES;

function buildCalculationParams() {
  const builder = METHOD_BUILDERS[activeMethod] ?? METHOD_BUILDERS.NorthAmerica;
  const params = builder();
  params.madhab = activeMadhab === 'Hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  return params;
}

/** Call this whenever `PrayerConfig` changes in the store */
export function applyPrayerCalculationFromConfig(cfg: PrayerConfig): void {
  activeMadhab = cfg.madhab === 'Hanafi' ? 'Hanafi' : 'Shafi';
  activeMethod =
    cfg.calculationMethod in METHOD_BUILDERS ? cfg.calculationMethod : 'NorthAmerica';
}

export type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

/** Keys returned by `nextPrayer` (excluding `none`). */
export type NextPrayerKey = Exclude<ReturnType<PrayerTimes['nextPrayer']>, 'none'>;

export const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

const NEXT_PRAYER_NAME: Record<NextPrayerKey, string> = {
  fajr: PRAYER_LABELS.fajr,
  sunrise: 'Sunrise',
  dhuhr: PRAYER_LABELS.dhuhr,
  asr: PRAYER_LABELS.asr,
  maghrib: PRAYER_LABELS.maghrib,
  isha: PRAYER_LABELS.isha,
};

const NEXT_KEY_TO_PRAYER: Record<NextPrayerKey, (typeof Prayer)[keyof typeof Prayer]> = {
  fajr: Prayer.Fajr,
  sunrise: Prayer.Sunrise,
  dhuhr: Prayer.Dhuhr,
  asr: Prayer.Asr,
  maghrib: Prayer.Maghrib,
  isha: Prayer.Isha,
};

export interface PrayerEntry {
  key: PrayerKey;
  label: string;
  time: Date;
}

export function getPrayerTimesForDate(baseDate: Date): PrayerTimes {
  return new PrayerTimes(activeCoordinates, baseDate, buildCalculationParams());
}

export function getFivePrayers(pt: PrayerTimes): PrayerEntry[] {
  return [
    { key: 'fajr', label: PRAYER_LABELS.fajr, time: pt.fajr },
    { key: 'dhuhr', label: PRAYER_LABELS.dhuhr, time: pt.dhuhr },
    { key: 'asr', label: PRAYER_LABELS.asr, time: pt.asr },
    { key: 'maghrib', label: PRAYER_LABELS.maghrib, time: pt.maghrib },
    { key: 'isha', label: PRAYER_LABELS.isha, time: pt.isha },
  ];
}

export function getNextPrayerInfo(now: Date = new Date()): {
  nextName: string;
  nextTime: Date;
  nextKey: NextPrayerKey;
  currentKey: PrayerKey | null;
  timeUntilNext: number;
} {
  const pt = getPrayerTimesForDate(now);
  const rawNext = pt.nextPrayer(now);

  if (rawNext === 'none') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pt2 = getPrayerTimesForDate(tomorrow);
    const nextTime = pt2.fajr;

    return {
      nextName: PRAYER_LABELS.fajr,
      nextTime,
      nextKey: 'fajr',
      currentKey: 'isha',
      timeUntilNext: Math.max(0, Math.floor((nextTime.getTime() - now.getTime()) / 60000)),
    };
  }

  const nextKey = rawNext;
  const nextTime = pt.timeForPrayer(NEXT_KEY_TO_PRAYER[nextKey])!;
  const currentRaw = pt.currentPrayer(now);
  const currentKey: PrayerKey | null =
    currentRaw === 'none' || currentRaw === 'sunrise' ? null : (currentRaw as PrayerKey);

  return {
    nextName: NEXT_PRAYER_NAME[nextKey],
    nextTime,
    nextKey,
    currentKey,
    timeUntilNext: Math.max(0, Math.floor((nextTime.getTime() - now.getTime()) / 60000)),
  };
}

const ATHAN_WINDOW_MS = 5 * 60 * 1000;

export function getAthanPrayer(now: Date = new Date()): PrayerEntry | null {
  const pt = getPrayerTimesForDate(now);
  const prayers = getFivePrayers(pt);

  for (const prayer of prayers) {
    const elapsed = now.getTime() - prayer.time.getTime();
    if (elapsed >= 0 && elapsed < ATHAN_WINDOW_MS) {
      return prayer;
    }
  }
  return null;
}

/** @param minutes Whole minutes until next prayer (floored). */
export function formatCountdown(minutes: number): string {
  if (minutes < 0) minutes = 0;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

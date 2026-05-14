export const ALL_PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerKey = (typeof ALL_PRAYER_KEYS)[number];

export const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

export const PRAYER_MADHABS = ['Shafi', 'Hanafi'] as const;
export type PrayerMadhab = (typeof PRAYER_MADHABS)[number];

export const CALC_METHOD_IDS = ['NorthAmerica', 'MuslimWorldLeague', 'Egyptian'] as const;
export type PrayerCalculationMethodId = (typeof CALC_METHOD_IDS)[number];

export const ATHAN_STYLES = ['mecca', 'medina', 'simple'] as const;
export type AthanStyle = (typeof ATHAN_STYLES)[number];

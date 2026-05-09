export const PRAYER_BLOCK_ORDER = [
  'after-fajr',
  'during-nap',
  'before-jumuah',
  'after-dhuhr',
  'after-asr',
  'after-maghrib',
  'before-isha',
  'after-isha',
  'before-sleep',
] as const;

export type PrayerBlockKey = (typeof PRAYER_BLOCK_ORDER)[number];

export const PRAYER_BLOCK_DISPLAY: Record<PrayerBlockKey, string> = {
  'after-fajr':    'After Fajr (Morning Block)',
  'during-nap':    'During Nap',
  'before-jumuah': "Before Jumu'ah (Pre-Prayer Block)",
  'after-dhuhr':   "After Dhuhr / After Jumu'ah (Midday Block)",
  'after-asr':     'After Asr (Afternoon Block)',
  'after-maghrib': 'After Maghrib (Evening Block)',
  'before-isha':   'Before Isha (Pre-Night Block)',
  'after-isha':    'After Isha (Night Block)',
  'before-sleep':  'Before Sleep (Wind-down)',
};

export function getPrayerBlockKey(time: string | null | undefined): PrayerBlockKey | null {
  if (!time) return null;
  const t = time.toLowerCase().trim();

  if (t.startsWith('after fajr'))                                      return 'after-fajr';
  if (t.startsWith('during nap') || t.startsWith("during child"))      return 'during-nap';
  if (t.startsWith('before jum') || t.startsWith('before friday'))     return 'before-jumuah';
  if (t.startsWith('after dhuhr') || t.startsWith('after jum') ||
      t.startsWith('after friday'))                                      return 'after-dhuhr';
  if (t.startsWith('after asr'))                                        return 'after-asr';
  if (t.startsWith('after maghrib'))                                    return 'after-maghrib';
  if (t.startsWith('before isha'))                                      return 'before-isha';
  if (t.startsWith('after isha'))                                       return 'after-isha';
  if (t.startsWith('before sleep'))                                     return 'before-sleep';

  return null;
}

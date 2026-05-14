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
  'after-fajr': 'After Fajr (Morning Block)',
  'during-nap': 'During Nap',
  'before-jumuah': "Before Jumu'ah (Pre-Prayer Block)",
  'after-dhuhr': "After Dhuhr / After Jumu'ah (Midday Block)",
  'after-asr': 'After Asr (Afternoon Block)',
  'after-maghrib': 'After Maghrib (Evening Block)',
  'before-isha': 'Before Isha (Pre-Night Block)',
  'after-isha': 'After Isha (Night Block)',
  'before-sleep': 'Before Sleep (Wind-down)',
};

const PRAYER_BLOCK_PATTERNS: Array<{
  key: PrayerBlockKey;
  patterns: RegExp[];
}> = [
  {
    key: 'after-fajr',
    patterns: [/^after\s+fajr\b/, /^post[-\s]?fajr\b/],
  },
  {
    key: 'during-nap',
    patterns: [
      /^during\s+nap\b/,
      /^nap\s*time\b/,
      /^during\s+(child|baby|toddler).*\bnap\b/,
    ],
  },
  {
    key: 'before-jumuah',
    patterns: [
      /^before\s+jum(u'?ah|mah)\b/,
      /^pre[-\s]?jum(u'?ah|mah)\b/,
      /^before\s+friday\s+prayer\b/,
    ],
  },
  {
    key: 'after-dhuhr',
    patterns: [
      /^after\s+(dhuhr|duhr|zuhr)\b/,
      /^after\s+jum(u'?ah|mah)\b/,
      /^post[-\s]?(dhuhr|duhr|zuhr)\b/,
      /^after\s+friday\s+prayer\b/,
    ],
  },
  {
    key: 'after-asr',
    patterns: [/^after\s+asr\b/, /^post[-\s]?asr\b/],
  },
  {
    key: 'after-maghrib',
    patterns: [/^after\s+maghrib\b/, /^post[-\s]?maghrib\b/],
  },
  {
    key: 'before-isha',
    patterns: [/^before\s+isha\b/, /^pre[-\s]?isha\b/],
  },
  {
    key: 'after-isha',
    patterns: [/^after\s+isha\b/, /^post[-\s]?isha\b/],
  },
  {
    key: 'before-sleep',
    patterns: [/^before\s+sleep\b/, /^bedtime\b/, /^before\s+bed\b/, /^wind[-\s]?down\b/],
  },
];

export function getPrayerBlockKey(time: string | null | undefined): PrayerBlockKey | null {
  if (!time) return null;

  const normalized = time
    .toLowerCase()
    .trim()
    .replace(/['‘’]/g, "'")
    .replace(/\s+/g, ' ');

  for (const block of PRAYER_BLOCK_PATTERNS) {
    if (block.patterns.some((pattern) => pattern.test(normalized))) {
      return block.key;
    }
  }

  return null;
}

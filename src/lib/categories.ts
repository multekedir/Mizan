import type { ReactNode } from 'react';

export type CategoryKey =
  | 'iman'
  | 'quran'
  | 'prayer'
  | 'parenting'
  | 'home'
  | 'fitness'
  | 'spiritual'
  | 'fasting'
  | 'review'
  | 'default';

export type CategoryOption = {
  key: CategoryKey;
  label: string;
  icon: ReactNode;
  color: string;
};

export const CATEGORY_KEYS: readonly CategoryKey[] = [
  'iman',
  'quran',
  'prayer',
  'parenting',
  'home',
  'fitness',
  'spiritual',
  'fasting',
  'review',
  'default',
] as const;

const LEGACY_CATEGORY_ALIASES: Partial<Record<string, CategoryKey>> = {
  dua: 'iman',
  charity: 'iman',
  knowledge: 'review',
};

export function isCategoryKey(value: string): value is CategoryKey {
  return (CATEGORY_KEYS as readonly string[]).includes(value);
}

/**
 * Maps stored or user-entered category strings to a canonical key for UI (unknown → default).
 */
export function normalizeCategoryKey(raw: string | undefined | null): CategoryKey {
  if (!raw) return 'default';
  const k = raw.trim().toLowerCase();
  if (isCategoryKey(k)) return k;
  return LEGACY_CATEGORY_ALIASES[k] ?? 'default';
}

/**
 * Parses import/API strings: returns undefined if the value is not a known category (omit on save).
 */
export function categoryKeyFromImport(raw: unknown): CategoryKey | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (!s) return undefined;
  if (isCategoryKey(s)) return s;
  const mapped = LEGACY_CATEGORY_ALIASES[s];
  return mapped;
}

/** Guess category from goal title (order matters: specific Islamic buckets before broad iman/review). */
export function inferCategoryKey(title: string): CategoryKey | undefined {
  const t = title.toLowerCase();

  if (/\b(quran|qur'an|surah|tafsir|memorize|hifz)\b/i.test(title)) return 'quran';
  if (/\b(prayer|salah|salat|fajr|dhuhr|asr|maghrib|isha|tahajjud)\b/.test(t)) return 'prayer';
  if (/\b(fast|fasting|ramadan|sawm|siyam)\b/.test(t)) return 'fasting';
  if (/\b(dhikr|dua|sabr|patience|calm|spiritual)\b/.test(t)) return 'spiritual';
  if (/\b(iman|deen|faith|allah|worship)\b/.test(t)) return 'iman';

  if (/\b(fit|health|exercise|workout|gym|weight|active|body)\b/.test(t)) return 'fitness';
  if (/\b(clean|house|home|tidy|organize|organized|organization|room|kitchen|bathroom|declutter)\b/.test(t))
    return 'home';
  if (/\b(child|kid|parent|parenting|family|gentle)\b/.test(t)) return 'parenting';
  if (/\b(study|learn|knowledge|read|book|review|productivity|focus|discipline|habit)\b/.test(t)) return 'review';

  return undefined;
}

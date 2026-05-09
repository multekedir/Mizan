import { create } from 'zustand';
import { db } from '../db/database';
import { applyPrayerCalculationFromConfig } from '../services/prayerService';

export type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export const ALL_PRAYER_KEYS: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

export type PrayerMadhab = 'Shafi' | 'Hanafi';

export type PrayerCalculationMethodId = 'NorthAmerica' | 'MuslimWorldLeague' | 'Egyptian';

export type AthanStyle = 'mecca' | 'medina' | 'simple';

const ATHAN_STYLES: AthanStyle[] = ['mecca', 'medina', 'simple'];

const CALC_METHOD_IDS: PrayerCalculationMethodId[] = [
  'NorthAmerica',
  'MuslimWorldLeague',
  'Egyptian',
];

function isPrayerKey(x: unknown): x is PrayerKey {
  return typeof x === 'string' && ALL_PRAYER_KEYS.includes(x as PrayerKey);
}

export interface PrayerConfig {
  included: PrayerKey[];
  madhab: PrayerMadhab;
  calculationMethod: PrayerCalculationMethodId;
  showAthan: boolean;
  showHijri: boolean;
  /** Master switch for athan sound and per-prayer / volume UI */
  athanEnabled: boolean;
  /** Which prayers trigger athan audio (subset of five) */
  athanPrayers: PrayerKey[];
  athanVolume: number;
  athanStyle: AthanStyle;
  notificationsEnabled: boolean;
}

const DEFAULT_PRAYER_CONFIG: PrayerConfig = {
  included: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
  madhab: 'Shafi',
  calculationMethod: 'NorthAmerica',
  showAthan: true,
  showHijri: false,
  athanEnabled: true,
  athanPrayers: [...ALL_PRAYER_KEYS],
  athanVolume: 70,
  athanStyle: 'mecca',
  notificationsEnabled: true,
};

function normalizePrayerConfig(raw: Partial<PrayerConfig>): PrayerConfig {
  const includedRaw = raw.included;
  const included = Array.isArray(includedRaw)
    ? (includedRaw.filter(isPrayerKey) as PrayerKey[])
    : DEFAULT_PRAYER_CONFIG.included;
  const safeIncluded = included.length > 0 ? included : DEFAULT_PRAYER_CONFIG.included;

  const madhab: PrayerMadhab = raw.madhab === 'Hanafi' ? 'Hanafi' : 'Shafi';

  const method =
    typeof raw.calculationMethod === 'string' &&
    CALC_METHOD_IDS.includes(raw.calculationMethod as PrayerCalculationMethodId)
      ? (raw.calculationMethod as PrayerCalculationMethodId)
      : DEFAULT_PRAYER_CONFIG.calculationMethod;

  const showAthan = typeof raw.showAthan === 'boolean' ? raw.showAthan : DEFAULT_PRAYER_CONFIG.showAthan;
  const showHijri = typeof raw.showHijri === 'boolean' ? raw.showHijri : DEFAULT_PRAYER_CONFIG.showHijri;

  const athanEnabled =
    typeof raw.athanEnabled === 'boolean' ? raw.athanEnabled : DEFAULT_PRAYER_CONFIG.athanEnabled;

  const athanPrayersRaw = raw.athanPrayers;
  const athanPrayers = Array.isArray(athanPrayersRaw)
    ? (athanPrayersRaw.filter(isPrayerKey) as PrayerKey[])
    : DEFAULT_PRAYER_CONFIG.athanPrayers;

  let athanVolume = typeof raw.athanVolume === 'number' ? raw.athanVolume : DEFAULT_PRAYER_CONFIG.athanVolume;
  if (Number.isNaN(athanVolume)) athanVolume = DEFAULT_PRAYER_CONFIG.athanVolume;
  athanVolume = Math.max(0, Math.min(100, Math.round(athanVolume)));

  const athanStyle: AthanStyle =
    typeof raw.athanStyle === 'string' && ATHAN_STYLES.includes(raw.athanStyle as AthanStyle)
      ? (raw.athanStyle as AthanStyle)
      : DEFAULT_PRAYER_CONFIG.athanStyle;

  const notificationsEnabled =
    typeof raw.notificationsEnabled === 'boolean'
      ? raw.notificationsEnabled
      : DEFAULT_PRAYER_CONFIG.notificationsEnabled;

  return {
    included: safeIncluded,
    madhab,
    calculationMethod: method,
    showAthan,
    showHijri,
    athanEnabled,
    athanPrayers,
    athanVolume,
    athanStyle,
    notificationsEnabled,
  };
}

interface SettingsState {
  prayerConfig: PrayerConfig;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPrayerConfig: (config: PrayerConfig) => Promise<void>;
  updatePrayerConfig: (partial: Partial<PrayerConfig>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  prayerConfig: DEFAULT_PRAYER_CONFIG,
  hydrated: false,

  hydrate: async () => {
    const row = await db.meta.get('prayerConfig');
    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value) as Partial<PrayerConfig>;
        const merged = normalizePrayerConfig(parsed);
        applyPrayerCalculationFromConfig(merged);
        set({ prayerConfig: merged, hydrated: true });
        return;
      } catch { /* fall through */ }
    }
    applyPrayerCalculationFromConfig(DEFAULT_PRAYER_CONFIG);
    set({ prayerConfig: DEFAULT_PRAYER_CONFIG, hydrated: true });
  },

  setPrayerConfig: async (config) => {
    const next = normalizePrayerConfig(config);
    await db.meta.put({ key: 'prayerConfig', value: JSON.stringify(next) });
    applyPrayerCalculationFromConfig(next);
    set({ prayerConfig: next });
  },

  updatePrayerConfig: async (partial) => {
    const current = get().prayerConfig;
    const next = normalizePrayerConfig({ ...current, ...partial });
    await db.meta.put({ key: 'prayerConfig', value: JSON.stringify(next) });
    applyPrayerCalculationFromConfig(next);
    set({ prayerConfig: next });
  },
}));

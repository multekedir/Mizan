import { useState } from 'react';
import {
  useSettingsStore,
  ALL_PRAYER_KEYS,
  PRAYER_LABELS,
} from '../../../stores/settingsStore';
import type {
  PrayerKey,
  PrayerMadhab,
  PrayerCalculationMethodId,
  AthanStyle,
} from '../../../stores/settingsStore';
import { Select, Switch } from '../PrayerSettingsUi';

type AthanSettingsTab = 'prayers' | 'sound' | 'alerts';

const ATHAN_TABS: { id: AthanSettingsTab; label: string }[] = [
  { id: 'prayers', label: 'Which Prayers' },
  { id: 'sound', label: 'Sound Settings' },
  { id: 'alerts', label: 'Alerts' },
];

export function PrayerSection() {
  const [athanTab, setAthanTab] = useState<AthanSettingsTab>('prayers');

  const prayerConfig = useSettingsStore((s) => s.prayerConfig);
  const updatePrayerConfig = useSettingsStore((s) => s.updatePrayerConfig);

  const isAthanEnabled = prayerConfig.athanEnabled;

  function toggleIncluded(key: PrayerKey) {
    const current = prayerConfig.included;
    let next: PrayerKey[];

    if (current.includes(key)) {
      if (current.length === 1) return;
      next = current.filter((k) => k !== key);
    } else {
      next = [...current, key];
    }

    void updatePrayerConfig({ included: next });
  }

  return (
    <div className="space-y-10">
      <div>
        <p className="text-mizan-text/60 mb-3 text-sm font-semibold uppercase tracking-widest">
          Show in Prayer List
        </p>
        <div className="grid grid-cols-5 gap-2">
          {ALL_PRAYER_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleIncluded(key)}
              className={`rounded-2xl py-3.5 text-sm font-semibold transition-all active:scale-95 ${
                prayerConfig.included.includes(key)
                  ? 'bg-mizan-accent text-mizan-textOnDark shadow-sm'
                  : 'bg-mizan-surfaceSoft text-mizan-text/60 hover:bg-mizan-surface'
              }`}
            >
              {PRAYER_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-mizan-text mb-4 text-lg font-semibold">Calculation Method</h3>
        <div className="bg-mizan-surfaceSoft space-y-5 rounded-3xl p-6">
          <div>
            <label htmlFor="prayer-madhab" className="text-mizan-text mb-2 block text-sm font-medium">
              Madhab
            </label>
            <Select<PrayerMadhab>
              id="prayer-madhab"
              value={prayerConfig.madhab}
              onChange={(v) => void updatePrayerConfig({ madhab: v })}
              options={[
                { value: 'Shafi', label: 'Shafi' },
                { value: 'Hanafi', label: 'Hanafi' },
              ]}
            />
          </div>

          <div>
            <label htmlFor="prayer-calc-method" className="text-mizan-text mb-2 block text-sm font-medium">
              Method
            </label>
            <Select<PrayerCalculationMethodId>
              id="prayer-calc-method"
              value={prayerConfig.calculationMethod}
              onChange={(v) => void updatePrayerConfig({ calculationMethod: v })}
              options={[
                { value: 'NorthAmerica', label: 'North America' },
                { value: 'MuslimWorldLeague', label: 'Muslim World League' },
                { value: 'Egyptian', label: 'Egyptian' },
              ]}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-mizan-text mb-4 text-lg font-semibold">Display Options</h3>
        <div className="space-y-3">
          <div className="bg-mizan-surfaceSoft flex items-center justify-between rounded-2xl px-5 py-4">
            <div>
              <p className="font-medium">Show Athan Indicator</p>
              <p className="text-mizan-text/60 text-xs">Highlight during the first 5 minutes</p>
            </div>
            <Switch
              checked={prayerConfig.showAthan}
              onCheckedChange={(v) => void updatePrayerConfig({ showAthan: v })}
              aria-label="Show athan indicator"
            />
          </div>

          <div className="bg-mizan-surfaceSoft flex items-center justify-between rounded-2xl px-5 py-4">
            <div>
              <p className="font-medium">Show Hijri Date</p>
            </div>
            <Switch
              checked={prayerConfig.showHijri}
              onCheckedChange={(v) => void updatePrayerConfig({ showHijri: v })}
              aria-label="Show Hijri date"
            />
          </div>

          <div className="bg-mizan-surfaceSoft flex items-center justify-between gap-3 rounded-2xl px-5 py-4">
            <div>
              <p className="font-medium">Screensaver</p>
              <p className="text-mizan-text/60 text-xs">Show clock &amp; weather after idle</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('mizan:screensaver:show'))}
                className="rounded-xl bg-mizan-surface px-3 py-2 text-xs font-semibold text-mizan-textMuted transition-colors hover:bg-mizan-accent hover:text-mizan-textOnDark active:scale-95"
              >
                Preview
              </button>
            <select
              id="screensaver-delay"
              value={prayerConfig.screensaverDelay}
              onChange={(e) =>
                void updatePrayerConfig({ screensaverDelay: parseInt(e.target.value, 10) })
              }
              className="border-mizan-surfaceSoft bg-mizan-bg text-mizan-text focus:border-mizan-accent focus:ring-mizan-accentGlow/30 w-28 shrink-0 rounded-2xl border px-4 py-2.5 text-sm font-medium outline-none focus:ring-2"
            >
              <option value={1}>1 min</option>
              <option value={2}>2 min</option>
              <option value={5}>5 min</option>
              <option value={10}>10 min</option>
              <option value={15}>15 min</option>
              <option value={0}>Never</option>
            </select>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-mizan-text mb-4 text-lg font-semibold">Athan &amp; Notifications</h3>

        <div className="border-mizan-border bg-mizan-surfaceSoft rounded-3xl border p-6">
          <div className="border-mizan-border flex items-center justify-between border-b pb-6">
            <div>
              <p className="font-semibold">Enable Athan Audio</p>
              <p className="text-mizan-text/60 text-sm">Play Adhan when prayer time begins</p>
            </div>
            <Switch
              checked={isAthanEnabled}
              onCheckedChange={(v) => void updatePrayerConfig({ athanEnabled: v })}
              aria-label="Enable athan audio"
            />
          </div>

          <div className="mt-6">
            <div
              className="bg-mizan-bg mb-6 flex gap-1 rounded-2xl p-1"
              role="tablist"
              aria-label="Athan settings"
            >
              {ATHAN_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={athanTab === id}
                  onClick={() => setAthanTab(id)}
                  className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all ${
                    athanTab === id
                      ? 'bg-mizan-accent text-mizan-textOnDark shadow-sm'
                      : 'text-mizan-text/70 hover:bg-mizan-surfaceSoft'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {athanTab === 'prayers' && (
              <div role="tabpanel" className="space-y-3">
                {!isAthanEnabled && (
                  <p className="text-mizan-text/50 italic">Enable Athan Audio above to configure per prayer.</p>
                )}
                {ALL_PRAYER_KEYS.map((key) => (
                  <div
                    key={key}
                    className="bg-mizan-bg flex items-center justify-between rounded-2xl px-5 py-4"
                  >
                    <span className="font-medium">{PRAYER_LABELS[key]} Athan</span>
                    <Switch
                      checked={prayerConfig.athanPrayers.includes(key)}
                      onCheckedChange={() => {
                        const current = prayerConfig.athanPrayers;
                        const next = current.includes(key)
                          ? current.filter((k) => k !== key)
                          : [...current, key];
                        void updatePrayerConfig({ athanPrayers: next });
                      }}
                      disabled={!isAthanEnabled}
                      aria-label={`Athan for ${PRAYER_LABELS[key]}`}
                    />
                  </div>
                ))}
              </div>
            )}

            {athanTab === 'sound' && (
              <div role="tabpanel" className="space-y-6">
                <div>
                  <label htmlFor="athan-volume" className="text-mizan-text mb-2 block text-sm font-medium">
                    Volume
                  </label>
                  <input
                    id="athan-volume"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={prayerConfig.athanVolume}
                    onChange={(e) =>
                      void updatePrayerConfig({ athanVolume: parseInt(e.target.value, 10) })
                    }
                    className="accent-mizan-accent w-full"
                  />
                </div>

                <div>
                  <label htmlFor="athan-style" className="text-mizan-text mb-2 block text-sm font-medium">
                    Style
                  </label>
                  <Select<AthanStyle>
                    id="athan-style"
                    value={prayerConfig.athanStyle}
                    onChange={(v) => void updatePrayerConfig({ athanStyle: v })}
                    options={[
                      { value: 'mecca', label: 'Makkah Classic' },
                      { value: 'medina', label: 'Madinah Style' },
                      { value: 'simple', label: 'Simple Tone' },
                    ]}
                  />
                </div>
              </div>
            )}

            {athanTab === 'alerts' && (
              <div role="tabpanel" className="bg-mizan-bg rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Desktop Notifications</p>
                    <p className="text-mizan-text/60 text-sm">Show notification when Athan starts</p>
                  </div>
                  <Switch
                    checked={prayerConfig.notificationsEnabled}
                    onCheckedChange={(v) => {
                      if (v && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                        void Notification.requestPermission();
                      }
                      void updatePrayerConfig({ notificationsEnabled: v });
                    }}
                    aria-label="Desktop notifications"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

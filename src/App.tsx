import { AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useWakeLock } from './hooks/useWakeLock';
import { BackgroundPattern } from './components/BackgroundPattern';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { HeaderBar } from './components/header/HeaderBar';
import { PrayerRhythm } from './components/rhythm/PrayerRhythm';
import { GoalsPanel } from './components/goals/GoalsPanel';
import { TaskHeroSection } from './components/hero/TaskHeroSection';
import { CalendarColumn } from './components/schedule/CalendarColumn';
import { ImportCornerTrigger, ImportModal } from './components/import/ImportModal';
import { AdminPage, AdminTrigger } from './components/admin/AdminPage';
import { ensureResetMeta, runDailyResetIfNeeded } from './lib/dailyReset';
import { useAuthStore } from './stores/authStore';
import { useGoalStore } from './stores/goalStore';
import { useTaskStore } from './stores/taskStore';
import { useSettingsStore } from './stores/settingsStore';
import { usePeopleStore } from './stores/peopleStore';
import { GoalCelebration } from './components/celebration/GoalCelebration';
import { AllTasksCelebration } from './components/celebration/AllTasksCelebration';
import {
  MothersDayIntro,
  shouldShowMothersDayIntro,
} from './components/MothersDayIntro';
import { Screensaver } from './components/screensaver/Screensaver';

export default function App() {
  useWakeLock();

  const [importOpen, setImportOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showMothersDayIntro, setShowMothersDayIntro] = useState(shouldShowMothersDayIntro);
  const [screensaverActive, setScreensaverActive] = useState(false);
  const screensaverDelay = useSettingsStore((s) => s.prayerConfig.screensaverDelay);

  // Manual screensaver trigger (fired from Settings → Preview button)
  // and auto-dismiss when athan starts so the athan card is visible
  useEffect(() => {
    function onShow() { setScreensaverActive(true); }
    function onDismiss() { setScreensaverActive(false); }
    window.addEventListener('mizan:screensaver:show', onShow);
    window.addEventListener('mizan:screensaver:dismiss', onDismiss);
    return () => {
      window.removeEventListener('mizan:screensaver:show', onShow);
      window.removeEventListener('mizan:screensaver:dismiss', onDismiss);
    };
  }, []);

  // Idle screensaver — restarts whenever the delay setting changes
  useEffect(() => {
    if (screensaverDelay === 0) {
      setScreensaverActive(false);
      return;
    }

    const IDLE_MS = screensaverDelay * 60 * 1000;
    let timer: number;

    function resetTimer() {
      setScreensaverActive(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setScreensaverActive(true), IDLE_MS);
    }

    const events = ['pointerdown', 'keydown', 'touchmove'] as const;
    events.forEach((e) => document.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => document.removeEventListener(e, resetTimer));
    };
  }, [screensaverDelay]);

  const dismissMothersDayIntro = useCallback(() => {
    setShowMothersDayIntro(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('mothersday')) {
        url.searchParams.delete('mothersday');
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, '', next || url.pathname);
      }
    }
  }, []);

  const hydrateTasks = useTaskStore((s) => s.hydrate);
  const hydrateGoals = useGoalStore((s) => s.hydrate);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydratePeople = usePeopleStore((s) => s.hydrate);

  const bootstrap = useCallback(async () => {
    await ensureResetMeta();
    await runDailyResetIfNeeded();
    await hydrateAuth();
    await hydrateSettings();
    await hydratePeople();
    await hydrateTasks();
    await hydrateGoals();
  }, [hydrateAuth, hydrateGoals, hydrateTasks, hydrateSettings, hydratePeople]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void (async () => {
        await runDailyResetIfNeeded();
        await hydrateTasks();
        await hydrateGoals();
      })();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [hydrateGoals, hydrateTasks]);

  return (
    <div className="relative h-screen overflow-hidden bg-gradient-to-br from-mizan-bg via-mizan-surface to-mizan-surfaceSoft">
      <AnimatePresence>
        {showMothersDayIntro && (
          <MothersDayIntro key="mothers-day-intro" onDismiss={dismissMothersDayIntro} />
        )}
        {screensaverActive && (
          <Screensaver
            key="screensaver"
            onDismiss={() => setScreensaverActive(false)}
          />
        )}
      </AnimatePresence>

      <BackgroundPattern />

      <ImportCornerTrigger onOpen={() => setImportOpen(true)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      <AdminTrigger onOpen={() => setAdminOpen(true)} />
      {adminOpen && <AdminPage onClose={() => setAdminOpen(false)} />}

      <DashboardLayout
        header={<HeaderBar />}
        leftColumn={
          <>
            <PrayerRhythm />
            <GoalsPanel />
          </>
        }
        centerColumn={<TaskHeroSection />}
        rightColumn={<CalendarColumn />}
      />
      <GoalCelebration />
      <AllTasksCelebration />
    </div>
  );
}

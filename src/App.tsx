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

export default function App() {
  useWakeLock();

  const [importOpen, setImportOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showMothersDayIntro, setShowMothersDayIntro] = useState(shouldShowMothersDayIntro);

  const dismissMothersDayIntro = useCallback(() => {
    setShowMothersDayIntro(false);
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

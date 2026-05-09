import { useState, type ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Calendar,
  ClipboardList,
  Landmark,
  Settings,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { PrayerSection } from './sections/PrayerSection';
import { PeopleSection } from './sections/PeopleSection';
import { ImportTasksSection } from './sections/ImportTasksSection';
import { ImportGoalsSection } from './sections/ImportGoalsSection';
import { CalendarSection } from './sections/CalendarSection';
import { ResetSection } from './sections/ResetSection';

export { AdminTrigger } from './AdminTrigger';

type MenuItem = {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
};

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'people',
    title: 'Family Members',
    icon: Users,
    description: 'Add, edit, or remove family members',
  },
  {
    id: 'prayers',
    title: 'Prayer Times',
    icon: Landmark,
    description: 'Configure which prayers to show and highlight',
  },
  {
    id: 'tasks',
    title: 'Import Tasks',
    icon: ClipboardList,
    description: 'Import daily tasks from JSON or CSV',
  },
  {
    id: 'goals',
    title: 'Import Goals',
    icon: Target,
    description: 'Import spiritual goals and intentions',
  },
  {
    id: 'calendar',
    title: 'Google Calendar',
    icon: Calendar,
    description: 'Connect and sync family calendar',
  },
  {
    id: 'reset',
    title: 'Reset All Data',
    icon: Trash2,
    description: 'Wipe everything and start fresh',
  },
];

const SECTION_MAP: Record<string, ComponentType> = {
  people: PeopleSection,
  prayers: PrayerSection,
  tasks: ImportTasksSection,
  goals: ImportGoalsSection,
  calendar: CalendarSection,
  reset: ResetSection,
};

interface Props {
  onClose: () => void;
}

export function AdminPage({ onClose }: Props) {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const currentItem = MENU_ITEMS.find((item) => item.id === activeSection);
  const Section = activeSection ? SECTION_MAP[activeSection] : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-mizan-bg">
      <div className="flex shrink-0 items-center justify-between border-b border-mizan-surfaceSoft bg-mizan-bg px-6 py-5">
        <div className="flex items-center gap-3">
          <Settings className="text-mizan-text h-9 w-9 shrink-0" aria-hidden strokeWidth={2} />
          <div>
            <h1 className="text-2xl font-bold text-mizan-text">Settings</h1>
            <p className="text-sm text-mizan-textMuted">Customize your Mizan dashboard</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-mizan-surfaceSoft px-5 py-2.5 text-lg font-semibold text-mizan-text transition-colors hover:bg-mizan-accent hover:text-mizan-textOnDark active:scale-95"
          aria-label="Close settings"
        >
          <X className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          className="custom-scrollbar w-80 shrink-0 overflow-y-auto border-r border-mizan-surfaceSoft bg-mizan-surfaceSoft/30 p-4"
          aria-label="Settings sections"
        >
          <div className="space-y-1">
            {MENU_ITEMS.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex w-full items-center gap-4 rounded-2xl px-5 py-4 text-left transition-all ${
                    item.id === 'reset'
                      ? active
                        ? 'bg-red-500 text-white shadow-kiosk-soft'
                        : 'text-red-500 hover:bg-red-500/10'
                      : active
                        ? 'bg-mizan-accent text-mizan-textOnDark shadow-kiosk-soft'
                        : 'text-mizan-text hover:bg-mizan-surface'
                  }`}
                >
                  <item.icon className="h-7 w-7 shrink-0" aria-hidden strokeWidth={active ? 2.25 : 2} />
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className={`text-sm ${
                      item.id === 'reset'
                        ? active ? 'text-white/75' : 'text-red-500/70'
                        : active ? 'text-mizan-textOnDark/75' : 'text-mizan-text/60'
                    }`}>
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="custom-scrollbar min-w-0 flex-1 overflow-y-auto p-8">
          {currentItem && Section ? (
            <div className="mx-auto max-w-2xl">
              <h2 className="mb-6 flex items-center gap-3 text-3xl font-bold text-mizan-text">
                <currentItem.icon className="h-9 w-9 shrink-0" aria-hidden strokeWidth={2} />
                {currentItem.title}
              </h2>
              <Section />
            </div>
          ) : (
            <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center">
              <Settings className="mb-6 h-16 w-16 opacity-40" aria-hidden strokeWidth={1.25} />
              <h3 className="text-2xl font-medium text-mizan-text/70">Welcome to Settings</h3>
              <p className="mt-3 max-w-xs text-mizan-text/60">Choose a section from the menu to customize your dashboard</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

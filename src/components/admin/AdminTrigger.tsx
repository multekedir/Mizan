import { Settings } from 'lucide-react';

export function AdminTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-3 left-3 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-mizan-surface/80 text-mizan-text/30 shadow-kiosk-soft backdrop-blur-sm transition-all hover:text-mizan-text/70 active:scale-95"
      aria-label="Open admin settings"
    >
      <Settings className="h-5 w-5" strokeWidth={2} />
    </button>
  );
}

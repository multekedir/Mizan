import { useEffect, useRef } from 'react';

/**
 * Holds a Screen Wake Lock for the lifetime of the component.
 * Re-acquires automatically whenever the page regains visibility
 * (browsers release the lock when the tab is hidden).
 */
export function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    async function acquire() {
      try {
        lockRef.current = await navigator.wakeLock.request('screen');
        lockRef.current.addEventListener('release', () => {
          lockRef.current = null;
        });
      } catch {
        // Permission denied or API unavailable — fail silently.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && !lockRef.current) {
        void acquire();
      }
    }

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      lockRef.current?.release().catch(() => {});
    };
  }, []);
}

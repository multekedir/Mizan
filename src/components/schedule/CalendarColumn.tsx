import { useCallback, useEffect, useRef, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import {
  GoogleCalendarService,
  hasApiKeyConfig,
  listEventsWithApiKey,
  type NormalizedEvent,
  badgeToneForEvent,
} from '../../services/googleCalendarService';
import { useAuthStore } from '../../stores/authStore';

const badgeClass: Record<string, string> = {
  terracotta: 'bg-mizan-accent/25 text-mizan-warning border-mizan-accent/40',
  teal: 'bg-mizan-textMuted/40 text-mizan-success border-mizan-success/35',
  sand: 'bg-mizan-surfaceSoft text-mizan-text border-mizan-text/20',
  brown: 'bg-mizan-bg text-mizan-text border-mizan-text/25',
  accent: 'bg-amber-100/80 text-amber-900 border-amber-300/50',
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function groupLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = (day.getTime() - today.getTime()) / 86400000;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function CalendarDisconnected() {
  return (
    <div className="card-mizan text-mizan-text flex flex-1 min-h-0 flex-col p-3">
      <h2 className="text-sm font-bold uppercase tracking-wide opacity-60">Schedule</h2>
      <p className="mt-3 text-sm opacity-70">
        Set <code className="text-xs">VITE_GOOGLE_CLIENT_ID</code> in{' '}
        <code className="text-xs">.env</code> and sign in via Import → Google to load Calendar.
      </p>
    </div>
  );
}

export function CalendarColumn() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (clientId) return <CalendarColumnAuthed />;
  if (hasApiKeyConfig()) return <CalendarColumnApiKey />;
  return <CalendarDisconnected />;
}

function CalendarColumnApiKey() {
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const min = new Date();
      const max = new Date();
      max.setDate(max.getDate() + 7);
      setEvents(await listEventsWithApiKey(min, max));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load calendar.');
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- initial / interval calendar fetch */
  useEffect(() => { void load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    const t = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [load]);

  return <CalendarView events={events} error={error} />;
}

const REFRESH_BEFORE_MS = 5 * 60 * 1000; // refresh token 5 min before expiry

function CalendarColumnAuthed() {
  const googleTokens = useAuthStore((s) => s.googleTokens);
  const setGoogleTokens = useAuthStore((s) => s.setGoogleTokens);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needManualLogin, setNeedManualLogin] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    onSuccess: async (res) => {
      await setGoogleTokens({
        accessToken: res.access_token,
        expiresAt: Date.now() + (res.expires_in ?? 3600) * 1000,
      });
      setNeedManualLogin(false);
      setError(null);
    },
    onError: () => setNeedManualLogin(true),
    onNonOAuthError: () => setNeedManualLogin(true),
  });

  // Schedule a silent re-auth just before the token expires.
  const scheduleRefresh = useCallback((expiresAt: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max(0, expiresAt - Date.now() - REFRESH_BEFORE_MS);
    refreshTimerRef.current = setTimeout(() => login(), delay);
  }, [login]);

  const loadEvents = useCallback(async (token: string) => {
    try {
      const svc = new GoogleCalendarService(token);
      const min = new Date();
      const max = new Date();
      max.setDate(max.getDate() + 7);
      setEvents(await svc.listEventsRange(min, max));
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.message === 'UNAUTHORIZED') {
        login(); // token rejected — try silent refresh immediately
      } else {
        setError(e instanceof Error ? e.message : 'Could not load calendar.');
      }
    }
  }, [login]);

  // Run whenever the stored token changes.
  /* eslint-disable react-hooks/set-state-in-effect -- load events after OAuth hydrate */
  useEffect(() => {
    if (!hydrated) return;
    if (!googleTokens?.accessToken) {
      // No token at all — try silent login immediately.
      login();
      return;
    }
    if (googleTokens.expiresAt < Date.now() + 60_000) {
      // Already expired — refresh now.
      login();
      return;
    }
    void loadEvents(googleTokens.accessToken);
    scheduleRefresh(googleTokens.expiresAt);
    // Omit loadEvents/login/scheduleRefresh — including them retriggers OAuth too often.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, googleTokens]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Poll for new events every 5 minutes independently of token refresh.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (googleTokens?.accessToken) void loadEvents(googleTokens.accessToken);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [googleTokens, loadEvents]);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  return (
    <CalendarView
      events={events}
      error={error}
      showReconnect={needManualLogin}
      onReconnect={() => login()}
    />
  );
}

function CalendarView({
  events,
  error,
  showReconnect = false,
  onReconnect,
}: {
  events: NormalizedEvent[];
  error: string | null;
  showReconnect?: boolean;
  onReconnect?: () => void;
}) {
  const groups = new Map<string, NormalizedEvent[]>();
  for (const ev of events) {
    const key = ev.start.toDateString();
    const arr = groups.get(key) ?? [];
    arr.push(ev);
    groups.set(key, arr);
  }

  return (
    <div className="card-mizan text-mizan-text flex flex-1 min-h-0 flex-col gap-2 p-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide opacity-60">Schedule</h2>
        <span className="text-mizan-accent text-xl" aria-hidden>›</span>
      </div>

      {error ? (
        <p className="text-mizan-warning text-sm">{error}</p>
      ) : null}

      <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {Array.from(groups.entries()).map(([, dayEvents]) => {
          const first = dayEvents[0]?.start ?? new Date();
          return (
            <div key={first.toDateString()}>
              <p className="text-mizan-text/60 mb-2 text-xs font-semibold uppercase tracking-wide">
                {groupLabel(first)}
              </p>
              <ul className="flex flex-col gap-2 border-l-2 border-mizan-surfaceSoft pl-3">
                {dayEvents.map((ev) => {
                  const tone = ev.calendarColor ?? badgeToneForEvent(ev.title, ev.colorId);
                  const cls = badgeClass[tone] ?? badgeClass.brown;
                  return (
                    <li key={ev.id} className="grid grid-cols-[4.5rem_1fr] items-start gap-2 text-sm">
                      <span className="tabular-nums opacity-80">{formatTime(ev.start)}</span>
                      <span className={`rounded-xl border px-2 py-1.5 font-medium ${cls}`}>
                        {ev.title}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {events.length === 0 && !error ? (
          <p className="text-sm opacity-50">No events in the next 7 days.</p>
        ) : null}
      </div>

      {showReconnect && onReconnect ? (
        <button
          type="button"
          className="text-mizan-success shrink-0 text-sm font-semibold underline-offset-2 hover:underline"
          onClick={onReconnect}
        >
          Refresh session
        </button>
      ) : null}
    </div>
  );
}

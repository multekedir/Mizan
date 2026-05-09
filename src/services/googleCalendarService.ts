export interface NormalizedEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  colorId?: string;
  calendarColor?: BadgeTone;
}

export type BadgeTone =
  | 'terracotta'
  | 'teal'
  | 'sand'
  | 'brown'
  | 'accent';

const COLOR_ID_MAP: Record<string, BadgeTone> = {
  '1': 'terracotta',
  '2': 'teal',
  '3': 'brown',
  '4': 'sand',
  '5': 'accent',
  '6': 'teal',
  '7': 'sand',
  '8': 'brown',
  '9': 'terracotta',
  '10': 'accent',
  '11': 'teal',
};

/** Derive badge color from event summary prefix `Name: …` for family coloring. */
export function badgeToneForEvent(
  summary: string,
  colorId?: string,
): BadgeTone {
  const prefix = summary.split(':')[0]?.trim().toLowerCase() ?? '';
  const family: Record<string, BadgeTone> = {
    aisha: 'terracotta',
    khalid: 'teal',
    zayd: 'sand',
  };
  if (prefix && family[prefix]) return family[prefix];
  if (colorId && COLOR_ID_MAP[colorId]) return COLOR_ID_MAP[colorId];
  return 'brown';
}

interface GCalEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  colorId?: string;
}

interface GCalListResponse {
  items?: GCalEvent[];
}

const CALENDAR_ID = import.meta.env.VITE_GOOGLE_CALENDAR_ID as string | undefined;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;

export function hasApiKeyConfig(): boolean {
  return Boolean(API_KEY && CALENDAR_ID);
}

function normalize(ev: GCalEvent): NormalizedEvent | null {
  const title = ev.summary?.trim() || '(No title)';
  const startRaw = ev.start?.dateTime ?? ev.start?.date;
  const endRaw = ev.end?.dateTime ?? ev.end?.date;
  if (!startRaw) return null;
  const start = new Date(startRaw);
  const end = endRaw ? new Date(endRaw) : new Date(start.getTime() + 3600000);
  return {
    id: ev.id,
    title,
    start,
    end,
    colorId: ev.colorId,
    calendarColor: badgeToneForEvent(title, ev.colorId),
  };
}

async function fetchEvents(
  timeMin: Date,
  timeMax: Date,
  auth: { type: 'apikey' } | { type: 'oauth'; token: string },
): Promise<NormalizedEvent[]> {
  const calendarId = CALENDAR_ID || 'primary';
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
  );
  url.searchParams.set('timeMin', timeMin.toISOString());
  url.searchParams.set('timeMax', timeMax.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const headers: Record<string, string> = {};
  if (auth.type === 'apikey') {
    url.searchParams.set('key', API_KEY!);
  } else {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  const res = await fetch(url.toString(), { headers });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`Calendar ${res.status}`);

  const body = (await res.json()) as GCalListResponse;
return (body.items ?? [])
    .map(normalize)
    .filter((e): e is NormalizedEvent => e !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function listEventsWithApiKey(timeMin: Date, timeMax: Date): Promise<NormalizedEvent[]> {
  return fetchEvents(timeMin, timeMax, { type: 'apikey' });
}

export class GoogleCalendarService {
  readonly accessToken: string;
  constructor(accessToken: string) { this.accessToken = accessToken; }

  listEventsRange(timeMin: Date, timeMax: Date): Promise<NormalizedEvent[]> {
    return fetchEvents(timeMin, timeMax, { type: 'oauth', token: this.accessToken });
  }
}

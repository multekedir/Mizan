const DAY_PATTERN =
  '(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ParsedTask {
  title: string;
  assignee: string | null;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
  dayOfWeek: number | null;
  monthDay: number | null;
  interval: number | null;
  customFrequency?: string;
  time: string | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatTime12(hour24: number, minute: number): string {
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function removePhrase(source: string, phrase: string): string {
  return normalizeSpaces(source.replace(phrase, ' '));
}

export function parseTaskNL(input: string, memberNames: string[]): ParsedTask {
  let s = normalizeSpaces(input);

  let assignee: string | null = null;

  // Prefer longer names first so "Aisha Ali" matches before "Aisha".
  const sortedNames = [...memberNames]
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const name of sortedNames) {
    const escapedName = escapeRegExp(name);
    const forRe = new RegExp(`\\bfor\\s+${escapedName}\\b`, 'i');

    if (forRe.test(s)) {
      assignee = name;
      s = normalizeSpaces(s.replace(forRe, ' '));
      break;
    }
  }

  if (!assignee) {
    for (const name of sortedNames) {
      const escapedName = escapeRegExp(name);
      const nameRe = new RegExp(`\\b${escapedName}\\b`, 'i');

      if (nameRe.test(s)) {
        assignee = name;
        s = normalizeSpaces(s.replace(nameRe, ' '));
        break;
      }
    }
  }

  let time: string | null = null;

  s = s.replace(/\bat\s+noon\b/i, () => {
    time = formatTime12(12, 0);
    return ' ';
  });

  s = s.replace(/\bat\s+midnight\b/i, () => {
    time = formatTime12(0, 0);
    return ' ';
  });

  s = s.replace(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i, (full, h, m, ap) => {
    let hour = Number.parseInt(h, 10);
    const minute = m ? Number.parseInt(m, 10) : 0;
    const suffix = typeof ap === 'string' ? ap.toLowerCase() : null;

    if (
      !Number.isFinite(hour) ||
      !Number.isFinite(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return full;
    }

    if (suffix === 'pm' && hour !== 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;

    time = formatTime12(hour, minute);
    return ' ';
  });

  s = normalizeSpaces(s);

  let frequency: ParsedTask['frequency'] = 'once';
  let dayOfWeek: number | null = null;
  let monthDay: number | null = null;
  let interval: number | null = null;
  let customFrequency: string | undefined;

  let match = s.match(/\b(?:every|each)\s+(\d+)\s+(day|week|month)s?\b/i);

  if (match) {
    interval = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    frequency =
      interval === 1
        ? unit === 'day'
          ? 'daily'
          : unit === 'week'
            ? 'weekly'
            : 'monthly'
        : 'custom';

    if (frequency === 'custom') {
      customFrequency = `every ${interval} ${unit}${interval === 1 ? '' : 's'}`;
    }

    s = removePhrase(s, match[0]);
  }

  if (frequency === 'once') {
    match = s.match(/\b(twice|two times)\s+a\s+week\b/i);

    if (match) {
      frequency = 'custom';
      customFrequency = 'twice a week';
      s = removePhrase(s, match[0]);
    }
  }

  if (frequency === 'once') {
    match = s.match(/\b(every other day|every 2 days)\b/i);

    if (match) {
      frequency = 'custom';
      interval = 2;
      customFrequency = 'every other day';
      s = removePhrase(s, match[0]);
    }
  }

  if (frequency === 'once') {
    match = s.match(/\b(every\s+month|monthly|once\s+a\s+month)\b/i);

    if (match) {
      frequency = 'monthly';
      s = removePhrase(s, match[0]);
    }
  }

  if (frequency === 'once') {
    match = s.match(/\b(every\s+week|weekly|once\s+a\s+week)\b/i);

    if (match) {
      frequency = 'weekly';
      s = removePhrase(s, match[0]);
    }
  }

  if (frequency === 'once') {
    match = s.match(/\b(every\s+day|daily|once\s+a\s+day)\b/i);

    if (match) {
      frequency = 'daily';
      s = removePhrase(s, match[0]);
    }
  }

  const monthDayMatch = s.match(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);

  if (monthDayMatch) {
    const parsed = Number.parseInt(monthDayMatch[1], 10);
    monthDay = parsed >= 1 && parsed <= 31 ? parsed : null;

    if (monthDay) {
      frequency = frequency === 'once' ? 'monthly' : frequency;
    }

    s = removePhrase(s, monthDayMatch[0]);
  }

  const dayMatch = s.match(new RegExp(`\\b(?:on|every|each)?\\s*(${DAY_PATTERN})\\b`, 'i'));

  if (dayMatch) {
    dayOfWeek = parseDayOfWeek(dayMatch[1]);

    if (frequency === 'once') {
      frequency = 'weekly';
    }

    s = removePhrase(s, dayMatch[0]);
  }

  const title = normalizeSpaces(s) || input.trim();

  return {
    title,
    assignee,
    frequency,
    dayOfWeek,
    monthDay,
    interval,
    customFrequency,
    time,
  };
}

function parseDayOfWeek(value: string): number {
  const key = value.toLowerCase().slice(0, 2);

  const map: Record<string, number> = {
    su: 0,
    mo: 1,
    tu: 2,
    we: 3,
    th: 4,
    fr: 5,
    sa: 6,
  };

  return map[key] ?? 0;
}

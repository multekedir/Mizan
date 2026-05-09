const DAY_PATTERN =
  '(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ParsedTask {
  title: string;
  assignee: string | null;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
  dayOfWeek: number | null; // 0-6 (Sunday = 0)
  monthDay: number | null; // 1-31
  interval: number | null; // e.g. every 2 weeks → 2
  customFrequency?: string; // "every 2 weeks", "twice a week", etc.
  time: string | null;
}

export function parseTaskNL(input: string, memberNames: string[]): ParsedTask {
  let s = input.trim();

  // ── 1. Assignee ─────────────────────────────────────
  let assignee: string | null = null;
  for (const name of memberNames) {
    const forRe = new RegExp(`\\bfor\\s+${name}\\b`, 'i');
    if (forRe.test(s)) {
      assignee = name;
      s = s.replace(forRe, ' ');
      break;
    }
  }
  if (!assignee) {
    for (const name of memberNames) {
      const nameRe = new RegExp(`\\b${name}\\b`, 'i');
      if (nameRe.test(s)) {
        assignee = name;
        s = s.replace(nameRe, ' ');
        break;
      }
    }
  }

  // ── 2. Time ─────────────────────────────────────────
  let time: string | null = null;
  s = s.replace(/\bat\s+noon\b/i, () => { time = '12:00 PM'; return ' '; });
  s = s.replace(/\bat\s+midnight\b/i, () => { time = '12:00 AM'; return ' '; });

  s = s.replace(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i, (_, h, m, ap) => {
    let hr = parseInt(h, 10);
    const min = m ? parseInt(m, 10) : 0;
    if (ap?.toLowerCase() === 'pm' && hr !== 12) hr += 12;
    if (ap?.toLowerCase() === 'am' && hr === 12) hr = 0;
    time = `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    return ' ';
  });

  // ── 3. Flexible Frequency Parser ─────────────────────
  let frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom' = 'once';
  let dayOfWeek: number | null = null;
  let monthDay: number | null = null;
  let interval: number | null = null;
  let customFrequency: string | undefined = undefined;

  const lower = s.toLowerCase();

  // Every X days / weeks / months
  const intervalMatch = lower.match(/\b(?:every|each)\s+(\d+)\s+(day|week|month)s?\b/i);
  if (intervalMatch) {
    interval = parseInt(intervalMatch[1], 10);
    const unit = intervalMatch[2].toLowerCase();
    frequency = 'custom';
    customFrequency = `every ${interval} ${unit}${interval === 1 ? '' : 's'}`;
  }

  // Twice a week, every other day, etc.
  else if (/\b(twice|two times)\s+a\s+week\b/i.test(lower)) {
    frequency = 'custom';
    customFrequency = 'twice a week';
  } else if (/\b(every other day|every 2 days)\b/i.test(lower)) {
    frequency = 'custom';
    customFrequency = 'every other day';
  }

  // Standard frequencies
  else if (/\b(every\s+month|monthly|once\s+a\s+month)\b/i.test(lower)) {
    frequency = 'monthly';
    const m = lower.match(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
    if (m) {
      monthDay = parseInt(m[1], 10);
    }
  } 
  else if (/\b(every\s+week|weekly|once\s+a\s+week)\b/i.test(lower)) {
    frequency = 'weekly';
  } 
  else if (/\b(every\s+day|daily|once\s+a\s+day)\b/i.test(lower)) {
    frequency = 'daily';
  } 
  else {
    // Try to detect specific day
    const dayRe = new RegExp(`\\b(?:on|every|each)\\s+(${DAY_PATTERN})\\b`, 'i');
    const dayMatch = s.match(dayRe);
    if (dayMatch) {
      frequency = 'weekly';
      dayOfWeek = parseDayOfWeek(dayMatch[1]);
    }
  }

  // Clean up the title
  let title = s
    .replace(/\b(?:every|each|on|at|for|by)\s+\w+\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!title) title = input.trim();

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

function parseDayOfWeek(s: string): number {
  const c = s.toLowerCase().slice(0, 2);
  const map: Record<string, number> = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
  return map[c] ?? 0;
}

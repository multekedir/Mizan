import Dexie, { type EntityTable } from 'dexie';

export interface TaskRow {
  id: string;
  title: string;
  assignee: string;
  recurring: boolean;
  /**
   * "daily"
   * "weekly:0"–"weekly:6" (0=Sun)
   * "weekly2:A:B" (twice/week on two weekdays)
   * "monthly:1"–"monthly:31"
   * "interval:days:N" | "interval:weeks:N" | "interval:months:N"
   * undefined → treated as "daily"
   */
  schedule?: string;
  /** Suggested time label, e.g. "6:00 AM" — display only, not enforced */
  time?: string;
  /** Estimated duration, e.g. "5 min", "30 min", "1 hr" — display only */
  duration?: string;
  /** Goal this task is linked to, if any */
  goalId?: string;
  completed: boolean;
  logicalDayKey: string;
  sortOrder: number;
}

export interface GoalRow {
  id: string;
  title: string;
  assignee?: string;
  category?: string;
  recurring: boolean;
  /** Same format as TaskRow.schedule (optional). */
  schedule?: string;
  completed: boolean;
  logicalDayKey: string;
  sortOrder: number;
}

export interface MetaRow {
  key: string;
  value: string;
}

export interface CalendarCacheRow {
  id: string;
  payload: string;
  fetchedAt: number;
}

export interface PersonRow {
  id: string;
  name: string;    // unique — this is the assignee value stored in tasks/goals
  color: string;   // PersonColor key
  sortOrder: number;
}

export class MizanDB extends Dexie {
  tasks!: EntityTable<TaskRow, 'id'>;
  goals!: EntityTable<GoalRow, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  calendarCache!: EntityTable<CalendarCacheRow, 'id'>;
  people!: EntityTable<PersonRow, 'id'>;

  constructor() {
    super('mizan-db');
    this.version(1).stores({
      tasks: 'id, logicalDayKey, assignee, completed',
      goals: 'id, logicalDayKey, completed',
      meta: 'key',
      calendarCache: 'id, fetchedAt',
    });
    // version 2: adds people table (&name = unique index)
    this.version(2).stores({
      people: 'id, &name',
    });
    // version 3: tasks.time field (no new index needed — Dexie handles new columns automatically)
    this.version(3).stores({});
    // version 4: tasks.duration field
    this.version(4).stores({});
    // version 5: tasks.goalId field
    this.version(5).stores({ tasks: 'id, logicalDayKey, assignee, completed, goalId' });
  }
}

export const db = new MizanDB();

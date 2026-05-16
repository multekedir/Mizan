import { create } from 'zustand';
import { db, writeAudit, type PersonRow } from '../db/database';

export const PERSON_COLORS = {
  rose: {
    gradient: 'from-mizan-personRose/35 to-mizan-surface',
    dot: 'bg-mizan-personRose',
  },
  amber: {
    gradient: 'from-mizan-personAmber/35 to-mizan-surface',
    dot: 'bg-mizan-personAmber',
  },
  teal: {
    gradient: 'from-mizan-personFern/35 to-mizan-surface',
    dot: 'bg-mizan-personFern',
  },
  sky: {
    gradient: 'from-mizan-personRiver/35 to-mizan-surface',
    dot: 'bg-mizan-personRiver',
  },
  purple: {
    gradient: 'from-mizan-personPlum/35 to-mizan-surface',
    dot: 'bg-mizan-personPlum',
  },
  sand: {
    gradient: 'from-mizan-surfaceSoft to-mizan-surface',
    dot: 'bg-mizan-textMuted',
  },
} as const;

export type PersonColor = keyof typeof PERSON_COLORS;
export const ALL_COLORS = Object.keys(PERSON_COLORS) as PersonColor[];

const DEFAULT_PEOPLE: Omit<PersonRow, 'id'>[] = [
  { name: 'Mom',  color: 'rose', sortOrder: 1 },
  { name: 'Dad',  color: 'teal', sortOrder: 2 },
  { name: 'Zayd', color: 'sky',  sortOrder: 3 },
];

interface PeopleState {
  people: PersonRow[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addPerson: (name: string, color: PersonColor) => Promise<{ ok: boolean; error?: string }>;
  updatePerson: (id: string, name: string, color: PersonColor) => Promise<{ ok: boolean; error?: string }>;
  deletePerson: (id: string) => Promise<void>;
  gradientFor: (name: string) => string;
}

export const usePeopleStore = create<PeopleState>((set, get) => ({
  people: [],
  hydrated: false,

  hydrate: async () => {
    const sorted = (rows: PersonRow[]) =>
      [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

    let rows = await db.people.toArray();
    if (rows.length === 0) {
      await db.transaction('rw', db.people, async () => {
        for (const p of DEFAULT_PEOPLE) {
          await db.people.add({ id: crypto.randomUUID(), ...p });
        }
      });
      rows = await db.people.toArray();
    }
    set({ people: sorted(rows), hydrated: true });
  },

  addPerson: async (name, color) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: 'Name cannot be empty.' };
    const exists = get().people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return { ok: false, error: `"${trimmed}" already exists.` };
    const count = await db.people.count();
    await db.people.add({ id: crypto.randomUUID(), name: trimmed, color, sortOrder: count + 1 });
    await writeAudit('add', 'person', trimmed);
    await get().hydrate();
    return { ok: true };
  },

  updatePerson: async (id, name, color) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: 'Name cannot be empty.' };
    const conflict = get().people.find(
      (p) => p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (conflict) return { ok: false, error: `"${trimmed}" already exists.` };
    await db.people.update(id, { name: trimmed, color });
    await get().hydrate();
    return { ok: true };
  },

  deletePerson: async (id) => {
    const person = get().people.find((p) => p.id === id);
    await db.people.delete(id);
    if (person) await writeAudit('remove', 'person', person.name);
    await get().hydrate();
  },

  gradientFor: (name) => {
    const person = get().people.find((p) => p.name === name);
    const color = (person?.color ?? 'sand') as PersonColor;
    return PERSON_COLORS[color]?.gradient ?? PERSON_COLORS.sand.gradient;
  },
}));

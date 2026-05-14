import { create } from 'zustand';
import type { NormalizedEvent } from '../services/googleCalendarService';

interface CalendarState {
  events: NormalizedEvent[];
  setEvents: (events: NormalizedEvent[]) => void;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  events: [],
  setEvents: (events) => set({ events }),
}));

import { create } from 'zustand';

interface AllDoneState {
  active: { key: number; goalTitle: string; taskCount: number } | null;
  _seq: number;
  show: (goalTitle: string, taskCount: number) => void;
  dismiss: () => void;
}

export const useAllDoneCelebrationStore = create<AllDoneState>((set, get) => ({
  active: null,
  _seq: 0,
  show: (goalTitle, taskCount) => {
    const key = get()._seq + 1;
    set({ active: { key, goalTitle, taskCount }, _seq: key });
  },
  dismiss: () => set({ active: null }),
}));

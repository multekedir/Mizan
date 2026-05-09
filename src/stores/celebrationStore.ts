import { create } from 'zustand';

export interface CelebrationPayload {
  key: number;
  goalTitle: string;
  goalCategory?: string;
  taskTitle: string;
}

interface CelebrationState {
  active: CelebrationPayload | null;
  _seq: number;
  show: (goalTitle: string, taskTitle: string, goalCategory?: string) => void;
  dismiss: () => void;
}

export const useCelebrationStore = create<CelebrationState>((set, get) => ({
  active: null,
  _seq: 0,
  show: (goalTitle, taskTitle, goalCategory) => {
    const key = get()._seq + 1;
    set({ active: { key, goalTitle, goalCategory, taskTitle }, _seq: key });
  },
  dismiss: () => set({ active: null }),
}));

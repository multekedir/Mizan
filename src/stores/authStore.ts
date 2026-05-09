import { create } from 'zustand';
import { db } from '../db/database';

export interface GoogleTokenBundle {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

interface AuthState {
  googleTokens: GoogleTokenBundle | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setGoogleTokens: (t: GoogleTokenBundle | null) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  googleTokens: null,
  hydrated: false,

  hydrate: async () => {
    const row = await db.meta.get('googleTokens');
    if (!row?.value) {
      set({ googleTokens: null, hydrated: true });
      return;
    }
    try {
      const parsed = JSON.parse(row.value) as GoogleTokenBundle;
      set({ googleTokens: parsed, hydrated: true });
    } catch {
      set({ googleTokens: null, hydrated: true });
    }
  },

  setGoogleTokens: async (t) => {
    if (!t) {
      await db.meta.delete('googleTokens');
      set({ googleTokens: null });
      return;
    }
    await db.meta.put({ key: 'googleTokens', value: JSON.stringify(t) });
    set({ googleTokens: t });
  },
}));

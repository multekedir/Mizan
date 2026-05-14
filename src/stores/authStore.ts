import { create } from 'zustand';
import { db } from '../db/database';

export interface GoogleTokenBundle {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

export function isGoogleTokenValid(
  tokens: GoogleTokenBundle | null | undefined,
): tokens is GoogleTokenBundle {
  if (!tokens?.accessToken) return false;
  // 60-second buffer so we don't use a token that is about to expire
  return tokens.expiresAt > Date.now() + 60_000;
}

function isGoogleTokenBundle(value: unknown): value is GoogleTokenBundle {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<GoogleTokenBundle>;
  return typeof t.accessToken === 'string' && t.accessToken.length > 0 && typeof t.expiresAt === 'number';
}

async function clearStoredGoogleTokens(): Promise<void> {
  try {
    await db.meta.delete('googleTokens');
  } catch {
    // ignore local storage cleanup failure
  }
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
    try {
      const row = await db.meta.get('googleTokens');
      if (!row?.value) {
        set({ googleTokens: null, hydrated: true });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(row.value);
      } catch {
        await clearStoredGoogleTokens();
        set({ googleTokens: null, hydrated: true });
        return;
      }

      if (!isGoogleTokenBundle(parsed)) {
        await clearStoredGoogleTokens();
        set({ googleTokens: null, hydrated: true });
        return;
      }

      set({ googleTokens: parsed, hydrated: true });
    } catch {
      // IndexedDB unavailable — start in signed-out state
      set({ googleTokens: null, hydrated: true });
    }
  },

  setGoogleTokens: async (t) => {
    if (!t) {
      await clearStoredGoogleTokens();
      set({ googleTokens: null });
      return;
    }
    await db.meta.put({ key: 'googleTokens', value: JSON.stringify(t) });
    set({ googleTokens: t });
  },
}));

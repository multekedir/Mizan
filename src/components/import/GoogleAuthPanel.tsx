import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuthStore, isGoogleTokenValid } from '../../stores/authStore';

export function GoogleAuthPanel() {
  const tokens = useAuthStore((s) => s.googleTokens);
  const setGoogleTokens = useAuthStore((s) => s.setGoogleTokens);
  const [error, setError] = useState<string | null>(null);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/calendar.events',
    onSuccess: async (tokenResponse) => {
      setError(null);
      await setGoogleTokens({
        accessToken: tokenResponse.access_token,
        expiresAt: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
      });
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed.');
    },
    onNonOAuthError: () => {
      setError('Google sign-in was cancelled or failed.');
    },
  });

  const hasValidToken = isGoogleTokenValid(tokens);
  const hasExpiredToken = Boolean(tokens?.accessToken) && !hasValidToken;

  const statusText = hasValidToken
    ? 'Google Calendar is connected.'
    : hasExpiredToken
      ? 'Google Calendar access expired. Reconnect to continue syncing.'
      : 'Google Calendar is not connected.';

  return (
    <div className="flex flex-col gap-3">
      <p className="text-mizan-text/80 text-sm">{statusText}</p>
      <button
        type="button"
        onClick={() => { setError(null); login(); }}
        className="bg-mizan-accent text-mizan-textOnDark focus:ring-mizan-warning rounded-2xl px-4 py-3 text-center font-semibold shadow-sm transition active:scale-[0.99] focus:outline-none focus:ring-2"
      >
        {tokens?.accessToken ? 'Reconnect Google Calendar' : 'Sign in with Google'}
      </button>
      {error && (
        <p className="text-mizan-warning text-sm">{error}</p>
      )}
      {tokens?.accessToken ? (
        <button
          type="button"
          className="text-mizan-text/60 text-sm underline"
          onClick={() => void setGoogleTokens(null)}
        >
          Sign out (clear tokens)
        </button>
      ) : null}
    </div>
  );
}

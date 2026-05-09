import { useGoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../../stores/authStore';

export function GoogleAuthPanel() {
  const tokens = useAuthStore((s) => s.googleTokens);
  const setGoogleTokens = useAuthStore((s) => s.setGoogleTokens);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    onSuccess: async (tokenResponse) => {
      await setGoogleTokens({
        accessToken: tokenResponse.access_token,
        expiresAt: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
      });
    },
  });

  const hasAccessToken = Boolean(tokens?.accessToken);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-mizan-text/80 text-sm">
        Sign in once with your family Google account. Access tokens are stored locally in
        IndexedDB for unattended kiosk use until expiry.
      </p>
      <button
        type="button"
        onClick={() => login()}
        className="bg-mizan-accent text-mizan-textOnDark focus:ring-mizan-warning rounded-2xl px-4 py-3 text-center font-semibold shadow-sm transition active:scale-[0.99] focus:outline-none focus:ring-2"
      >
        {hasAccessToken ? 'Reconnect Google Calendar' : 'Sign in with Google'}
      </button>
      {hasAccessToken ? (
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

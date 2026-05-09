import { GoogleAuthPanel } from '../../import/GoogleAuthPanel';

export function CalendarSection() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  return (
    <div>
      {clientId ? (
        <GoogleAuthPanel />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-mizan-text/70">Add your Google OAuth client ID to enable Calendar sync.</p>
          <code className="rounded-xl bg-mizan-surfaceSoft px-4 py-2 text-xs text-mizan-text">
            VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
          </code>
          <p className="text-xs text-mizan-text/50">
            Set this in a <code>.env</code> file at the project root, then restart the dev server.
          </p>
        </div>
      )}
    </div>
  );
}

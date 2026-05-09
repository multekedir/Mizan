export function StatusMsg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  const ok = msg.startsWith('Imported') || msg === 'Cleared.';
  return (
    <p
      className={`mt-3 rounded-2xl px-4 py-2 text-sm font-medium ${
        ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
      }`}
    >
      {msg}
    </p>
  );
}

/** Subtle repeating geometric tile — opacity controlled by parent wrapper. */
export function BackgroundPattern() {
  const svg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <g fill="none" stroke="%23071A16" stroke-width="0.6">
    <path d="M40 4 L76 40 L40 76 L4 40 Z"/>
    <circle cx="40" cy="40" r="18"/>
    <path d="M40 22 L58 40 L40 58 L22 40 Z"/>
  </g>
</svg>
`);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
      style={{
        backgroundImage: `url("data:image/svg+xml,${svg}")`,
        backgroundSize: '80px 80px',
      }}
    />
  );
}

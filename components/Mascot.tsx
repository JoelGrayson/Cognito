export function Mascot({ listening = false, size = 64 }: { listening?: boolean; size?: number }) {
  const look = listening ? 1.5 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 9c3-6 9-7 13-5-1 5-6 8-13 5Z" fill="#9cc48a" />
      <rect x="7" y="12" width="50" height="46" rx="21" fill="#f3d98b" />
      <circle cx="17" cy="42" r="4" fill="#f4b9a6" opacity="0.7" />
      <circle cx="47" cy="42" r="4" fill="#f4b9a6" opacity="0.7" />
      <circle cx="24" cy="32" r="7" fill="#fff" />
      <circle cx="40" cy="32" r="7" fill="#fff" />
      <circle cx={25 + look} cy={33 - look} r="3.6" fill="#2b1d14" />
      <circle cx={41 + look} cy={33 - look} r="3.6" fill="#2b1d14" />
      <path d="M28 45q4 3.5 8 0" stroke="#2b1d14" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

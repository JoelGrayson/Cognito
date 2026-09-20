export function Mascot({ listening = false, size = 64 }: { listening?: boolean; size?: number }) {
  const look = listening ? 1.5 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path
        d="M32 3l8.2 17.4 19 2.4-14 13 3.7 18.8L32 45.4 15.1 54.6l3.7-18.8-14-13 19-2.4Z"
        fill="#f5c542"
        stroke="#d9a520"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="40" r="3.5" fill="#f4a08a" opacity="0.7" />
      <circle cx="45" cy="40" r="3.5" fill="#f4a08a" opacity="0.7" />
      <circle cx="25" cy="31" r="6" fill="#fff" />
      <circle cx="39" cy="31" r="6" fill="#fff" />
      <circle cx={26 + look} cy={32 - look} r="3.2" fill="#2b1d14" />
      <circle cx={40 + look} cy={32 - look} r="3.2" fill="#2b1d14" />
      <path d="M28 42q4 3.5 8 0" stroke="#2b1d14" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

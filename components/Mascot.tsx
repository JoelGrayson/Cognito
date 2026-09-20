/**
 * The gold star. Drawn puffy on purpose: a geometric five-point star has thin arms, so
 * the face is crammed into a small middle and the points read as sharp at the sizes
 * this renders (38-72px).
 *
 * The softness is a stroke trick, not a hand-rounded path. The same fat star is drawn
 * twice with a wide round-joined stroke in its own colour, which swells every corner
 * into a curve. The lower copy is a shade darker and 1.6 wider, which is the whole
 * outline: a thin warm edge rather than a dark border that thickens as the star shrinks.
 */
const STAR = "M32.0 12.5 L39.9 23.1 L52.4 27.4 L44.8 38.2 L44.6 51.4 L32.0 47.5 L19.4 51.4 L19.2 38.2 L11.6 27.4 L24.1 23.1Z";
const ROUNDING = 10;

export function Mascot({ listening = false, size = 64 }: { listening?: boolean; size?: number }) {
  const look = listening ? 1.3 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="mascot-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffdf6b" />
          <stop offset="1" stopColor="#f7c23c" />
        </linearGradient>
      </defs>
      <path d={STAR} fill="#ecb53a" stroke="#ecb53a" strokeWidth={ROUNDING + 1.6} strokeLinejoin="round" />
      <path d={STAR} fill="url(#mascot-gold)" stroke="url(#mascot-gold)" strokeWidth={ROUNDING} strokeLinejoin="round" />
      <ellipse cx="25" cy="21" rx="5" ry="2.2" fill="#fff" opacity="0.35" transform="rotate(-28 25 21)" />
      <ellipse cx="19" cy="40.4" rx="3.3" ry="2.4" fill="#f7a58f" opacity="0.55" />
      <ellipse cx="45" cy="40.4" rx="3.3" ry="2.4" fill="#f7a58f" opacity="0.55" />
      <circle cx="24.6" cy="33" r="5.9" fill="#fff" />
      <circle cx="39.4" cy="33" r="5.9" fill="#fff" />
      <circle cx={25.4 + look} cy={33.6 - look} r="3.3" fill="#3a2a1f" />
      <circle cx={40.2 + look} cy={33.6 - look} r="3.3" fill="#3a2a1f" />
      <circle cx={26.6 + look} cy={32.3 - look} r="1.1" fill="#fff" />
      <circle cx={41.4 + look} cy={32.3 - look} r="1.1" fill="#fff" />
      <path d="M28.2 41.6q3.8 3.3 7.6 0" stroke="#3a2a1f" strokeWidth="1.9" strokeLinecap="round" fill="none" />
    </svg>
  );
}

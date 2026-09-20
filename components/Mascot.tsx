/**
 * The gold star. Flat, like the rest of the site: one solid gold, no gradient, no gloss.
 *
 * A geometric five-point star has thin arms, so the face is crammed into a small middle
 * and the points read as sharp at the sizes this renders (38-72px). The arms here are
 * a little fatter, and the corners are rounded by a stroke trick rather than a
 * hand-rounded path: the star is drawn with a round-joined stroke in its own colour,
 * which turns every corner into a small curve. The lower copy is a shade darker and
 * 1.4 wider, and that sliver is the whole outline - a thin warm edge, not a dark border
 * that gets heavier as the star shrinks.
 */
const STAR = "M32.0 9.5 L39.6 24.0 L55.8 26.8 L44.4 38.5 L46.7 54.7 L32.0 47.5 L17.3 54.7 L19.6 38.5 L8.2 26.8 L24.4 24.0Z";
const ROUNDING = 5;

export function Mascot({ listening = false, size = 64 }: { listening?: boolean; size?: number }) {
  const look = listening ? 1.3 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d={STAR} fill="#e3b234" stroke="#e3b234" strokeWidth={ROUNDING + 1.4} strokeLinejoin="round" />
      <path d={STAR} fill="#f5c542" stroke="#f5c542" strokeWidth={ROUNDING} strokeLinejoin="round" />
      <circle cx="21.5" cy="40.5" r="2.8" fill="#f4a08a" opacity="0.6" />
      <circle cx="42.5" cy="40.5" r="2.8" fill="#f4a08a" opacity="0.6" />
      <circle cx="25.4" cy="32.6" r="5.4" fill="#fff" />
      <circle cx="38.6" cy="32.6" r="5.4" fill="#fff" />
      <circle cx={26.2 + look} cy={33.3 - look} r="2.9" fill="#2b1d14" />
      <circle cx={39.4 + look} cy={33.3 - look} r="2.9" fill="#2b1d14" />
      <path d="M28.4 41.4q3.6 3 7.2 0" stroke="#2b1d14" strokeWidth="1.9" strokeLinecap="round" fill="none" />
    </svg>
  );
}

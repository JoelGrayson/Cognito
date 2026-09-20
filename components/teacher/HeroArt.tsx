import { Mascot } from "@/components/Mascot";
import { SpeechBubbleTail } from "@/components/SpeechBubbleTail";

const ROWS = [
  { y: 58, w: 118, right: true },
  { y: 96, w: 96, right: false },
  { y: 134, w: 132, right: true },
  { y: 172, w: 104, right: true },
];

/** A marked paper in miniature: what comes back, before anyone reads a word. */
export function HeroArt() {
  return (
    <div className="relative">
      <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-2 rounded-3xl border border-(--wb-line) bg-(--wb-blush)" />
      <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rotate-1 rounded-3xl border border-(--wb-line) bg-(--wb-butter)" />
      {/* Same card and bubble as the student landing, so switching modes moves nothing. */}
      <div className="relative rounded-3xl border border-(--wb-line) bg-(--wb-card) p-4 shadow-[0_2px_10px_rgb(59_42_31/0.06)] sm:p-5">
        <div className="absolute -right-5 -top-9 hidden flex-row-reverse items-start gap-1 sm:flex">
          <Mascot size={72} />
          <span className="relative mt-3 rounded-2xl bg-(--wb-primary) px-4 py-2.5 text-[15px] text-(--wb-card) drop-shadow-lg">
            28 papers? Back in minutes.
            <SpeechBubbleTail side="right" />
          </span>
        </div>
        <svg viewBox="0 0 300 230" role="img" aria-label="A worksheet marked with ticks, one circled mistake and a score" className="mx-auto mt-4 block h-auto w-full max-w-105">
          <rect x="28" y="24" width="92" height="9" rx="4.5" fill="var(--wb-ink)" opacity="0.8" />
          {ROWS.map((row) => (
            <g key={row.y}>
              <rect x="28" y={row.y} width="14" height="9" rx="4.5" fill="var(--wb-muted)" opacity="0.5" />
              <rect x="52" y={row.y} width={row.w} height="9" rx="4.5" fill="#2563eb" opacity="0.55" />
              {row.right ? (
                <path d={`M${row.w + 66} ${row.y + 5} l6 7 l12 -16`} fill="none" stroke="#15803d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <>
                  <ellipse cx={52 + row.w / 2} cy={row.y + 4.5} rx={row.w / 2 + 12} ry="15" fill="none" stroke="#dc2626" strokeWidth="3" />
                  <rect x={row.w + 74} y={row.y} width="58" height="9" rx="4.5" fill="#dc2626" opacity="0.7" />
                </>
              )}
            </g>
          ))}
          <g transform="rotate(-8 243 185)">
            <rect x="204" y="162" width="78" height="46" rx="12" fill="var(--wb-butter)" stroke="var(--wb-butter-ink)" strokeWidth="2" />
            <text x="243" y="194" textAnchor="middle" fontSize="26" fontWeight="600" fill="var(--wb-butter-ink)" className="wb-serif">
              3/4
            </text>
          </g>
        </svg>
        <p className="mt-2 text-center text-xs text-(--wb-muted)">A worksheet, the way it comes back</p>
      </div>
    </div>
  );
}

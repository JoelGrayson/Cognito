import type { ReactNode } from "react";

const ICONS = {
  math: { tint: "#f8efc8", ink: "#8a7420", art: <><path d="M5 4v15h15" /><path d="M8 16c3 0 3.5-9 10-9" /></> },
  chemistry: {
    tint: "#fbe6d4",
    ink: "#a8622a",
    art: <><path d="m12 4 5.5 3.2v6.4L12 16.8l-5.5-3.2V7.2Z" /><path d="M12 16.8V20M17.5 7.2 20 5.8M6.5 7.2 4 5.8" /></>,
  },
  physics: {
    tint: "#dfeaf6",
    ink: "#3f6b9c",
    art: <><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-30 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(30 12 12)" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  },
  code: { tint: "#e9e4f7", ink: "#5d4a9c", art: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" /></> },
  ai: {
    tint: "#e4f1e3",
    ink: "#2f6b3c",
    art: <><circle cx="5.5" cy="7" r="1.8" /><circle cx="5.5" cy="17" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="18.5" cy="12" r="1.8" /><path d="m7.1 8 3.3 2.8M7.1 16l3.3-2.8M13.8 12h2.9" /></>,
  },
  language: { tint: "#f9dcdc", ink: "#a23a2f", art: <><path d="M4 5h16v11H10l-5 4v-4H4Z" /><path d="M8 9h8M8 12h5" /></> },
  money: { tint: "#e4f1e3", ink: "#2f6b3c", art: <><path d="M3 20h18M6 20v-6M12 20V6M18 20v-10" /></> },
  history: { tint: "#f8efc8", ink: "#8a7420", art: <><path d="m4 8 8-4 8 4M5 8h14M5 20h14M8 8v12M12 8v12M16 8v12" /></> },
  writing: { tint: "#fbe6d4", ink: "#a8622a", art: <><path d="M12 20h8M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4Z" /></> },
  music: { tint: "#e9e4f7", ink: "#5d4a9c", art: <><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></> },
  roadmap: {
    tint: "#dfeaf6",
    ink: "#3f6b9c",
    art: <><rect x="4" y="4" width="7" height="5" rx="1.5" /><rect x="13" y="15" width="7" height="5" rx="1.5" /><path d="M7.5 9v4a2 2 0 0 0 2 2H13" /></>,
  },
} satisfies Record<string, { tint: string; ink: string; art: ReactNode }>;

export type SubjectIconName = keyof typeof ICONS;

/** The icon's two colours, for surfaces that should read as the same subject. */
export function subjectColors(name: SubjectIconName): { tint: string; ink: string } {
  const { tint, ink } = ICONS[name];
  return { tint, ink };
}

/** A line drawing on a pastel tile. The tint is part of the icon so a subject looks
 *  the same wherever it appears. */
export function SubjectIcon({ name, size = 44 }: { name: SubjectIconName; size?: number }) {
  const { tint, ink, art } = ICONS[name];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl"
      style={{ width: size, height: size, background: tint, color: ink }}
      aria-hidden
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {art}
      </svg>
    </span>
  );
}

import Link from "next/link";
import { cn } from "@/lib/utils";

const MODES = [
  { id: "student", label: "Student", href: "/" },
  { id: "teacher", label: "Teacher", href: "/teacher" },
] as const;

export type Mode = (typeof MODES)[number]["id"];

/** The product has two front doors: learning for yourself, and grading for a class. */
export function ModeSwitch({ mode, className }: { mode: Mode; className?: string }) {
  return (
    <nav aria-label="Mode" className={cn("inline-flex rounded-full border border-(--wb-line) bg-(--wb-card) p-1 text-sm", className)}>
      {MODES.map((m) => (
        <Link
          key={m.id}
          href={m.href}
          aria-current={m.id === mode ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            m.id === mode ? "bg-(--wb-primary) text-(--wb-card)" : "text-(--wb-muted) hover:bg-(--wb-hover)",
          )}
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

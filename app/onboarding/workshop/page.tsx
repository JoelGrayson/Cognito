import Link from "next/link";
import { onboardingRepo } from "@/lib/repo";
import { requireUserId } from "@/lib/session";

// Reads per-user state, so it must never be prerendered.
export const dynamic = "force-dynamic";

// PLACEHOLDER: the workshop milestone (graph + chat) replaces this page.
export default async function WorkshopPlaceholder() {
  const { profile } = await onboardingRepo.get(await requireUserId());
  const rows: [string, string | undefined][] = [
    ["Goal", profile.goal],
    ["Why", profile.goalType],
    ["Deadline", profile.deadline ?? "None"],
    ["Hours per week", profile.hoursPerWeek?.toString()],
    ["Pace", profile.preferences?.pace],
    ["Days per week", profile.availability?.daysPerWeek?.toString()],
    ["Starting point", profile.priorKnowledge?.map((k) => `${k.concept} (${k.level})`).join(", ")],
    ["Formats", profile.preferences?.formats?.join(", ")],
    ["Tutor style", profile.tutorStyle],
    ["Constraints", profile.constraints || undefined],
    ["Timezone", profile.availability?.timezone],
  ];

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:py-12">
      <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">Placeholder</p>
      <h1 className="mt-1 text-[1.75rem] font-semibold tracking-tight sm:text-4xl">Workshop coming next</h1>
      <p className="mt-2 text-[15px] text-[#6b6b6b]">
        Your answers are saved. The roadmap workshop will be built here in the next milestone.
      </p>
      <dl className="mt-6 divide-y divide-[#ecece8] rounded-2xl bg-[var(--panel)] px-4">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[8.5rem_1fr] gap-3 py-3 text-sm">
            <dt className="text-[#6b6b6b]">{label}</dt>
            <dd className="font-medium break-words">{value || "Not set"}</dd>
          </div>
        ))}
      </dl>
      <Link
        href="/onboarding?edit=1"
        className="mt-6 inline-flex min-h-12 items-center rounded-full px-5 text-[15px] font-medium text-[var(--accent)] hover:bg-[#f0f0ee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
      >
        Back to the questionnaire
      </Link>
    </main>
  );
}

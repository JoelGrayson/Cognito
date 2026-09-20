import { redirect } from "next/navigation";
import { Workshop } from "@/components/onboarding/Workshop";
import { firstIncompleteStep } from "@/lib/onboarding/profile";
import { onboardingRepo, roadmapRepo } from "@/lib/repo";
import { getUserId } from "@/lib/session";

// Reads per-user state, so it must never be prerendered.
export const dynamic = "force-dynamic";

export default async function WorkshopPage({ searchParams }: PageProps<"/onboarding/workshop">) {
  const userId = await getUserId();
  if (!userId) redirect("/onboarding");

  const state = await onboardingRepo.get(userId);

  // ?from=<id> resumes a past roadmap: it becomes the active draft, linked so later
  // saves write back to the record. A different goal drops the old goal's concepts.
  const { from } = await searchParams;
  if (typeof from === "string" && from) {
    const record = await roadmapRepo.get(from, userId);
    if (record) {
      const goalChanged = record.goal !== state.profile.goal;
      await onboardingRepo.update(userId, {
        draftGraph: record.graph,
        activeRoadmapId: record.id,
        profile: { goal: record.goal, ...(goalChanged ? { priorKnowledge: [], concepts: undefined } : {}) },
      });
      return <Workshop draftGraph={record.graph} roadmapId={record.id} />;
    }
  }
  // "0000-00-00" accepts any stored deadline, same as the PATCH gate.
  if (firstIncompleteStep(state.profile, "0000-00-00")) redirect("/onboarding");

  return <Workshop draftGraph={state.draftGraph} roadmapId={state.activeRoadmapId} />;
}

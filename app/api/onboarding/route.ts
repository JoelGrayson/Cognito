import { jsonError, parseBody, serverError } from "@/lib/http";
import { firstIncompleteStep, mergeProfile } from "@/lib/onboarding/profile";
import { PatchBody } from "@/lib/onboarding/schemas";
import { onboardingRepo } from "@/lib/repo";
import { requireUserId } from "@/lib/session";
import type { OnboardingProfile } from "@/types/learning";

export async function GET() {
  try {
    const userId = await requireUserId();
    return Response.json(await onboardingRepo.get(userId));
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await parseBody(request, PatchBody);
    if (!body.ok) return body.response;

    // `deadline: null` clears the stored date; `concepts: null` clears the stored concept list.
    const { deadline, concepts, ...rest } = body.data.profile ?? {};
    let profile: OnboardingProfile = rest;
    if (deadline === null) profile = { ...profile, deadline: undefined };
    else if (deadline) profile = { ...profile, deadline };
    if (concepts === null) profile = { ...profile, concepts: undefined };
    else if (concepts) profile = { ...profile, concepts };

    // The client sends the whole profile each save, so `goal` is always present;
    // compare it to the stored one to detect a real change.
    const needsCurrent = Boolean(body.data.step && body.data.step !== "questionnaire") || profile.goal !== undefined;
    const current = needsCurrent ? await onboardingRepo.get(userId) : null;

    // Leaving the questionnaire needs a complete one. The date was already checked above, so pass a `today` that accepts any.
    if (current && body.data.step && body.data.step !== "questionnaire") {
      const incomplete = firstIncompleteStep(mergeProfile(current.profile, profile), "0000-00-00");
      if (incomplete) return jsonError([`Finish questionnaire step ${incomplete} first.`], 400);
    }

    // A new goal invalidates the stored draft — the next workshop load generates a fresh
    // graph (and a new record). The old record stays in history, unlinked.
    const goalChanged =
      current && profile.goal !== undefined && profile.goal !== current.profile.goal;

    const state = await onboardingRepo.update(userId, {
      profile,
      ...(body.data.step && { step: body.data.step }),
      ...(goalChanged ? { draftGraph: null, activeRoadmapId: null } : {}),
    });
    return Response.json({ step: state.step, profile: state.profile });
  } catch (err) {
    return serverError(err);
  }
}

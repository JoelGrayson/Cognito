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

    // `deadline: null` clears the stored date.
    const { deadline, ...rest } = body.data.profile ?? {};
    const profile: OnboardingProfile = deadline === null ? { ...rest, deadline: undefined } : deadline ? { ...rest, deadline } : rest;

    // Leaving the questionnaire needs a complete one. The date was already checked above, so pass a `today` that accepts any.
    if (body.data.step && body.data.step !== "questionnaire") {
      const current = await onboardingRepo.get(userId);
      const incomplete = firstIncompleteStep(mergeProfile(current.profile, profile), "0000-00-00");
      if (incomplete) return jsonError([`Finish questionnaire step ${incomplete} first.`], 400);
    }

    const state = await onboardingRepo.update(userId, { profile, ...(body.data.step && { step: body.data.step }) });
    return Response.json({ step: state.step, profile: state.profile });
  } catch (err) {
    return serverError(err);
  }
}

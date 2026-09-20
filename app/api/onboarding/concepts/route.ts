import { generateConcepts, generateConceptsWithProvider, pickProvider } from "@/lib/ai";
import { parseBody, serverError } from "@/lib/http";
import { ConceptsRequest } from "@/lib/onboarding/schemas";
import { requireUserId } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await parseBody(request, ConceptsRequest);
    if (!body.ok) return body.response;
    const providerId = pickProvider(body.data.provider);
    const concepts = providerId
      ? await generateConceptsWithProvider(providerId, body.data.goal, { userId })
      : await generateConcepts(body.data.goal);
    // A failure here becomes a 500; the client then shows the level selector instead.
    return Response.json({ concepts });
  } catch (err) {
    return serverError(err);
  }
}

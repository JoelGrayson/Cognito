import { generateConcepts } from "@/lib/ai";
import { parseBody, serverError } from "@/lib/http";
import { ConceptsRequest } from "@/lib/onboarding/schemas";
import { requireUserId } from "@/lib/session";

export async function POST(request: Request) {
  try {
    await requireUserId();
    const body = await parseBody(request, ConceptsRequest);
    if (!body.ok) return body.response;
    // A failure here becomes a 500; the client then shows the level selector instead.
    return Response.json({ concepts: await generateConcepts(body.data.goal) });
  } catch (err) {
    return serverError(err);
  }
}

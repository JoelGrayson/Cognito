import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, readJson } from "@/lib/api";
import { waitlistRepo } from "@/lib/repo";
import { STUDYING } from "@/lib/waitlist";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("That doesn't look like an email address.")),
  name: z.string().trim().max(120).optional(),
  studying: z.enum(STUDYING).optional(),
  source: z.string().trim().max(40).optional(),
  /** Hidden from people, irresistible to form-filling bots. Anything in it means a bot. */
  website: z.string().max(200).optional(),
});

/** Add someone to the waitlist. Signing up twice is fine and says the same thing. */
export const POST = apiHandler(async (request) => {
  const body = await readJson(request, BodySchema);
  // Tell the bot it worked, so it has no reason to try a different shape.
  if (body.website) return NextResponse.json({ ok: true });

  try {
    await waitlistRepo.join({
      email: body.email,
      name: body.name || undefined,
      studying: body.studying,
      source: body.source || undefined,
    });
  } catch (error) {
    // apiHandler would send the driver's message back, and that message is the SQL.
    console.error("waitlist: join failed", error);
    return NextResponse.json({ error: "Couldn't save that. Try again in a moment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});

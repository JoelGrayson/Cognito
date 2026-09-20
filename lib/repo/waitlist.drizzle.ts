import { getDb } from "@/db";
import { waitlist } from "@/db/schema";
import type { WaitlistRepo } from "./types";

export const drizzleWaitlistRepo: WaitlistRepo = {
  async join(entry) {
    await getDb()
      .insert(waitlist)
      .values({ email: entry.email, name: entry.name ?? null, studying: entry.studying ?? null, source: entry.source ?? null })
      .onConflictDoNothing({ target: waitlist.email });
  },
};

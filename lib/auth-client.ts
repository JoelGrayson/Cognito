"use client";

import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import { chatgptClient } from "@/lib/chatgpt/client";

export const authClient = createAuthClient({
  plugins: [chatgptClient(), anonymousClient()],
});

let pendingSession: Promise<void> | undefined;

/** Reuse existing sessions and coalesce concurrent attempts in this browser tab. */
export function ensureAnonymousSession(): Promise<void> {
  if (pendingSession) return pendingSession;
  pendingSession = (async () => {
    const current = await authClient.getSession();
    if (current.error) throw new Error("Unable to check your session. Please try again.");
    if (current.data) return;

    const result = await authClient.signIn.anonymous();
    if (result.error) {
      // Another tab may have established the shared cookie in the meantime.
      const latest = await authClient.getSession();
      if (!latest.error && latest.data) return;
      throw new Error("Unable to start your session. Please try again.");
    }
  })().finally(() => { pendingSession = undefined; });
  return pendingSession;
}

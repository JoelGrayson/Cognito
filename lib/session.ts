import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

// Identity comes only from here. API routes call requireUserId() and never read
// a user id from the request. Pages that work for anonymous visitors use getUserId().
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Sign in required.");
    this.name = "UnauthorizedError";
  }
}

export async function getUserId(): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function requireUserId(): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

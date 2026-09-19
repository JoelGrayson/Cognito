// Phase 0 stub. Phase 1 replaces the body with a Better Auth session lookup.
// API routes get the user id from here and never from the request.
export async function requireUserId(): Promise<string> {
  return "dev-user";
}

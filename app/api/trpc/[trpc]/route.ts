import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/router";

export const maxDuration = 120;

function handler(request: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => ({ headers: request.headers }),
    onError: process.env.NODE_ENV === "development"
      ? ({ error, path }) => console.error(`tRPC failed on ${path ?? "unknown procedure"}`, error)
      : undefined,
  });
}

export { handler as GET, handler as POST };

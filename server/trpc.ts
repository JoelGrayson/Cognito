import { initTRPC, TRPCError } from "@trpc/server";
import { ProviderError } from "@/lib/providers";

export interface TRPCContext {
  headers: Headers;
}

const t = initTRPC.context<TRPCContext>().create();

function providerErrorCode(status: number) {
  if (status === 400) return "BAD_REQUEST" as const;
  if (status === 401) return "UNAUTHORIZED" as const;
  if (status === 403) return "FORBIDDEN" as const;
  if (status === 404) return "NOT_FOUND" as const;
  if (status === 408) return "TIMEOUT" as const;
  if (status === 429) return "TOO_MANY_REQUESTS" as const;
  return "INTERNAL_SERVER_ERROR" as const;
}

const handleProviderErrors = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new TRPCError({
        code: providerErrorCode(error.status),
        message: error.message,
        cause: error,
      });
    }
    throw error;
  }
});

export const router = t.router;
export const publicProcedure = t.procedure.use(handleProviderErrors);

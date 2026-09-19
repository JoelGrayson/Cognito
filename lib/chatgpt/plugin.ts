import {
  type ChatGPTTokens,
  type ChatGPTUser,
  ChatGPTAuthError,
  exchangeDeviceAuthorization,
  parseUser,
  pollDeviceCode,
  randomToken,
  requestDeviceCode,
} from "@opencoredev/loginwithchatgpt-core";
import { APIError, createAuthEndpoint, getSessionFromCtx, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";
import {
  chatgptConfig,
  loadChatGPTAccount,
  saveChatGPTTokens,
} from "@/lib/chatgpt/tokens";

interface DeviceState {
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
  expiresAt: number;
  lastPolledAt: number;
}

const handleSchema = z.object({ handle: z.string().min(1).max(200) });
const identifierFor = (handle: string) => `chatgpt-device:${handle}`;

function publicUser(user: ChatGPTUser) {
  return {
    accountId: user.accountId,
    ...(user.email ? { email: user.email } : {}),
    ...(user.name ? { name: user.name } : {}),
    ...(user.plan ? { plan: user.plan } : {}),
  };
}

function isAnonymousUser(user: unknown): boolean {
  return (user as { isAnonymous?: boolean } | undefined)?.isAnonymous === true;
}

function authError(error: unknown): never {
  if (error instanceof ChatGPTAuthError) {
    throw new APIError("BAD_GATEWAY", { message: error.message });
  }
  throw error;
}

async function saveLinkedAccount(
  ctx: Parameters<typeof getSessionFromCtx>[0],
  userId: string,
  accountId: string,
  tokens: ChatGPTTokens,
) {
  const linked = await ctx.context.internalAdapter.linkAccount({
    userId,
    providerId: "chatgpt",
    accountId,
    scope: chatgptConfig.scope,
  });
  await saveChatGPTTokens(linked.id, tokens);
}

export function chatgptPlugin(): BetterAuthPlugin {
  return {
    id: "chatgpt",
    endpoints: {
      startChatGPTSignIn: createAuthEndpoint("/sign-in/chatgpt/start", {
        method: "POST",
        metadata: { noStore: true },
      }, async (ctx) => {
        try {
          const device = await requestDeviceCode(chatgptConfig);
          const handle = randomToken();
          const state: DeviceState = { ...device, lastPolledAt: 0 };
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: identifierFor(handle),
            value: JSON.stringify(state),
            expiresAt: new Date(device.expiresAt),
          });
          return ctx.json({
            handle,
            userCode: device.userCode,
            verificationUrl: device.verificationUrl,
            interval: device.interval,
            expiresAt: device.expiresAt,
          });
        } catch (error) {
          authError(error);
        }
      }),
      pollChatGPTSignIn: createAuthEndpoint("/sign-in/chatgpt/poll", {
        method: "POST",
        body: handleSchema,
        metadata: { noStore: true },
      }, async (ctx) => {
        const identifier = identifierFor(ctx.body.handle);
        const verification = await ctx.context.internalAdapter.findVerificationValue(identifier);
        if (!verification || verification.expiresAt.getTime() <= Date.now()) {
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
          return ctx.json({ status: "expired" as const });
        }

        const state = JSON.parse(verification.value) as DeviceState;
        const now = Date.now();
        if (now - state.lastPolledAt < state.interval * 1000) {
          return ctx.json({ status: "pending" as const });
        }

        try {
          const result = await pollDeviceCode(chatgptConfig, state);
          if (result.status === "pending") {
            await ctx.context.internalAdapter.updateVerificationByIdentifier(identifier, {
              value: JSON.stringify({ ...state, lastPolledAt: now }),
            });
            return ctx.json({ status: "pending" as const });
          }

          const tokens = await exchangeDeviceAuthorization(chatgptConfig, result);
          const chatgptUser = parseUser(tokens.idToken);
          if (!chatgptUser?.accountId) {
            throw new APIError("BAD_GATEWAY", { message: "ChatGPT did not return an account identity." });
          }
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);

          const existing = await ctx.context.internalAdapter.findAccountByKey({
            providerId: "chatgpt",
            accountId: chatgptUser.accountId,
          });
          const current = await getSessionFromCtx(ctx);
          if (existing) {
            if (current && !isAnonymousUser(current.user) && current.user.id !== existing.userId) {
              throw new APIError("CONFLICT", {
                message: "That ChatGPT account is already linked to a different user.",
              });
            }
            await saveChatGPTTokens(existing.id, tokens);
            const session = await ctx.context.internalAdapter.createSession(existing.userId);
            const user = await ctx.context.internalAdapter.findUserById(existing.userId);
            if (!user) throw new APIError("INTERNAL_SERVER_ERROR", { message: "The linked user no longer exists." });
            await setSessionCookie(ctx, { session, user });
            return ctx.json({ status: "authenticated" as const, linked: false, user: publicUser(chatgptUser) });
          }

          if (current && !isAnonymousUser(current.user)) {
            await saveLinkedAccount(ctx, current.user.id, chatgptUser.accountId, tokens);
            return ctx.json({ status: "authenticated" as const, linked: true, user: publicUser(chatgptUser) });
          }

          const email = chatgptUser.email ?? `chatgpt-${chatgptUser.accountId}@users.noreply.structuredlearning.ai`;
          const existingUser = await ctx.context.internalAdapter.findUserByEmail(email, { includeAccounts: false });
          const user = existingUser && !isAnonymousUser(existingUser.user)
            ? existingUser.user
            : await ctx.context.internalAdapter.createUser({
                email,
                name: chatgptUser.name ?? chatgptUser.email ?? "ChatGPT user",
                emailVerified: Boolean(chatgptUser.email),
                createdAt: new Date(),
                updatedAt: new Date(),
              }, { method: "chatgpt" });
          await saveLinkedAccount(ctx, user.id, chatgptUser.accountId, tokens);
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ status: "authenticated" as const, linked: false, user: publicUser(chatgptUser) });
        } catch (error) {
          authError(error);
        }
      }),
      chatGPTStatus: createAuthEndpoint("/chatgpt/status", {
        method: "GET",
        use: [sessionMiddleware],
      }, async (ctx) => {
        const loaded = await loadChatGPTAccount(ctx.context.session.user.id);
        const linked = Boolean(loaded?.tokens?.refreshToken);
        return ctx.json({
          linked,
          ...(linked && loaded?.user ? { user: publicUser(loaded.user) } : {}),
        });
      }),
      unlinkChatGPT: createAuthEndpoint("/chatgpt/unlink", {
        method: "POST",
        use: [sessionMiddleware],
      }, async (ctx) => {
        const loaded = await loadChatGPTAccount(ctx.context.session.user.id);
        if (loaded) await ctx.context.internalAdapter.deleteAccount(loaded.rowId);
        return ctx.json({ success: true as const });
      }),
    },
    rateLimit: [{
      pathMatcher: (path) => path === "/sign-in/chatgpt/poll",
      window: 10,
      max: 10,
    }],
  };
}

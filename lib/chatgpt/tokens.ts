import "server-only";

import {
  type ChatGPTTokens,
  type ChatGPTUser,
  type CodexAuth,
  ChatGPTAuthError,
  ensureFreshTokens,
  parseUser,
  resolveConfig,
} from "@opencoredev/loginwithchatgpt-core";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { account } from "@/db/schema";
import { ProviderError } from "@/lib/providers";

export const chatgptConfig = resolveConfig({});

const inflightRefreshes = new Map<string, Promise<CodexAuth | undefined>>();

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is required to encrypt ChatGPT tokens.");
  return value;
}

async function encryptToken(value: string | undefined): Promise<string | null> {
  return value ? symmetricEncrypt({ key: secret(), data: value }) : null;
}

async function decryptToken(value: string | null): Promise<string | undefined> {
  return value ? symmetricDecrypt({ key: secret(), data: value }) : undefined;
}

export async function saveChatGPTTokens(accountRowId: string, tokens: ChatGPTTokens): Promise<void> {
  await getDb()
    .update(account)
    .set({
      accessToken: await encryptToken(tokens.accessToken),
      refreshToken: await encryptToken(tokens.refreshToken),
      idToken: tokens.idToken ?? null,
      accessTokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
    })
    .where(eq(account.id, accountRowId));
}

export async function loadChatGPTAccount(userId: string): Promise<{
  rowId: string;
  accountId: string;
  tokens: ChatGPTTokens | undefined;
  user: ChatGPTUser | undefined;
} | undefined> {
  const [row] = await getDb()
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "chatgpt")))
    .limit(1);
  if (!row) return undefined;

  const accessToken = await decryptToken(row.accessToken);
  const refreshToken = await decryptToken(row.refreshToken);
  const tokens = accessToken
    ? {
        accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        ...(row.idToken ? { idToken: row.idToken } : {}),
        ...(row.accessTokenExpiresAt ? { expiresAt: row.accessTokenExpiresAt.getTime() } : {}),
        accountId: row.accountId,
      }
    : undefined;
  return {
    rowId: row.id,
    accountId: row.accountId,
    tokens,
    user: row.idToken ? parseUser(row.idToken) : undefined,
  };
}

export async function clearChatGPTTokens(accountRowId: string): Promise<void> {
  await getDb()
    .update(account)
    .set({ accessToken: null, refreshToken: null })
    .where(eq(account.id, accountRowId));
}

export async function getChatGPTAuth(userId: string): Promise<CodexAuth | undefined> {
  const pending = inflightRefreshes.get(userId);
  if (pending) return pending;

  const promise = loadFreshChatGPTAuth(userId).finally(() => {
    inflightRefreshes.delete(userId);
  });
  inflightRefreshes.set(userId, promise);
  return promise;
}

async function loadFreshChatGPTAuth(userId: string): Promise<CodexAuth | undefined> {
  const loaded = await loadChatGPTAccount(userId);
  if (!loaded?.tokens) return undefined;

  try {
    const tokens = await ensureFreshTokens(chatgptConfig, loaded.tokens, {
      onRefresh: (refreshed) => saveChatGPTTokens(loaded.rowId, refreshed),
    });
    const accountId = tokens.accountId ?? loaded.accountId;
    if (!accountId) return undefined;
    return { accessToken: tokens.accessToken, accountId };
  } catch (error) {
    if (error instanceof ChatGPTAuthError && error.code === "refresh_token_invalid") {
      await clearChatGPTTokens(loaded.rowId);
      throw new ProviderError("Your ChatGPT session expired. Reconnect your ChatGPT account.", 401);
    }
    throw error;
  }
}

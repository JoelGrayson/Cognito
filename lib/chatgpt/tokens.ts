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
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { account } from "@/db/schema";
import { ProviderError } from "@/lib/providers/types";

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

async function decryptIdToken(value: string | null): Promise<string | undefined> {
  if (!value) return undefined;
  try {
    return await symmetricDecrypt({ key: secret(), data: value });
  } catch {
    return value;
  }
}

export async function saveChatGPTTokens(accountRowId: string, tokens: ChatGPTTokens): Promise<void> {
  const values = {
    accessToken: await encryptToken(tokens.accessToken),
    refreshToken: await encryptToken(tokens.refreshToken),
    accessTokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
  };
  if (tokens.idToken !== undefined) {
    Object.assign(values, { idToken: await encryptToken(tokens.idToken) });
  }
  await getDb()
    .update(account)
    .set(values)
    .where(eq(account.id, accountRowId));
}

export function hasUsableCredentials(row: {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
}): boolean {
  return Boolean(row.refreshToken) || (
    Boolean(row.accessToken) &&
    row.accessTokenExpiresAt != null &&
    row.accessTokenExpiresAt.getTime() > Date.now()
  );
}

export async function loadChatGPTAccount(userId: string): Promise<{
  rowId: string;
  accountId: string;
  tokens: ChatGPTTokens | undefined;
  user: ChatGPTUser | undefined;
  credentials: {
    accessToken: string | null;
    refreshToken: string | null;
    accessTokenExpiresAt: Date | null;
  };
} | undefined> {
  const [row] = await getDb()
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "chatgpt")))
    .orderBy(desc(account.updatedAt))
    .limit(1);
  if (!row) return undefined;

  const accessToken = await decryptToken(row.accessToken);
  const refreshToken = await decryptToken(row.refreshToken);
  const idToken = await decryptIdToken(row.idToken);
  const tokens = accessToken
    ? {
        accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        ...(idToken ? { idToken } : {}),
        ...(row.accessTokenExpiresAt ? { expiresAt: row.accessTokenExpiresAt.getTime() } : {}),
        accountId: row.accountId,
      }
    : undefined;
  return {
    rowId: row.id,
    accountId: row.accountId,
    tokens,
    user: idToken ? parseUser(idToken) : undefined,
    credentials: {
      accessToken: accessToken ?? null,
      refreshToken: refreshToken ?? null,
      accessTokenExpiresAt: row.accessTokenExpiresAt,
    },
  };
}

export async function deleteChatGPTAccount(accountRowId: string): Promise<void> {
  await getDb().delete(account).where(eq(account.id, accountRowId));
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
      await deleteChatGPTAccount(loaded.rowId);
      throw new ProviderError("Your ChatGPT session expired. Reconnect your ChatGPT account.", 401);
    }
    throw error;
  }
}

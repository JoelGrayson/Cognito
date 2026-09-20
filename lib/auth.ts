import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { chatgptPlugin } from "@/lib/chatgpt/plugin";
import { getDb } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { migrateUserData } from "@/lib/user-data";

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32) {
    throw new Error("Set BETTER_AUTH_SECRET to a random secret of at least 32 characters.");
  }
  if (!baseURL) throw new Error("Set BETTER_AUTH_URL to the application's origin.");

  return betterAuth({
    appName: "StructuredLearning.ai",
    secret,
    baseURL,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
      transaction: true,
    }),
    // Social sign-in. Signing in while anonymous links the account — onLinkAccount
    // moves the anonymous user's data, so nothing is lost.
    socialProviders: {
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
    },
    plugins: [
      chatgptPlugin(),
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await migrateUserData(anonymousUser.user.id, newUser.user.id);
        },
      }),
      nextCookies(),
    ],
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

// Initialize on the first request so builds do not require database credentials.
export function getAuth() {
  return auth ??= createAuth();
}

export type AuthSession = ReturnType<typeof getAuth>["$Infer"]["Session"];

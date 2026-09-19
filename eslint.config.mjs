import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees nested under the project; they have their own checkouts.
    ".claude/**",
  ]),
  // Phase 0 boundary: persistence goes through lib/repo, identity through lib/session.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "types/**/*.ts", "fixtures/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@/db", "@/db/*", "**/db", "**/db/*"], message: "Phase 0: persist through lib/repo." },
          { group: ["drizzle-orm", "drizzle-orm/*", "better-auth", "better-auth/*", "@supabase/*"], message: "Phase 0: no database or auth packages." },
          { group: ["@/lib/auth"], message: "Server identity comes from lib/session; lib/auth-client is for client components." },
        ],
      }],
    },
  },
  // Phase 1 code that landed early and the pre-plan prototype. Not part of Phase 0;
  // remove these exemptions when the Drizzle repos and Better Auth swap in.
  {
    files: [
      "lib/auth.ts", "lib/auth-client.ts", "lib/user-data.ts", "app/api/auth/**",
      "app/legacy/**", "app/api/mindmap/**", "app/api/lesson/**", "app/api/quiz/**",
      "lib/chatgpt/**", "components/ChatGPTConnect.tsx",
      // Persistence and identity boundary: the only Phase-0 modules allowed near db/auth.
      "lib/repo/**", "lib/session.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
]);

export default eslintConfig;

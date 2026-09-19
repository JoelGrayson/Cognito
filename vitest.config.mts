import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { defaultExclude, defineConfig } from "vitest/config";

// Expose .env (DATABASE_URL etc.) so the repo contract suite can run against a
// local database when one is configured.
nextEnv.loadEnvConfig(fileURLToPath(new URL("./", import.meta.url)));
// Tests stay on the in-memory repos; the contract suite exercises the Drizzle
// implementations directly when DATABASE_URL is local.
process.env.REPO_IMPL = "memory";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./", import.meta.url)) },
      // The marker package throws in plain node; server-only is enforced by Next, not vitest.
      { find: /^server-only$/, replacement: fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    // .claude/worktrees holds agent worktrees whose tests resolve "@/" to this root.
    // lib/whiteboard tests are plain node scripts, run via `pnpm whiteboard:test`.
    exclude: [...defaultExclude, ".claude/**", "lib/whiteboard/**"],
  },
});

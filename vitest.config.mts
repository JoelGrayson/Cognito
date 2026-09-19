import { fileURLToPath } from "node:url";
import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    // .claude/worktrees holds agent worktrees whose tests resolve "@/" to this root.
    // lib/whiteboard tests are plain node scripts, run via `pnpm whiteboard:test`.
    exclude: [...defaultExclude, ".claude/**", "lib/whiteboard/**"],
  },
});

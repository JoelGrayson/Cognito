<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project instructions

- Use pnpm for installing dependencies and running scripts. Do not use npm, npx, or yarn. The pinned version is declared in `package.json`.
- When adding, changing, or removing environment variables, update `.env.example` in the same change. Include required settings and optional flags with brief comments and safe defaults or empty placeholders; never include real credentials.
- Read the [project context](project-context/) and follow its [AGENTS.md](project-context/AGENTS.md) for the product architecture, data contract, and working rules.

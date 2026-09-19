# CLAUDE.md

Project context for AI coding agents and teammates. Keep this file short; details live in `docs/`.

## Project

(Project name TBD) is an AI-powered self-learning platform for the HackMIT education track. Self-learners fail because they don't know what to learn, in what order, or how long it takes, and they can't tell whether they actually understood it. We generate a personalized, editable roadmap (a node/edge graph in the style of roadmap.sh), guide the learner through it, and later add spaced repetition and an avatar "teach-back" to verify understanding.

**Current phase: Phase 0 (no database).** Onboarding is built against in-memory repositories and a stubbed session while teammates finalize database decisions. See `docs/kickoff-plan.md`.

## Stack

Next.js (App Router) + TypeScript (strict) + Tailwind. zod for all schemas. React Flow (`@xyflow/react`) + dagre (`@dagrejs/dagre`) for the graph. Claude API via `@anthropic-ai/sdk`. Zustand for client state. Vitest for tests.

Phase 1 adds: Supabase Postgres (as plain Postgres), Drizzle ORM, Better Auth (anonymous plugin).

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test                                                # vitest
npx tsx --env-file=.env.local scripts/eval-graph.ts     # prompt eval: validation pass rate, latency
npx drizzle-kit push                                    # Phase 1, schema owner only, read the diff first
```

## Environment

`ANTHROPIC_API_KEY`, `MOCK_AI=true` (no API calls, deterministic mocks), `REPO_IMPL=memory|drizzle` (default `memory`).
Phase 1: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Never commit `.env*.local`.

## Layout

```
app/                      routes: landing, onboarding, plan/[planId], api/*
components/TopicGraph/    shared graph component (workshop, plan view, learning experience)
components/onboarding/    questionnaire, chat panel, generating screen
lib/graph/                validate, applyOps, topoSort, layout, diff, fallback (pure, tested)
lib/schedule/             order and weekly schedule computation (pure, tested)
lib/ai/                   Anthropic client, models.ts, tools, prompts, mocks, retry
lib/repo/                 persistence interfaces + memory impl (drizzle impl in Phase 1)
lib/plans/                shared read API: getPlan, getActivePlan, getNextNode, applyPlanOps
lib/session.ts            requireUserId() (stub in Phase 0, Better Auth in Phase 1)
lib/user-data.ts          migrateUserData(fromId, toId) for account linking
types/learning.ts         zod schemas + inferred types (single source of truth)
fixtures/                 sample profile and graphs
scripts/                  eval-graph.ts
docs/                     project docs (see below)
db/                       Phase 1 only: schema.ts, auth-schema.ts, index.ts
```

## Rules (read before writing code)

1. **Types:** `types/learning.ts` is the single source of truth (zod schemas, inferred TS types). Never redefine or hand-copy a type.
2. **Phase 0 boundary:** do not import from `db/`, `drizzle-orm`, `better-auth`, or `@supabase/*`. Persistence goes only through `lib/repo/*`. Identity goes only through `lib/session.ts`.
3. **Graph changes** go only through `applyOps` (drafts) or `applyPlanOps` (saved plans), followed by `validateGraph`. Never edit graph JSON by hand.
4. **After a plan is saved, never hard-delete a node.** Set `scope: "excluded"`. Progress and cards reference `(planId, nodeId)` with no foreign key.
5. **`scope` vs `progress`:** `scope` (`included` | `known` | `excluded`) lives on the node. `progress` (`todo` | `in_progress` | `done`) lives in its own table. Never mix them.
6. **Lessons attach to leaf nodes.** Containers (nodes with children) have `estMinutes: 0`. Only leaves appear in `order`.
7. **LLM output comes only from forced tool calls** (`tool_choice`) validated with zod. Never parse free-text JSON. Every AI function has a mock and a fallback.
8. **AI calls live only in `lib/ai/`.** Model names live only in `lib/ai/models.ts`.
9. **API routes derive `userId` from `lib/session.ts`**, never from the request body.
10. **Units:** minutes for durations, ISO 8601 for dates in JSON, `timestamptz` for DB timestamps.
11. **Node ids:** `/^[a-z0-9_]{1,60}$/`, unique per plan, immutable.
12. **Pure logic** (`lib/graph`, `lib/schedule`) has no React and no I/O, and has tests.
13. **Don't write to tables you don't own** (see Ownership). Ask the owner for a function.
14. **Changing the data contract:** edit `docs/data-contract.md` and `types/learning.ts` in the same PR and tell the team. Don't silently drift.

## Gotchas

- React Flow: import `@xyflow/react/dist/style.css`, give the container an explicit height, and define `nodeTypes` outside the component (or memoize it).
- The dev in-memory store must live on `globalThis`, or it resets on every hot reload.
- Long routes (`/api/plan/generate`): `export const maxDuration = 60`.
- Tool `input_schema` from zod: `z.toJSONSchema` (zod 4), or `zod-to-json-schema` on zod 3.
- Phase 1, Better Auth: call `getSession` before `signIn.anonymous()` (a second anonymous sign-in errors). The anonymous user is deleted after linking, so move rows in `onLinkAccount` first.
- Phase 1, Supabase: use the transaction pooler with `postgres(url, { prepare: false })`. `drizzle-kit push` can try to drop teammates' tables, so read the diff.

## Ownership

| Area | Owner | Notes |
|---|---|---|
| Onboarding: `app/onboarding`, `app/plan/[planId]` (overview), `lib/graph`, `lib/schedule`, `lib/ai`, `components/TopicGraph`, `study_plans`, `onboarding_sessions` | (name TBD) | Writes plans |
| Learning experience: `app/plan/[planId]/learn`, `topic_progress`, `node_content` | (name TBD) | Reads plans via `lib/plans` |
| Future: spaced repetition, avatar teach-back | (name TBD) | `review_cards`, `assessments` |

## Docs (read on demand)

- `docs/project-overview.md`: vision, pillars, scope now vs later, demo story.
- `docs/architecture.md`: layers, AI integration, environments, phases, testing.
- `docs/data-contract.md`: **authoritative** decisions D1 to D12, zod contract, tables, 13 mermaid flow diagrams.
- `docs/onboarding-spec.md`: screens, API routes, AI functions and prompt rules, fallbacks, acceptance criteria.
- `docs/kickoff-plan.md`: Phase 0 milestones M0 to M7 with tasks and done-when criteria.

## Open decisions (proposals until ratified by the team)

D1 to D12 in `docs/data-contract.md` are proposals with defaults. Also open: project name, UI kit (shadcn/ui proposed), hosting (Vercel proposed), whether account upgrade is in the demo (proposed: out of scope).
If code and docs disagree, stop and ask rather than picking one.

## Working style

- Small PRs, merge often. Schema changes get their own PR.
- Before finishing a task: `npm run lint && npm test && npm run build`.
- Prefer editing existing modules over adding parallel ones. Reuse `lib/graph` and `lib/ai` helpers.
- Use `MOCK_AI=true` for UI work; verify prompt changes with `scripts/eval-graph.ts` against the real API.

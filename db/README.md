# Database

PostgreSQL (Supabase) is the persistence layer. Drizzle owns the schema and SQL
migrations; Zod schemas in `types/learning.ts` own the JSON contract.

## Setup

1. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to the Supabase
   Postgres connection string. This is a server secret, not a public Supabase URL
   or API key. Use the connection string supplied by Supabase, including SSL.
2. Optionally set `DIRECT_DATABASE_URL` to a direct or session-pooler connection
   for migrations and Studio. Runtime uses `DATABASE_URL`; tooling prefers
   `DIRECT_DATABASE_URL`. Runtime disables prepared statements for compatibility
   with Supabase's transaction pooler.
3. Review `drizzle/*.sql`, then run `npm run db:migrate` to apply committed
   migrations. Only the team's schema owner should change the shared database.

Commands:

- `npm run db:generate` generates a migration after schema edits; no DB required.
- `npm run db:check` checks the migration history for collisions.
- `npm run db:migrate` applies pending committed migrations.
- `npm run db:push` interactively previews and applies schema changes directly.
  Review every diff; another branch may not contain a teammate's tables. Prefer
  migrations and do not mix push and migrate on the same database.
- `npm run db:studio` opens the database browser.

Import `getDb` from `@/db` in server code and call it when a connection is needed.
It creates a reusable Postgres.js pool lazily so builds do not need credentials.
Use the Node.js runtime. Never import the database module into client components.

## Tables and choices

| Table | Key | Purpose |
| --- | --- | --- |
| `user` | text `id` | Better Auth identity, including `is_anonymous` |
| `session` | text `id`, unique `token` | Better Auth sessions |
| `account` | text `id`, unique provider/account pair | Better Auth credentials and provider identities |
| `verification` | text `id` | Better Auth verification tokens |
| `onboarding_sessions` | `user_id` | One resumable questionnaire/workshop per user |
| `study_plans` | UUID `id` | Many goals per user; profile snapshot, graph, order, schedule |
| `topic_progress` | `(plan_id, node_id)` | Missing row means `todo` |
| `node_content` | `(plan_id, node_id, kind)` | Lazy generated content cache |

Auth IDs are text, not UUIDs. Better Auth owns their generation. The four auth
tables use its standard fields plus the anonymous plugin's `isAnonymous` field.
Better Auth is configured in `lib/auth.ts` with the Drizzle adapter and anonymous
plugin. `/api/auth/[...all]` serves its endpoints; `lib/auth-client.ts` provides
the React client. The existing learning flow creates a session on demand, and
the generation endpoint verifies the session before calling an AI provider.

Every timestamp uses `timestamptz`. Creation timestamps default in Postgres;
`updatedAt` also updates automatically on Drizzle writes. Raw SQL writers must
set `updated_at` themselves. Durations inside JSON are minutes.

Owner and plan foreign keys cascade. Before Better Auth deletes an anonymous
user during account linking, `migrateUserData` transfers their plans and
onboarding session in a transaction. If both users have an onboarding row, the
destination's existing workshop wins. Plan-keyed progress and content follow
without changes. Account upgrade providers and UI are not yet enabled.

The graph stays JSONB, as specified. `node_id` is a logical reference into that
graph, not a SQL foreign key. Saved nodes must never be hard-deleted or have their
IDs reused. The future `lib/graph` / `lib/plans` write boundary must validate
graph structure, leaf-only content/progress, objectives, order and schedule;
convert removals to `scope: excluded`; and bump `version` atomically (using a
version predicate or row lock to avoid lost edits). JSONB `$type` annotations
only provide compile-time typing: parse inputs with the shared Zod schemas
before persisting. SQL checks enforce top-level JSON shapes, positive versions,
valid progress/steps, and slug formats, not full graph semantics.

Plans must be read through the future `lib/plans` boundary with a server-derived
session user ID. This setup does not yet persist the existing roadmap UI or
implement graph operations, scheduling, route guards, or authorization handlers.

RLS is enabled on all tables without public policies. Access is through the
trusted server connection (Supabase's Postgres role bypasses RLS), not the
browser-facing Supabase Data API. A custom restricted server role needs its own
grants/policies. Better Auth sessions are not Supabase Auth JWTs; do not use
`auth.uid()` policies for this identity model.

Review cards, FSRS state, and assessments are intentionally deferred because
the spec leaves their complete payloads and lifecycle to future feature owners.

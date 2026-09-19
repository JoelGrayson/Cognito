# StructuredLearning.ai

Type what you want to learn and get a structured roadmap: the stages you need to work through, what to learn at each one, and what to learn alongside it. Then type modifications ("more on transformers", "assume I know calculus") to reshape the map.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in the keys you have
npm run dev
```

Open http://localhost:3000.

## Database

Drizzle is configured for Supabase Postgres. Set `DATABASE_URL` in `.env.local`,
review the generated SQL in `drizzle/`, then run `npm run db:migrate`.
See [the database guide](db/README.md) for the schema, connection options,
migration workflow, and remaining application integration work.

## Authentication

Better Auth uses the existing Drizzle tables with its anonymous plugin. Starting
a topic creates a guest session if one does not already exist; subsequent
requests reuse the session cookie. `/api/mindmap` requires a valid session.

Set these server-only variables in `.env.local`:

```dotenv
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-a-random-secret
```

Generate the secret with `openssl rand -base64 32`. For deployment, set
`BETTER_AUTH_URL` to the actual HTTPS origin and keep the secret stable across
instances. Local values have been configured for this workspace. Restart the
dev server after changing environment variables.

- Server: `getAuth()` from `@/lib/auth`; read a session with
  `getAuth().api.getSession({ headers: request.headers })` in a route handler.
  Always derive ownership from `session.user.id`.
- Client: `authClient` from `@/lib/auth-client` exposes `useSession()`,
  `signIn.anonymous()`, and `signOut()`. `ensureAnonymousSession()` reuses an
  existing session and coalesces simultaneous sign-in attempts in a tab.
- Auth endpoints are mounted at `/api/auth/[...all]` using the Node.js runtime.
- Account linking transfers plans before deleting the guest identity. Email
  and OAuth sign-in are not enabled yet. Signing out of a guest account does
  not provide a way to recover it without a linked authentication method.

## Swapping the AI provider

The model dropdown lets you pick who generates the roadmap. A provider shows up as available once its credentials are in `.env.local` (or, for local, once the server is reachable).

| Provider | Env vars | Default model |
| --- | --- | --- |
| Claude | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` | `claude-opus-5` |
| OpenAI | `OPENAI_API_KEY`, optional `OPENAI_MODEL` | `gpt-5` |
| Grok | `XAI_API_KEY`, optional `XAI_MODEL` | `grok-4` |
| Local | optional `LOCAL_BASE_URL`, `LOCAL_MODEL`, `LOCAL_API_KEY` | auto-detected from the server, preferring a Qwen model |

Local points at Ollama (`http://localhost:11434/v1`) by default. Pull a model and keep Ollama running:

```bash
ollama pull qwen3:8b
```

LM Studio, vLLM and llama.cpp work too: set `LOCAL_BASE_URL` to their OpenAI-compatible endpoint and `LOCAL_MODEL` to the model name.

## How it works

- `app/page.tsx` is the UI: the landing input, the roadmap view and the modifications box.
- `app/api/mindmap/route.ts` takes `{ topic, provider, current?, instruction? }` and returns a roadmap that matches `lib/schema.ts`.
- `lib/providers/` holds one adapter per provider. Claude uses the Anthropic SDK with structured outputs. OpenAI, Grok and local models all speak the OpenAI chat-completions protocol, so they share one adapter that asks for a JSON schema response and degrades to looser formats for older local servers.
- `lib/prompt.ts` is the curriculum-designer prompt shared by all providers.

# StructuredLearning.ai

Type what you want to learn and get a structured roadmap: the stages you need to work through, what to learn at each one, and what to learn alongside it. Then type modifications ("more on transformers", "assume I know calculus") to reshape the map.

Click any block to open its lesson: a written explanation with a worked example, checked links to real resources, a YouTube video, a quiz, and a tutor chat that answers questions and rewrites the lesson on request ("make it simpler", "add an example about X").

## Run it

```bash
pnpm install
cp .env.example .env.local   # then fill in the keys you have
pnpm dev
```

Open http://localhost:3000.

## Database

Drizzle is configured for Supabase Postgres. Set `DATABASE_URL` in `.env.local`,
review the generated SQL in `drizzle/`, then run `pnpm db:migrate`.
See [the database guide](db/README.md) for the schema, connection options,
migration workflow, and remaining application integration work.

## Authentication

Better Auth uses the existing Drizzle tables with its anonymous plugin. Starting
a topic creates a guest session if one does not already exist; subsequent
requests reuse the session cookie. The `mindMap` tRPC procedure requires a
valid session.

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

Optional: set `YOUTUBE_API_KEY` (YouTube Data API v3) to pick lesson videos through the official API. Without it the app reads the first result off YouTube's public search page, and falls back to a search link if that fails.

Local points at Ollama (`http://localhost:11434/v1`) by default. Pull a model and keep Ollama running:

```bash
ollama pull qwen3:8b
```

LM Studio, vLLM and llama.cpp work too: set `LOCAL_BASE_URL` to their OpenAI-compatible endpoint and `LOCAL_MODEL` to the model name.

## How it works

- `app/page.tsx` is the UI: the landing input, the roadmap view with the modifications box, and the lesson view (`components/Lesson.tsx`) that opens when a block is clicked. Lessons are cached per block for the session.
- Every generation route streams newline-delimited JSON (`lib/stream.ts` on the server, `lib/ndjson.ts` on the client) so the page can render partial results: roadmap stages, lesson headings and section text, quiz questions and tutor replies all appear as they are written. `lib/partial-json.ts` repairs the half-finished JSON the model has produced so far.
- `app/api/mindmap/route.ts` takes `{ topic, provider, current?, instruction? }` and streams a roadmap that matches `lib/schema.ts`.
- `app/api/lesson/route.ts` writes a lesson in two phases: a short plan (title, section headings with one-line intents, takeaways), then every section body in parallel from that plan. Resource links and the video are looked up at the same time; links that don't resolve are dropped (`lib/links.ts`) and the video comes from the model's search query (`lib/youtube.ts`).
- `app/api/lesson/chat/route.ts` is the tutor: it streams a reply and, when asked to change the lesson, returns the full rewritten lesson. `app/api/quiz/route.ts` writes a 5-question multiple-choice quiz.
- `server/router.ts` is a typed tRPC API over the same providers; `app/api/trpc/[trpc]/route.ts` exposes it and `lib/trpc.ts` is the browser client. The UI uses it for the provider list. Its `mindMap`, `lesson`, `tutor` and `quiz` procedures return whole responses for callers that do not need streaming.
- `lib/providers/` holds one adapter per provider, each exposing one `structured()` call that returns JSON matching a Zod schema, streaming the raw text when a callback is given. Reasoning models run at minimal effort: on gpt-5 that cuts the wait for the first token from ~35s to ~2s with no visible drop in quality. Claude uses the Anthropic SDK with structured outputs. OpenAI, Grok and local models all speak the OpenAI chat-completions protocol, so they share one adapter that asks for a JSON schema response and degrades to looser formats for older local servers.
- `lib/prompt.ts` holds the prompts: curriculum designer, lesson writer, tutor and quiz writer.

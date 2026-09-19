# StructuredLearning.ai

Type what you want to learn and get a structured roadmap: the stages you need to work through, what to learn at each one, and what to learn alongside it. Then type modifications ("more on transformers", "assume I know calculus") to reshape the map.

Click any block to open its lesson: a written explanation with a worked example, checked links to real resources, a YouTube video, a quiz, and a tutor chat that answers questions and rewrites the lesson on request ("make it simpler", "add an example about X").

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in the keys you have
npm run dev
```

Open http://localhost:3000.

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
- `app/api/mindmap/route.ts` takes `{ topic, provider, current?, instruction? }` and returns a roadmap that matches `lib/schema.ts`.
- `app/api/lesson/route.ts` writes a lesson for one block, then drops resource links that don't resolve (`lib/links.ts`) and finds a video for the model's search query (`lib/youtube.ts`).
- `app/api/lesson/chat/route.ts` is the tutor: it returns a reply and, when asked to change the lesson, the full rewritten lesson. `app/api/quiz/route.ts` writes a 5-question multiple-choice quiz.
- `lib/providers/` holds one adapter per provider, each exposing one `structured()` call that returns JSON matching a Zod schema. Claude uses the Anthropic SDK with structured outputs. OpenAI, Grok and local models all speak the OpenAI chat-completions protocol, so they share one adapter that asks for a JSON schema response and degrades to looser formats for older local servers.
- `lib/prompt.ts` holds the prompts: curriculum designer, lesson writer, tutor and quiz writer.

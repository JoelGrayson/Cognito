# StructuredLearning.ai

Type what you want to learn and get a structured roadmap: the stages you need to work through, what to learn at each one, and what to learn alongside it. Then type modifications ("more on transformers", "assume I know calculus") to reshape the map.

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

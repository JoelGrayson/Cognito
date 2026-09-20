# Draw

A Notability-style page you write on by hand, with a **Check my work** button. Claude looks at
the page, writes feedback in the side panel, and marks up your work in red pen.

The page is three independent layers, top to bottom:

1. **Red pen** – the grader's marks (checks, crosses, circles, arrows, short notes).
2. **Your writing** – pen, highlighter and eraser strokes, with undo/redo.
3. **Document** – the question page (a built-in sample or an image you upload).

Each layer can be shown, hidden and cleared on its own from the Layers panel.

## Run it

```bash
pnpm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
pnpm dev                     # Vite on :5173, Hono API on :8787
```

`pnpm build && pnpm start` serves the built app and the API from one process.

## How it works

- `src/App.tsx` owns the three layers. `InkLayer` (SVG, pointer events) captures strokes;
  `MarkLayer` renders the grader's marks and animates them in; the document is an `<img>`.
- On **Check**, `renderPage` composites the document image and your strokes into a PNG and
  POSTs it to `/api/check` with the question text.
- `server/check.ts` (Hono + Anthropic SDK) asks Claude for a forced `grade` tool call whose
  schema (`shared/types.ts`) is validated with zod: a verdict, plain-text feedback, a list of
  issues, and red-pen marks on a 0–1000 grid that the client scales onto the page.

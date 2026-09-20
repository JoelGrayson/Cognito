import { config } from "dotenv";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { bodyLimit } from "hono/body-limit";
import { check } from "./check.ts";

config({ path: [".env.local", ".env"], quiet: true });

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true, configured: Boolean(process.env.OPENAI_API_KEY) }));

app.post("/api/check", bodyLimit({ maxSize: 8 * 1024 * 1024 }), async (c) => {
  const { image, question } = await c.req.json<{ image?: unknown; question?: unknown }>();
  if (typeof image !== "string" || !image.startsWith("data:image/png;base64,")) {
    return c.json({ error: "image must be a PNG data URL" }, 400);
  }
  return c.json(await check(image, typeof question === "string" ? question : undefined));
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "check failed" }, 500);
});

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Draw API listening on http://localhost:${port}`));

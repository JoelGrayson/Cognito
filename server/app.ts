import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { check } from "./check.ts";

const PNG_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPngDataUrl(s: string) {
  if (!s.startsWith(PNG_PREFIX)) return false;
  const b64 = s.slice(PNG_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return false;
  return Buffer.from(b64.slice(0, 16), "base64").subarray(0, 8).equals(PNG_MAGIC);
}

export const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true, configured: Boolean(process.env.OPENAI_API_KEY) }));

app.post("/api/check", bodyLimit({ maxSize: 8 * 1024 * 1024 }), async (c) => {
  const { image, question } = await c.req.json<{ image?: unknown; question?: unknown }>();
  if (typeof image !== "string" || !isPngDataUrl(image)) {
    return c.json({ error: "image must be a PNG data URL" }, 400);
  }
  return c.json(await check(image, typeof question === "string" ? question : undefined));
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "check failed" }, 500);
});

/**
 * A YouTube thumbnail, served from our own origin. Content blockers and Safari's
 * tracking prevention drop images from i.ytimg.com, which left the video-pick panel
 * with empty boxes. The id is checked against YouTube's 11-character form, so this
 * fetches thumbnails and nothing else.
 */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export async function GET(_request: Request, ctx: RouteContext<"/api/video-thumb/[id]">) {
  const { id } = await ctx.params;
  if (!VIDEO_ID.test(id)) return new Response("Not a video id.", { status: 400 });

  const upstream = await fetch(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response("No thumbnail.", { status: 404 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      // A thumbnail for a given id does not change in any way that matters here.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

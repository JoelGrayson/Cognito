/** Which sign-in methods are configured on this server — drives the create-account menu. */
export function GET() {
  return Response.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    chatgpt: true,
  });
}

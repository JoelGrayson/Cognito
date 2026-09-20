import "server-only";

const DEEPGRAM_API = "https://api.deepgram.com/v1";

export function deepgramConfigured(): boolean {
  return !!process.env.DEEPGRAM_API_KEY;
}

export async function grantDeepgramToken(): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch(`${DEEPGRAM_API}/auth/grant`, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Deepgram rejected the token grant (403): the API key needs Member permissions.");
    }
    throw new Error(`Deepgram token request failed (${response.status}).`);
  }
  return (await response.json()) as { access_token: string; expires_in: number };
}

export async function deepgramSpeak(text: string): Promise<Response> {
  return fetch(
    `${DEEPGRAM_API}/speak?model=${encodeURIComponent(process.env.DEEPGRAM_TTS_MODEL ?? "aura-2-thalia-en")}&encoding=mp3`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    },
  );
}

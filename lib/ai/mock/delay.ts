/** Artificial latency for mocks: MOCK_AI_DELAY_MS=1000 makes every mock call take a second. */
export async function mockDelay(): Promise<void> {
  const ms = Number(process.env.MOCK_AI_DELAY_MS);
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

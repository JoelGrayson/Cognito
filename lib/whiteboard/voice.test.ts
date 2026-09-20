/**
 * The speaker's failure behaviour. Two things are load-bearing here: a blocked
 * play() must REJECT, because swallowing it made a muted tutor look exactly like
 * a tutor with nothing to say, and an utterance that loses the race while it is
 * still downloading must never reach the speakers.
 *
 *   node --experimental-strip-types lib/whiteboard/voice.test.ts
 */
import { createSpeaker } from "./voice.ts";

class FakeAudio {
  static blocked = false;
  static made: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  src: string;
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  play(): Promise<void> {
    return FakeAudio.blocked ? Promise.reject(new Error("NotAllowedError")) : Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

const revoked: string[] = [];
let served: { ok: boolean; body?: unknown } = { ok: true };
let urls = 0;
/** Resolvers for in-flight fetches, so a test can choose which request lands first. */
let inFlight: (() => void)[] = [];
let holdFetches = false;

function reset(blocked: boolean, response: { ok: boolean; body?: unknown } = { ok: true }) {
  FakeAudio.blocked = blocked;
  FakeAudio.made = [];
  revoked.length = 0;
  served = response;
  urls = 0;
  inFlight = [];
  holdFetches = false;
}

Object.assign(globalThis, {
  Audio: FakeAudio,
  fetch: async () => {
    if (holdFetches) await new Promise<void>((resolve) => inFlight.push(resolve));
    return {
      ok: served.ok,
      blob: async () => ({}),
      json: async () => served.body,
    } as unknown as Response;
  },
});
URL.createObjectURL = () => `blob:${++urls}`;
URL.revokeObjectURL = (url: string) => void revoked.push(url);

let pass = 0, total = 0;
function check(label: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`);
}

async function rejection(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

{
  reset(true);
  const speaker = createSpeaker();
  check("blocked playback rejects rather than resolving quietly",
    await rejection(() => speaker.say("Check that step.")),
    "The browser blocked playback. Click the page once, then try again.");
  check("blocked playback leaves nothing marked as speaking", speaker.speaking, false);
  check("blocked playback frees the blob url", revoked, ["blob:1"]);
}

{
  reset(false);
  const speaker = createSpeaker();
  await speaker.say("Check that step.");
  check("playback that starts is reported as speaking", speaker.speaking, true);
  check("the url stays alive while it plays", revoked, []);

  FakeAudio.made[0].onended!();
  check("reaching the end stops speaking", speaker.speaking, false);
  check("reaching the end frees the blob url", revoked, ["blob:1"]);
}

{
  reset(false);
  const speaker = createSpeaker();
  await speaker.say("first");
  await speaker.say("second");
  check("a second utterance frees the first one's url", revoked, ["blob:1"]);
  check("the first utterance was paused, never left overlapping", FakeAudio.made[0].paused, true);
}

{
  // Two say() calls in flight at once, the newer one answered first. The older
  // request must be discarded on arrival, not started on top of what is playing.
  reset(false);
  holdFetches = true;
  const speaker = createSpeaker();
  const first = speaker.say("first");
  const second = speaker.say("second");
  inFlight[1]();
  await second;
  inFlight[0]();
  await first;
  check("a superseded utterance never reaches the speakers", FakeAudio.made.length, 1);
  check("a superseded utterance frees the url it had already made", revoked, ["blob:2"]);
  check("the utterance that won is still the one playing", speaker.speaking, true);
}

{
  reset(false, { ok: false, body: { error: "ElevenLabs 401: Invalid API key" } });
  const speaker = createSpeaker();
  check("a failing route surfaces its own reason",
    await rejection(() => speaker.say("Check that step.")),
    "ElevenLabs 401: Invalid API key");
  check("a failing route leaves nothing speaking", speaker.speaking, false);
}

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);

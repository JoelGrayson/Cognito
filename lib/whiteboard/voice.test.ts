/**
 * The speaker's failure behaviour. The load-bearing test is that a blocked play()
 * REJECTS: swallowing it made a tutor the browser had muted look exactly like a
 * tutor with nothing to say, and the page had no way to tell the learner why.
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

function reset(blocked: boolean, response: { ok: boolean; body?: unknown } = { ok: true }) {
  FakeAudio.blocked = blocked;
  FakeAudio.made = [];
  revoked.length = 0;
  served = response;
}

Object.assign(globalThis, {
  Audio: FakeAudio,
  fetch: async () =>
    ({
      ok: served.ok,
      blob: async () => ({}),
      json: async () => served.body,
    }) as unknown as Response,
});
URL.createObjectURL = () => "blob:utterance";
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
  const message = await rejection(() => speaker.say("Check that step."));
  check("blocked playback rejects rather than resolving quietly",
    message, "The browser blocked playback. Click the page once, then try again.");
  check("blocked playback leaves nothing marked as speaking", speaker.speaking, false);
  check("blocked playback frees the blob url", revoked, ["blob:utterance"]);
}

{
  reset(false);
  const speaker = createSpeaker();
  await speaker.say("Check that step.");
  check("playback that starts is reported as speaking", speaker.speaking, true);
  check("the url stays alive while it plays", revoked, []);

  FakeAudio.made[0].onended!();
  check("reaching the end stops speaking", speaker.speaking, false);
  check("reaching the end frees the blob url", revoked, ["blob:utterance"]);
}

{
  reset(false);
  const speaker = createSpeaker();
  await speaker.say("first");
  await speaker.say("second");
  check("a second utterance frees the first one's url", revoked, ["blob:utterance"]);
  check("the first utterance was paused, never left overlapping", FakeAudio.made[0].paused, true);
}

{
  reset(false, { ok: false, body: { error: "ElevenLabs 401: Invalid API key" } });
  const speaker = createSpeaker();
  check("a failing route surfaces its own reason",
    await rejection(() => createSpeaker().say("Check that step.")),
    "ElevenLabs 401: Invalid API key");
  check("a failing route leaves nothing speaking", speaker.speaking, false);
}

console.log(`\n${pass}/${total} correct`);
if (pass !== total) process.exit(1);

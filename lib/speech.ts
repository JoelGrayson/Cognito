/**
 * The tutor's voice.
 *
 * Prefers ElevenLabs (Matilda) through /api/voice/speak, which is the same voice the
 * whiteboard uses - one tutor should not change voice depending on which screen you
 * are on. Falls back to the browser's own synthesiser when no key is configured, so
 * nothing breaks without one.
 */

let elevenLabsWorks: boolean | null = null;
let current: HTMLAudioElement | null = null;

/** Speak through ElevenLabs. Resolves false if it is unavailable, so the caller falls back. */
async function speakRemote(text: string): Promise<boolean> {
  if (elevenLabsWorks === false) return false;
  try {
    const res = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      // A missing key is permanent; don't retry it on every single turn.
      if (res.status === 400) elevenLabsWorks = false;
      return false;
    }
    elevenLabsWorks = true;
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    current = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
    if (current === audio) current = null;
    return true;
  } catch {
    return false;
  }
}

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking(): void {
  if (current) {
    current.pause();
    current = null;
  }
  if (speechAvailable()) window.speechSynthesis.cancel();
}

/**
 * Speak `text`, resolving when it finishes. With `voice` off (or no speech support)
 * it resolves after roughly the time speaking would have taken, so visuals keep their pace.
 */
export async function speak(text: string, voice: boolean): Promise<void> {
  const paced = Math.min(12000, 900 + text.split(/\s+/).length * 330);
  if (!voice) return new Promise((r) => setTimeout(r, paced));

  stopSpeaking();
  if (await speakRemote(text)) return;

  return new Promise((resolve) => {
    if (!speechAvailable()) {
      setTimeout(resolve, paced);
      return;
    }
    const synth = window.speechSynthesis;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const preferred =
      voices.find((v) => /Google US English|Samantha|Ava|Allison/i.test(v.name) && v.lang.startsWith("en")) ??
      voices.find((v) => v.lang.startsWith(navigator.language.slice(0, 2)));
    if (preferred) utterance.voice = preferred;
    utterance.rate = 1.06;
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
    // Some browsers occasionally never fire onend.
    setTimeout(finish, 3000 + text.length * 90);
  });
}

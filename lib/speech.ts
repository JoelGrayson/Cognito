/** The browser's own voice. No key needed; swap for a speech API when one is configured. */

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}

/**
 * Speak `text`, resolving when it finishes. With `voice` off (or no speech support)
 * it resolves after roughly the time speaking would have taken, so visuals keep their pace.
 */
export function speak(text: string, voice: boolean): Promise<void> {
  return new Promise((resolve) => {
    const paced = Math.min(12000, 900 + text.split(/\s+/).length * 330);
    if (!voice || !speechAvailable()) {
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

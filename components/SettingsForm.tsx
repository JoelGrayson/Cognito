"use client";

import { useSyncExternalStore } from "react";
import { LearningPrefs } from "@/components/LearningPrefs";
import { readSettings, serverSettings, subscribeSettings, writeSettings } from "@/lib/settings";

export function SettingsForm() {
  const settings = useSyncExternalStore(subscribeSettings, readSettings, serverSettings);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-8">
      <h1 className="mt-6 text-3xl font-medium tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-neutral-500">Saved in this browser.</p>

      <div className="settings-row mt-8">
        <div className="min-w-0">
          <p id="auto-lessons" className="font-medium text-neutral-900">
            Write every lesson in the background
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-neutral-600">
            <li>On: when a roadmap finishes, all its lessons are written, 3 at a time, so they open instantly.</li>
            <li>Also covers new blocks after you revise a roadmap. Stop it any time from under the map.</li>
            <li>Cost: about 7 model calls per lesson, so roughly 140 for a 20-block roadmap.</li>
            <li>Off: a lesson is written when you open it.</li>
          </ul>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.autoGenerateLessons}
          aria-labelledby="auto-lessons"
          className="switch"
          onClick={() => writeSettings({ autoGenerateLessons: !settings.autoGenerateLessons })}
        >
          <span className="switch-knob" />
        </button>
      </div>

      <LearningPrefs />
    </main>
  );
}

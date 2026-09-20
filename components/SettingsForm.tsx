"use client";

import { useSyncExternalStore } from "react";
import { LearningPrefs } from "@/components/LearningPrefs";
import { PastRoadmaps } from "@/components/onboarding/PastRoadmaps";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { readSettings, serverSettings, subscribeSettings, writeSettings } from "@/lib/settings";

export function SettingsForm() {
  const settings = useSyncExternalStore(subscribeSettings, readSettings, serverSettings);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Saved in this browser.</p>

      <Card className="mt-8">
        <CardContent className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <Label htmlFor="auto-lessons" className="text-[15px]">
              Write every lesson in the background
            </Label>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
              <li>On: when a roadmap finishes, all its lessons are written, 3 at a time, so they open instantly.</li>
              <li>Also covers new blocks after you revise a roadmap. Stop it any time from under the map.</li>
              <li>Cost: about 7 model calls per lesson, so roughly 140 for a 20-block roadmap.</li>
              <li>Off: a lesson is written when you open it.</li>
            </ul>
          </div>
          <Switch
            id="auto-lessons"
            checked={settings.autoGenerateLessons}
            onCheckedChange={(checked) => writeSettings({ autoGenerateLessons: checked })}
            className="mt-0.5"
          />
        </CardContent>
      </Card>

      <LearningPrefs />

      <PastRoadmaps heading="My learning plans" emptyText="No plans yet — start one from New learning plan." />
    </main>
  );
}

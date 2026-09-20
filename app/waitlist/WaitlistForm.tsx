"use client";

import { useState } from "react";
import { Mascot } from "@/components/Mascot";
import { STUDYING, type Studying } from "@/lib/waitlist";

type Status = "idle" | "sending" | "done";

export function WaitlistForm({ source }: { source: string | null }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [studying, setStudying] = useState<Studying | null>(null);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, studying: studying ?? undefined, source: source ?? undefined, website }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus("idle");
        return setError(data?.error?.includes("email") ? "That doesn't look like an email address." : "Something went wrong. Try again in a moment.");
      }
      setStatus("done");
    } catch {
      setStatus("idle");
      setError("Couldn't reach us. Check your connection and try again.");
    }
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
        <span className="waitlist-hop">
          <Mascot size={96} listening />
        </span>
        <h2 className="wb-serif text-2xl font-medium">You&apos;re on the list{name ? `, ${name.split(" ")[0]}` : ""}!</h2>
        <p className="max-w-xs text-(--wb-muted)">We&apos;ll email you the moment there&apos;s a seat at the whiteboard.</p>
      </div>
    );
  }

  const field =
    "min-h-12 w-full rounded-xl border border-(--wb-line) bg-(--wb-paper,#fffdf8) px-4 text-base outline-none placeholder:text-(--wb-muted)/70 focus-visible:border-(--wb-primary) focus-visible:ring-2 focus-visible:ring-(--wb-primary)/20";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@school.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>
          First name <span className="font-normal text-(--wb-muted)">(optional)</span>
        </span>
        <input type="text" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          What are you studying? <span className="font-normal text-(--wb-muted)">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {STUDYING.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={studying === option}
              onClick={() => setStudying((current) => (current === option ? null : option))}
              className={`min-h-10 rounded-full border px-4 text-sm transition-colors ${
                studying === option
                  ? "border-(--wb-primary) bg-(--wb-primary) text-(--wb-card)"
                  : "border-(--wb-line) hover:bg-(--wb-hover)"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Honeypot: off-screen rather than display:none, which some bots skip. */}
      <label className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        Website
        <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-(--wb-bad) px-4 py-2.5 text-sm text-(--wb-bad-ink)">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending" || !email}
        className="mt-1 inline-flex min-h-13 items-center justify-center rounded-2xl bg-(--wb-primary) px-7 text-lg text-(--wb-card) shadow-[0_6px_24px_rgb(59_42_31/0.18)] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
      >
        {status === "sending" ? "Saving your spot…" : "Join the waitlist"}
      </button>
      <p className="text-center text-xs text-(--wb-muted)">One email when it&apos;s ready. Nothing else.</p>
    </form>
  );
}

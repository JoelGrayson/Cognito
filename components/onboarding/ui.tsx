"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

export const focusRing =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--wb-primary)]";
const ownFocusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--wb-primary)]";

export const inputClass = `min-h-13 w-full rounded-2xl border border-(--wb-line) bg-(--wb-card) px-5 py-3 text-base text-(--wb-ink) outline-none transition-colors placeholder:text-(--wb-muted)/70 focus:border-(--wb-primary) ${ownFocusRing}`;

interface StepShellProps {
  title: string;
  hint?: string;
  /** Returns the blocking message, or null. Shown only after the first submit attempt. */
  validate?: () => string | null;
  onSubmit: () => void | Promise<void>;
  onBack?: () => void;
  submitLabel?: string;
  busy?: boolean;
  /** A message that is not a validation error, e.g. a failed save. */
  notice?: string | null;
  /** Secondary action beside Continue, e.g. Skip. */
  extra?: ReactNode;
  /** Steps that autofocus an input pass false so the heading does not steal focus. */
  focusHeading?: boolean;
  children: ReactNode;
}

/** One question per screen: heading, controls, error line, Back and Continue. Enter continues. */
export function StepShell({
  title,
  hint,
  validate,
  onSubmit,
  onBack,
  submitLabel = "Continue",
  busy = false,
  notice,
  extra,
  focusHeading = true,
  children,
}: StepShellProps) {
  const [attempted, setAttempted] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const error = attempted ? (validate?.() ?? null) : null;

  useEffect(() => {
    if (focusHeading) heading.current?.focus({ preventScroll: true });
  }, [focusHeading]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (validate?.()) return;
    void onSubmit();
  }

  // Enter continues from any field or chip. Buttons keep their own Enter behavior.
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.tagName === "TEXTAREA") return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  }

  return (
    <form noValidate onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-1 flex-col">
      <h1 ref={heading} tabIndex={-1} className="wb-serif text-[1.75rem] leading-tight font-medium tracking-tight outline-none sm:text-4xl">
        {title}
      </h1>
      {hint && <p className="mt-2 text-[15px] leading-relaxed text-(--wb-muted)">{hint}</p>}
      <div className="mt-7 flex-1">{children}</div>
      <div aria-live="polite" className="mt-4 min-h-6">
        {(error || notice) && (
          <p role="alert" className="text-sm font-medium text-(--wb-bad-ink)">
            {error ?? notice}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 pb-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={`min-h-12 rounded-2xl px-5 text-[15px] text-(--wb-muted) hover:bg-(--wb-hover) hover:text-(--wb-ink) ${ownFocusRing}`}
          >
            Back
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {extra}
          <button
            type="submit"
            disabled={busy}
            className={`min-h-12 min-w-32 rounded-2xl bg-(--wb-primary) px-7 text-[15px] text-(--wb-card) shadow-[0_6px_24px_rgb(59_42_31/0.18)] transition-opacity hover:opacity-90 disabled:opacity-60 ${ownFocusRing}`}
          >
            {busy ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

interface ChoiceProps {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  description?: string;
  /** "card" is a left-aligned block with a description; "chip" is a compact pill. */
  variant?: "chip" | "card";
  className?: string;
}

/** A native radio or checkbox drawn as a chip, so keyboard and screen reader behavior come for free. */
export function Choice({ type, name, value, checked, onChange, children, description, variant = "chip", className = "" }: ChoiceProps) {
  const base =
    "flex min-h-12 select-none border transition-colors peer-checked:border-[var(--wb-primary)] peer-checked:bg-[var(--wb-primary)] peer-checked:text-(--wb-card)";
  const tone = "border-(--wb-line) bg-(--wb-card) text-(--wb-ink) hover:border-(--wb-muted)";
  return (
    <label className={`relative block cursor-pointer ${className}`}>
      <input type={type} name={name} value={value} checked={checked} onChange={onChange} className="peer sr-only" />
      {variant === "chip" ? (
        <span className={`${base} ${tone} ${focusRing} items-center justify-center rounded-xl px-4 py-2 text-center text-[15px]`}>
          {children}
        </span>
      ) : (
        <span className={`${base} ${tone} ${focusRing} flex-col justify-center rounded-2xl px-4 py-3 text-left`}>
          <span className="text-[15px] font-medium">{children}</span>
          {description && <span className="text-[13px] opacity-80">{description}</span>}
        </span>
      )}
    </label>
  );
}

/** A labelled group of choices (radio or checkbox). */
export function ChoiceGroup({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={className}>
      {children}
    </div>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-(--wb-muted)">
      {children}
    </label>
  );
}

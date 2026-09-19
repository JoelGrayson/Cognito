"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

export const focusRing =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--accent)]";
const ownFocusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";

export const inputClass = `pill min-h-12 px-5 py-3 text-base ${ownFocusRing}`;

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
      <h1 ref={heading} tabIndex={-1} className="text-[1.75rem] leading-tight font-semibold tracking-tight outline-none sm:text-4xl">
        {title}
      </h1>
      {hint && <p className="mt-2 text-[15px] leading-relaxed text-[#6b6b6b]">{hint}</p>}
      <div className="mt-7 flex-1">{children}</div>
      <div aria-live="polite" className="mt-4 min-h-6">
        {(error || notice) && (
          <p role="alert" className="text-sm font-medium text-[#c0392b]">
            {error ?? notice}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 pb-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={`min-h-12 rounded-full px-5 text-[15px] font-medium text-[#555] hover:bg-[#f0f0ee] ${ownFocusRing}`}
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
            className={`min-h-12 min-w-32 rounded-full bg-[var(--accent)] px-7 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 ${ownFocusRing}`}
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
    "flex min-h-12 select-none border transition-colors peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent)] peer-checked:text-white";
  const tone = "border-[#d5d5d1] bg-white text-[#222] hover:border-[#b9b9b4]";
  return (
    <label className={`relative block cursor-pointer ${className}`}>
      <input type={type} name={name} value={value} checked={checked} onChange={onChange} className="peer sr-only" />
      {variant === "chip" ? (
        <span className={`${base} ${tone} ${focusRing} items-center justify-center rounded-full px-4 py-2 text-center text-[15px] font-medium`}>
          {children}
        </span>
      ) : (
        <span className={`${base} ${tone} ${focusRing} flex-col justify-center rounded-2xl px-4 py-3 text-left`}>
          <span className="text-[15px] font-semibold">{children}</span>
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
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-[#444]">
      {children}
    </label>
  );
}

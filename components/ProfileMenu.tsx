"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ChatGPTConnect } from "./ChatGPTConnect";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong";

/** Profile icon + account menu. Anonymous visitors get the create-account prompt (ChatGPT sign-in). */
interface SessionUser {
  name?: string;
  email?: string;
  isAnonymous?: boolean;
}

export function ProfileMenu({ active = false }: { active?: boolean }) {
  const { data, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [showAuthOptions, setShowAuthOptions] = useState(false);
  const [authOptions, setAuthOptions] = useState<{ google: boolean; chatgpt: boolean } | null>(null);
  const router = useRouter();

  const showOptions = () => {
    setShowAuthOptions(true);
    if (!authOptions) {
      fetch("/api/auth-options")
        .then(async (res) => (res.ok ? setAuthOptions(await res.json()) : undefined))
        .catch(() => {});
    }
  };
  // The plugin-augmented session type doesn't infer through useSession; read the fields we need.
  const user = (data as { user?: SessionUser } | null)?.user;
  const anonymous = !user || user.isAnonymous === true;
  const close = () => {
    setOpen(false);
    setShowAuthOptions(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={`inline-flex size-10 items-center justify-center rounded-full ${focus} ${
          open || active ? "bg-(--wb-primary) text-(--wb-card)" : "text-(--wb-muted) hover:bg-(--wb-hover) hover:text-(--wb-ink)"
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20.5c1.6-3.2 4.3-4.8 7.5-4.8s5.9 1.6 7.5 4.8" />
        </svg>
      </button>

      {open && (
        <>
          {/* Transparent backdrop closes the menu on outside click. */}
          <button type="button" aria-label="Close account menu" tabIndex={-1} onClick={close} className="fixed inset-0 z-40 cursor-default" />
          <div className="absolute right-0 top-full z-50 mt-2 wb w-72 rounded-2xl border border-(--wb-line) !bg-(--wb-card) p-4 shadow-[0_12px_40px_rgb(59_42_31/0.16)]">
            {isPending ? (
              <p className="text-sm text-(--wb-muted)">Loading…</p>
            ) : anonymous ? (
              showAuthOptions ? (
                <>
                  <p className="wb-serif text-lg text-(--wb-ink)">Create an account</p>
                  <p className="mt-1 text-sm text-(--wb-muted)">Choose how to sign in:</p>
                  <div className="mt-3 flex flex-col items-stretch gap-2">
                    {authOptions?.google && (
                      <button
                        type="button"
                        onClick={() =>
                          void authClient.signIn.social({
                            provider: "google",
                            callbackURL: window.location.pathname + window.location.search,
                          })
                        }
                        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-(--wb-line) bg-(--wb-card) px-4 text-sm font-medium text-(--wb-ink) hover:bg-(--wb-hover) ${focus}`}
                      >
                        <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4">
                          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
                          <path fill="#FBBC05" d="M3.97 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.33z" />
                          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3.01 2.33A5.36 5.36 0 0 1 9 3.58z" />
                        </svg>
                        Continue with Google
                      </button>
                    )}
                    {authOptions?.chatgpt !== false && <ChatGPTConnect onConnected={close} />}
                  </div>
                </>
              ) : (
                <>
                  <p className="wb-serif text-lg text-(--wb-ink)">No account yet</p>
                  <p className="mt-1 text-sm leading-relaxed text-(--wb-muted)">
                    Your roadmaps are tied to this browser. Sign in to keep them on any device.
                  </p>
                  <button
                    type="button"
                    onClick={showOptions}
                    className={`mt-3 min-h-10 w-full rounded-xl bg-(--wb-primary) px-4 text-sm text-(--wb-card) ${focus}`}
                  >
                    Create an account
                  </button>
                </>
              )
            ) : (
              <>
                <p className="truncate text-[15px] font-medium text-(--wb-ink)">{user.name || "Account"}</p>
                <p className="truncate text-sm text-(--wb-muted)">{user.email}</p>
                <div className="mt-3">
                  <ChatGPTConnect />
                </div>
                <button
                  type="button"
                  onClick={() => void authClient.signOut().then(() => { close(); router.push("/"); router.refresh(); })}
                  className={`mt-3 text-sm text-(--wb-muted) underline underline-offset-2 hover:text-(--wb-ink) ${focus}`}
                >
                  Sign out
                </button>
              </>
            )}
            <div className="mt-4 border-t border-(--wb-line) pt-3">
              <Link
                href="/settings"
                onClick={close}
                className={`inline-flex min-h-9 items-center text-sm font-medium text-(--wb-ink) underline underline-offset-4 ${focus}`}
              >
                Settings
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Settings, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ChatGPTConnect } from "./ChatGPTConnect";

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
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Account"
          className={cn("size-9 rounded-full text-muted-foreground sm:size-11", (open || active) && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground")}
        >
          <UserRound className="size-5 sm:size-6" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 gap-0 p-4"
        // The ChatGPT sign-in dialog is portaled outside the popover; keep the menu open while it is used.
        onInteractOutside={(event) => {
          if (event.target instanceof Element && event.target.closest("[role='dialog']")) event.preventDefault();
        }}
      >
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : anonymous ? (
          showAuthOptions ? (
            <>
              <p className="text-[15px] font-semibold">Create an account</p>
              <p className="mt-1 text-sm text-muted-foreground">Choose how to sign in:</p>
              <div className="mt-3 flex flex-col items-stretch gap-2">
                {authOptions?.google && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      void authClient.signIn.social({
                        provider: "google",
                        callbackURL: window.location.pathname + window.location.search,
                      })
                    }
                  >
                    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4">
                      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
                      <path fill="#FBBC05" d="M3.97 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.33z" />
                      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3.01 2.33A5.36 5.36 0 0 1 9 3.58z" />
                    </svg>
                    Continue with Google
                  </Button>
                )}
                {authOptions?.chatgpt !== false && <ChatGPTConnect onConnected={close} />}
              </div>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold">No account yet</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Your roadmaps are tied to this browser. Sign in to keep them on any device.
              </p>
              <Button type="button" className="mt-3 w-full" onClick={showOptions}>
                Create an account
              </Button>
            </>
          )
        ) : (
          <>
            <p className="truncate text-[15px] font-semibold">{user.name || "Account"}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-3">
              <ChatGPTConnect />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 -ml-2 text-muted-foreground"
              onClick={() =>
                void authClient.signOut().then(() => {
                  close();
                  router.push("/");
                  router.refresh();
                })
              }
            >
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </>
        )}
        <Separator className="my-3" />
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-primary">
          <Link href="/settings" onClick={close}>
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}

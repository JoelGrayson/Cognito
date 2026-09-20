"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertAction, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ChatGPTUser {
  accountId: string;
  email?: string;
  name?: string;
  plan?: string;
}

interface Props {
  onConnected?: () => void;
  onDisconnected?: () => void;
}

type Status = { linked: boolean; user?: ChatGPTUser };

export function ChatGPTConnect({ onConnected, onDisconnected }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"consent" | "authorize">("consent");
  const [device, setDevice] = useState<{
    handle: string;
    userCode: string;
    verificationUrl: string;
    interval: number;
    expiresAt: number;
  }>();
  const [phase, setPhase] = useState<"idle" | "starting" | "polling" | "expired" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const result = await authClient.$fetch<Status>("/chatgpt/status");
      if (result.error) throw new Error(result.error.message ?? "ChatGPT request failed.");
      setStatus(result.data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    return () => {
      generation.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  const close = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
    setStep("consent");
    setPhase("idle");
    setDevice(undefined);
    setError(null);
    setRetrying(false);
  }, []);

  const poll = useCallback((current: { handle: string; interval: number; expiresAt: number }, generationId: number) => {
    let attempt = 0;
    const schedule = (seconds: number) => {
      if (generationId !== generation.current) return;
      if (Date.now() >= current.expiresAt) {
        setError(null);
        setRetrying(false);
        setPhase("expired");
        return;
      }
      timer.current = setTimeout(run, seconds * 1000);
    };
    const run = async () => {
      const gen = generation.current;
      if (gen !== generationId) return;
      try {
        const response = await authClient.$fetch<{ status: "pending" | "authenticated" | "expired" }>(
          "/sign-in/chatgpt/poll",
          { method: "POST", body: { handle: current.handle } },
        );
        if (gen !== generation.current) return;
        if (response.error) {
          const status = response.error.status;
          if (status >= 400 && status < 500 && status !== 429) {
            setError(response.error.message ?? "ChatGPT request failed.");
            setRetrying(false);
            setPhase("error");
            return;
          }
          throw new Error(response.error.message ?? "ChatGPT request failed.");
        }
        const result = response.data;
        if (result.status === "authenticated") {
          await refresh();
          if (gen !== generation.current) return;
          attempt = 0;
          close();
          onConnected?.();
          return;
        }
        if (result.status === "expired") {
          setError(null);
          setRetrying(false);
          setPhase("expired");
          return;
        }
        attempt = 0;
        setError(null);
        setRetrying(false);
        schedule(Math.max(current.interval, 3));
      } catch (err) {
        if (gen !== generation.current) return;
        if (Date.now() >= current.expiresAt) {
          setError(null);
          setRetrying(false);
          setPhase("expired");
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to check ChatGPT sign-in.");
        setRetrying(true);
        const delay = Math.min(current.interval * 2 ** attempt, 30);
        attempt += 1;
        schedule(delay);
      }
    };
    schedule(Math.max(current.interval, 3));
  }, [close, onConnected, refresh]);

  async function start() {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const generationId = generation.current;
    setStep("authorize");
    setPhase("starting");
    setError(null);
    setRetrying(false);
    try {
      const response = await authClient.$fetch<{
        handle: string;
        userCode: string;
        verificationUrl: string;
        interval: number;
        expiresAt: number;
      }>("/sign-in/chatgpt/start", { method: "POST", body: {} });
      if (generationId !== generation.current) return;
      if (response.error) throw new Error(response.error.message ?? "ChatGPT request failed.");
      const result = response.data;
      setDevice(result);
      setPhase("polling");
      poll(result, generationId);
    } catch (err) {
      if (generationId !== generation.current) return;
      setError(err instanceof Error ? err.message : "Unable to start ChatGPT sign-in.");
      setRetrying(false);
      setPhase("idle");
    }
  }

  async function disconnect() {
    try {
      setRetrying(false);
      const result = await authClient.$fetch("/chatgpt/unlink", { method: "POST", body: {} });
      if (result.error) throw new Error(result.error.message ?? "ChatGPT request failed.");
      await refresh();
      onDisconnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to disconnect ChatGPT.");
    }
  }

  if (status?.linked && status.user) {
    const identity = status.user.email ?? status.user.name ?? "account";
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
        <span className="truncate text-muted-foreground">
          ChatGPT · {identity}{status.user.plan ? ` · ${status.user.plan}` : ""}
        </span>
        <Button type="button" variant="link" size="xs" className="shrink-0 px-0 text-muted-foreground" onClick={() => void disconnect()}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
          setError(null);
        } else {
          close();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full">
          Sign in with ChatGPT
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "consent" ? (
          <>
            <DialogHeader>
              <DialogTitle>Sign in with ChatGPT</DialogTitle>
              <DialogDescription className="leading-6">
                You&apos;ll sign in with your own ChatGPT account. Lessons you generate with the ChatGPT model use your ChatGPT plan, not ours. We store an encrypted token so you don&apos;t have to sign in every time; disconnect any time.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="button" onClick={() => void start()}>Continue</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Finish signing in with ChatGPT</DialogTitle>
              <DialogDescription>
                {phase === "starting" ? "Preparing your sign-in code…" : "Enter this code in ChatGPT to link your account."}
              </DialogDescription>
            </DialogHeader>
            {device && phase !== "expired" && phase !== "error" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted px-4 py-3">
                  <strong className="font-mono text-2xl tracking-widest">{device.userCode}</strong>
                  <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(device.userCode)}>
                    Copy
                  </Button>
                </div>
                <Button asChild variant="secondary" className="w-full">
                  <a href={device.verificationUrl} target="_blank" rel="noopener">Open ChatGPT</a>
                </Button>
                {phase === "polling" && <p className="text-sm text-muted-foreground">Waiting for authorization…</p>}
              </div>
            )}
            {(phase === "expired" || phase === "error") && (
              <Alert variant="destructive">
                <AlertTitle>{phase === "expired" ? "Code expired" : error}</AlertTitle>
                <AlertAction>
                  <Button type="button" variant="outline" size="sm" onClick={() => void start()}>Try again</Button>
                </AlertAction>
              </Alert>
            )}
            {error && phase !== "error" && (
              <p className={retrying ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{error}{retrying ? " Retrying…" : ""}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

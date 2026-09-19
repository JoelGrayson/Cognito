"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

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
  const [device, setDevice] = useState<{ handle: string; userCode: string; verificationUrl: string; interval: number }>();
  const [phase, setPhase] = useState<"idle" | "starting" | "polling" | "expired">("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
    setStep("consent");
    setPhase("idle");
    setDevice(undefined);
    setError(null);
  }, []);

  const poll = useCallback((current: { handle: string; interval: number }) => {
    const run = async () => {
      try {
        const response = await authClient.$fetch<{ status: "pending" | "authenticated" | "expired" }>(
          "/sign-in/chatgpt/poll",
          { method: "POST", body: { handle: current.handle } },
        );
        if (response.error) throw new Error(response.error.message ?? "ChatGPT request failed.");
        const result = response.data;
        if (result.status === "authenticated") {
          await refresh();
          close();
          onConnected?.();
          return;
        }
        if (result.status === "expired") {
          setPhase("expired");
          return;
        }
        timer.current = setTimeout(run, Math.max(current.interval, 3) * 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to check ChatGPT sign-in.");
        setPhase("idle");
      }
    };
    timer.current = setTimeout(run, Math.max(current.interval, 3) * 1000);
  }, [close, onConnected, refresh]);

  async function start() {
    setStep("authorize");
    setPhase("starting");
    setError(null);
    try {
      const response = await authClient.$fetch<{
        handle: string;
        userCode: string;
        verificationUrl: string;
        interval: number;
      }>("/sign-in/chatgpt/start", { method: "POST", body: {} });
      if (response.error) throw new Error(response.error.message ?? "ChatGPT request failed.");
      const result = response.data;
      setDevice(result);
      setPhase("polling");
      poll(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start ChatGPT sign-in.");
      setPhase("idle");
    }
  }

  async function disconnect() {
    try {
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
      <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700">
        <span>ChatGPT · {identity}{status.user.plan ? ` · ${status.user.plan}` : ""}</span>
        <button type="button" className="text-neutral-500 underline underline-offset-2 hover:text-neutral-900" onClick={() => void disconnect()}>
          Disconnect
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="rounded-full bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
        onClick={() => { setOpen(true); setError(null); }}
      >
        Sign in with ChatGPT
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            {step === "consent" ? (
              <>
                <h2 className="text-lg font-medium">Sign in with ChatGPT</h2>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  You&apos;ll sign in with your own ChatGPT account. Lessons you generate with the ChatGPT model use your ChatGPT plan, not ours. We store an encrypted token so you don&apos;t have to sign in every time; disconnect any time.
                </p>
                <div className="mt-6 flex justify-end gap-3 text-sm">
                  <button type="button" className="rounded-full px-3 py-1.5 text-neutral-600 hover:bg-neutral-100" onClick={close}>Cancel</button>
                  <button type="button" className="rounded-full bg-neutral-900 px-4 py-1.5 text-white hover:bg-neutral-700" onClick={() => void start()}>Continue</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-medium">Finish signing in with ChatGPT</h2>
                {phase === "starting" && <p className="mt-4 text-sm text-neutral-600">Preparing your sign-in code…</p>}
                {device && phase !== "expired" && (
                  <>
                    <p className="mt-4 text-sm text-neutral-600">Enter this code in ChatGPT:</p>
                    <div className="mt-2 flex items-center justify-between rounded-xl bg-neutral-100 px-4 py-3">
                      <strong className="font-mono text-2xl tracking-widest">{device.userCode}</strong>
                      <button type="button" className="text-sm underline underline-offset-2" onClick={() => void navigator.clipboard?.writeText(device.userCode)}>Copy</button>
                    </div>
                    <a className="mt-4 inline-block text-sm text-neutral-700 underline underline-offset-2" href={device.verificationUrl} target="_blank" rel="noopener">Open ChatGPT</a>
                    {phase === "polling" && <p className="mt-4 text-sm text-neutral-500">Waiting for authorization…</p>}
                  </>
                )}
                {phase === "expired" && (
                  <div className="mt-4">
                    <p className="text-sm text-red-600">Code expired</p>
                    <button type="button" className="mt-3 text-sm underline underline-offset-2" onClick={() => void start()}>Try again</button>
                  </div>
                )}
                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
                <div className="mt-6 flex justify-end">
                  <button type="button" className="rounded-full px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100" onClick={close}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

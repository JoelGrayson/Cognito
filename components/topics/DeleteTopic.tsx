"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

/** Removes a roadmap and its lessons from the topics list. */
export function DeleteTopic({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  return (
    <button
      type="button"
      className="history-remove"
      disabled={removing}
      aria-label={`Remove ${title}`}
      title="Remove"
      onClick={() => {
        if (!window.confirm(`Remove "${title}" and its lessons?`)) return;
        setRemoving(true);
        trpc.topics.delete
          .mutate({ id })
          .then(() => router.refresh())
          .catch(() => {})
          .finally(() => setRemoving(false));
      }}
    >
      ×
    </button>
  );
}

/**
 * The graphing panel: a real Desmos calculator docked beside the page.
 *
 * It is shared. The learner can type in it, and the tutor plots into it through
 * its client tool - which is why the tutor's curves are namespaced (see
 * PLOT_ID_PREFIX): re-plotting replaces the tutor's own and never touches
 * anything the learner put there.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Icon } from "./ui";
import type { Plot } from "@/lib/whiteboard/graph";

/** Only the handful of the Desmos API this page uses. */
interface DesmosCalculator {
  setExpression(state: { id: string; latex: string; color?: string }): void;
  removeExpression(state: { id: string }): void;
  resize(): void;
  destroy(): void;
}

interface DesmosApi {
  GraphingCalculator(element: HTMLElement, options?: Record<string, boolean | string>): DesmosCalculator;
}

declare global {
  interface Window {
    Desmos?: DesmosApi;
  }
}

/** Desmos publishes this key for development; production wants your own. */
const DEMO_API_KEY = "dcb31709b452b1cf9dc26972add0fda6";
const SCRIPT_SRC = `https://www.desmos.com/api/v1.11/calculator.js?apiKey=${
  process.env.NEXT_PUBLIC_DESMOS_API_KEY || DEMO_API_KEY
}`;

/** The tutor's red is the marking pen; its curves match it. */
const TUTOR_COLOR = "#c74440";

/** Wider than the other panels: a graph squeezed into 20rem is not one. */
const SHELL =
  "wb wb-pop fixed inset-0 z-[500] flex flex-col overflow-hidden xl:static xl:z-auto xl:w-[26rem] xl:shrink-0 xl:rounded-3xl xl:border xl:border-(--wb-line) xl:bg-(--wb-card)";

export function GraphsPanel({ plots, onClose, onClear }: { plots: Plot[]; onClose: () => void; onClear: () => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const calcRef = useRef<DesmosCalculator | null>(null);
  const drawnRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const start = useCallback(() => {
    const host = hostRef.current;
    if (!host || calcRef.current || !window.Desmos) return;
    calcRef.current = window.Desmos.GraphingCalculator(host, {
      // A tutoring aid, not the whole calculator: no image uploads, no folders,
      // nothing that turns the panel into somewhere to keep files.
      images: false,
      folders: false,
      notes: false,
      border: false,
      expressionsTopbar: false,
      keypad: false,
    });
    setReady(true);
  }, []);

  // The script may already be on the page from a previous open of this panel,
  // in which case onReady still fires - but an effect covers the case where it
  // does not (a cached script that loaded before this mounted).
  useEffect(() => {
    start();
    return () => {
      calcRef.current?.destroy();
      calcRef.current = null;
      drawnRef.current = [];
    };
  }, [start]);

  // The plots are held by the page, not in here, so closing the panel and
  // reopening it redraws whatever the tutor last graphed.
  useEffect(() => {
    const calc = calcRef.current;
    if (!calc || !ready) return;
    const ids = plots.map((p) => p.id);
    for (const id of drawnRef.current) {
      if (!ids.includes(id)) calc.removeExpression({ id });
    }
    for (const plot of plots) {
      calc.setExpression({ id: plot.id, latex: plot.latex, color: TUTOR_COLOR });
    }
    drawnRef.current = ids;
  }, [plots, ready]);

  return (
    <div className={SHELL}>
      <Script src={SCRIPT_SRC} strategy="lazyOnload" onReady={start} onError={() => setFailed(true)} />
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="wb-serif text-xl">Graph</h2>
        <div className="flex items-center gap-1">
          {plots.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg px-2.5 py-1.5 text-xs text-(--wb-muted) hover:bg-(--wb-hover)"
            >
              Clear the tutor&rsquo;s curves
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-(--wb-hover)"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>
      <p className="px-5 pt-0.5 text-sm text-(--wb-muted)">
        Yours to type in, and the tutor can graph here while you talk to it.
      </p>

      <div className="min-h-0 flex-1 px-5 pb-5 pt-4">
        {failed ? (
          <p className="text-sm text-(--wb-muted)">
            Couldn&rsquo;t load Desmos — check the connection, or set NEXT_PUBLIC_DESMOS_API_KEY.
          </p>
        ) : (
          <div
            ref={hostRef}
            // A definite height, for the same reason the canvas needs one: the
            // calculator fills its parent and collapses to nothing without it.
            className="h-[60dvh] w-full overflow-hidden rounded-2xl border border-(--wb-line) xl:h-[28rem]"
          />
        )}
      </div>
    </div>
  );
}

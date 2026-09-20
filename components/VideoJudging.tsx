"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VIDEO_FACETS } from "@/lib/ai/decide/video";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/schema";
import type { VideoJudging as Judging } from "@/lib/video";

/** Between one bar starting and the next. Jev answers every question at once, in about
 *  a second, so the whole sweep finishes in well under half of one. */
const STAGGER_MS = 9;

export const thumbnail = (id: string) => `/api/video-thumb/${id}`;

const VIEWS = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function length(seconds: number | null): string | null {
  if (seconds === null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Grows from nothing to `value` the moment it has one, so the scores land as a sweep
 *  of lines rather than appearing all at once. `order` staggers the sweep. */
function Bar({ value, order, className }: { value: number | undefined; order: number; className: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value === undefined) return;
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className="h-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none", className)}
        style={{ width: `${shown * 100}%`, transitionDelay: `${order * STAGGER_MS}ms` }}
      />
    </div>
  );
}

/** A number or badge that arrives with its bar, not ahead of it. */
function Landed({ order, className, children }: { order: number; className?: string; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span
      className={cn("transition-opacity duration-150 motion-reduce:transition-none", shown ? "opacity-100" : "opacity-0", className)}
      style={{ transitionDelay: `${order * STAGGER_MS + 150}ms` }}
    >
      {children}
    </span>
  );
}

/**
 * How the lesson's video was chosen: the search results on the left, and on the
 * right the probability Jev gave each one, with the criteria behind it.
 */
export function VideoJudging({ judging }: { judging: Judging }) {
  const { candidates, judgement } = judging;
  const floor = judgement?.floor ?? 0.75;

  return (
    <Card>
      <CardHeader>
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">Video pick · Jev</p>
        <CardTitle className="wb-serif text-2xl font-medium">
          {candidates.length} {candidates.length === 1 ? "video" : "videos"}. One worth your time.
        </CardTitle>
        <CardDescription aria-live="polite">
          {judgement
            ? `Scored in ${judgement.ms} ms by ${judgement.model}. A video is only embedded at ${Math.round(floor * 100)}% or above${judgement.picked === null ? ", and none got there, so this lesson has no video" : ""}.`
            : "Asking Jev how likely each result is to help with this lesson…"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 hidden items-center gap-4 text-xs text-muted-foreground md:flex md:pl-[calc(50%+0.75rem)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-5 rounded-full bg-primary" /> Would it help?
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-5 rounded-full bg-[#d9c46a]" /> Why
          </span>
        </div>

        <ol className="space-y-2.5">
          {candidates.map((video, i) => {
            const score = judgement?.scores[i];
            const picked = judgement?.picked === i;
            const below = score !== undefined && score.fit < floor;
            const meta = [video.channel, video.views === null ? null : `${VIEWS.format(video.views)} views`, length(video.seconds)]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={video.id}
                className={cn(
                  "grid items-center gap-x-6 gap-y-3 rounded-2xl border p-3 transition-colors duration-500 md:grid-cols-2",
                  picked ? "border-primary bg-brand-soft/40 ring-1 ring-primary" : "border-border",
                  below && "opacity-60",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a YouTube thumbnail, not an app asset */}
                  <img
                    src={thumbnail(video.id)}
                    alt=""
                    className="aspect-video w-24 shrink-0 rounded-lg bg-muted object-cover sm:w-28"
                  />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm leading-snug font-medium">{video.title}</p>
                    {meta && <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-3">
                    <div className="relative h-2.5 flex-1">
                      <Bar value={score?.fit} order={i * 5} className={picked ? "bg-primary" : "bg-primary/70"} />
                      {/* The bar to clear. */}
                      <span
                        className="absolute -top-1 -bottom-1 w-px border-l border-dashed border-foreground/40"
                        style={{ left: `${floor * 100}%` }}
                        aria-hidden="true"
                      />
                    </div>
                    <span className="w-10 text-right text-sm tabular-nums">
                      {score ? <Landed order={i * 5}>{Math.round(score.fit * 100)}%</Landed> : "··"}
                    </span>
                    {picked && (
                      // Last of all: the verdict comes after every row has been scored.
                      <Landed order={candidates.length * 5}>
                        <Badge className="gap-1">
                          <Check className="size-3" aria-hidden="true" />
                          Picked
                        </Badge>
                      </Landed>
                    )}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {VIDEO_FACETS.map((facet, f) => {
                      const value = score?.facets[facet.id];
                      return (
                        <div key={facet.id} className="flex items-center gap-2">
                          <dt className="w-24 shrink-0 truncate text-[11px] text-muted-foreground">{facet.label}</dt>
                          <dd className="h-1 flex-1">
                            <Bar value={value} order={i * 5 + f + 1} className="bg-[#d9c46a]" />
                          </dd>
                          <span className="w-7 text-right text-[11px] text-muted-foreground tabular-nums">
                            {value === undefined ? "" : <Landed order={i * 5 + f + 1}>{Math.round(value * 100)}</Landed>}
                          </span>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

/** A number that changes every frame or so: what "being scored right now" looks like. */
function useTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => t + 1), 45);
    return () => clearInterval(id);
  }, [active]);
  return tick;
}

/**
 * The same judging, sized for the lesson's video slot: every result as a thumbnail,
 * its score spinning until Jev answers, then snapping to the real number. The winner
 * is lifted, and the caller swaps this for the video itself a beat later.
 */
export function VideoRace({ judging }: { judging: Judging }) {
  const { candidates, judgement } = judging;
  const tick = useTick(judgement === null);
  const floor = judgement?.floor ?? 0.75;

  return (
    <div>
      <div className="video !bg-card p-2.5 ring-1 ring-foreground/10" aria-busy={judgement === null}>
        <ol className="grid h-full grid-cols-3 grid-rows-2 gap-2">
          {candidates.slice(0, 6).map((video, i) => {
            const fit = judgement?.scores[i]?.fit;
            // Unscored, the reading is noise on purpose; each tile gets its own.
            const reading = fit ?? ((tick * 37 + i * 53) % 97) / 100;
            const picked = judgement?.picked === i;
            const out = fit !== undefined && !picked;
            return (
              <li
                key={video.id}
                className={cn(
                  "relative overflow-hidden rounded-lg bg-muted transition-all duration-300",
                  picked && "z-10 scale-[1.03] shadow-lg ring-2 ring-primary",
                  out && (fit < floor ? "opacity-35 grayscale" : "opacity-70"),
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a YouTube thumbnail, not an app asset */}
                <img src={thumbnail(video.id)} alt={video.title} className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pt-4 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                      <div
                        className={cn("h-full rounded-full", picked ? "bg-[#f8efc8]" : "bg-white")}
                        style={{ width: `${reading * 100}%`, transition: fit === undefined ? "none" : "width 160ms ease-out" }}
                      />
                    </div>
                    <span className="w-7 text-right text-[11px] font-medium text-white tabular-nums">
                      {Math.round(reading * 100)}
                    </span>
                  </div>
                </div>
                {picked && (
                  <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    <Check className="size-3" aria-hidden="true" />
                    Picked
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-2 truncate text-sm text-muted-foreground" aria-live="polite">
        {judgement
          ? `Jev scored ${candidates.length} videos in ${judgement.ms} ms${judgement.picked === null ? ". None was good enough to embed." : "."}`
          : `Jev is scoring ${candidates.length} videos…`}
      </p>
    </div>
  );
}

/** How long the scored thumbnails stay up before the winner becomes the video. Jev's
 *  answer and the pick arrive together, so without this the scores would never be seen. */
const SCORES_ON_SCREEN_MS = 1400;

/** True while the race should hold the video slot: from the first search result until
 *  a beat after Jev has answered. */
export function useScoresOnScreen(judging: Judging | undefined, video: Video | null): boolean {
  const scored = Boolean(judging?.judgement);
  const [released, setReleased] = useState(false);
  useEffect(() => {
    if (!scored) return;
    const id = setTimeout(() => setReleased(true), SCORES_ON_SCREEN_MS);
    return () => clearTimeout(id);
  }, [scored]);
  return Boolean(judging) && (video === null || (scored && !released));
}

/**
 * Where the lesson's video goes. While it is being chosen this is the race between the
 * search results; once Jev has answered, the winner is shown for a beat and then plays.
 */
export function VideoSlot({
  video,
  judging,
  racing,
  onShowScores,
  renderVideo,
}: {
  video: Video | null;
  judging: Judging | undefined;
  racing: boolean;
  onShowScores: () => void;
  renderVideo: (id: string, title: string | null) => ReactNode;
}) {
  if (judging && racing) return <VideoRace judging={judging} />;
  if (video === null) {
    return (
      <div className="video flex items-center justify-center text-sm text-muted-foreground" aria-busy="true">
        Finding a video…
      </div>
    );
  }
  if (!video.id) return null;

  const judgement = judging?.judgement;
  const fit = judgement?.picked == null ? null : judgement.scores[judgement.picked]?.fit;
  return (
    <div>
      {renderVideo(video.id, video.title)}
      {judging && judgement && fit != null && (
        <p className="mt-1 text-xs text-muted-foreground">
          Picked by Jev from {judging.candidates.length} results · {Math.round(fit * 100)}% likely to help ·{" "}
          {judgement.ms} ms ·{" "}
          <button type="button" onClick={onShowScores} className="lesson-link">
            see the scores
          </button>
        </p>
      )}
    </div>
  );
}

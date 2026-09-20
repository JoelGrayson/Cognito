"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VideoJudging, VideoSlot, useScoresOnScreen } from "@/components/VideoJudging";
import type { VideoJudging as Judging } from "@/lib/video";

/**
 * The video-pick panel on its own, for working on its look and for demos. The search
 * results are real (captured once through lib/youtube). THE SCORES ARE CAPTUREDS, written
 * by hand to look like a Jev answer; a real lesson shows Jev's own numbers.
 */
const CAPTURED: Judging = {
  candidates: [
    {"id": "PFDu9oVAE-g", "title": "Eigenvectors and eigenvalues | Chapter 14, Essence of linear algebra", "channel": "3Blue1Brown", "seconds": 1036, "views": 6312004},
    {"id": "TQvxWaQnrqI", "title": "Finding Eigenvalues and Eigenvectors", "channel": "Professor Dave Explains", "seconds": 1030, "views": 1391296},
    {"id": "8uISh6xyW7w", "title": "Oxford Linear Algebra: Eigenvalues and Eigenvectors Explained", "channel": "Tom Rocks Maths", "seconds": 1583, "views": 55358},
    {"id": "ue3yoeZvt8E", "title": "What is an Eigenvector?", "channel": "Leios", "seconds": 241, "views": 490146},
    {"id": "5UjQVJu89_Q", "title": "Eigen values and Eigen vectors in 3 mins | Explained with an interesting analogy", "channel": "Solid Mechanics Classroom", "seconds": 175, "views": 151540},
    {"id": "1sDBruay100", "title": "No One Taught Eigenvalues & EigenVectors Like This", "channel": "Brain Station Advanced", "seconds": 529, "views": 383919},
  ],
  judgement: {
    model: "jev-1.13.0",
    ms: 1100,
    floor: 0.75,
    picked: 0,
    scores: [
      { fit: 0.93, facets: { onTopic: 0.89, depth: 0.73, credible: 0.94, teaching: 0.89 } },
      { fit: 0.89, facets: { onTopic: 0.87, depth: 0.69, credible: 0.85, teaching: 0.87 } },
      { fit: 0.78, facets: { onTopic: 0.87, depth: 0.62, credible: 0.63, teaching: 0.81 } },
      { fit: 0.45, facets: { onTopic: 0.8, depth: 0.56, credible: 0.46, teaching: 0.73 } },
      { fit: 0.31, facets: { onTopic: 0.59, depth: 0.41, credible: 0.46, teaching: 0.68 } },
      { fit: 0.34, facets: { onTopic: 0.77, depth: 0.54, credible: 0.43, teaching: 0.62 } },
    ],
  },
};

const PICKED = CAPTURED.candidates[CAPTURED.judgement?.picked ?? 0];

export default function VideoPickPreview() {
  // Replays what a lesson does: the results arrive, Jev answers about a second later,
  // and the pick comes with the answer.
  const [run, setRun] = useState(0);
  const [scored, setScored] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setScored(true), CAPTURED.judgement?.ms ?? 1000);
    return () => clearTimeout(id);
  }, [run]);

  const judging: Judging = scored ? CAPTURED : { candidates: CAPTURED.candidates, judgement: null };
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl tracking-tight">Video pick preview</h1>
          <p className="mt-1 text-muted-foreground">
            One real run, replayed at its real speed: the search results for a lesson, then Jev&rsquo;s scores.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setScored(false);
            setRun((n) => n + 1);
          }}
        >
          Replay
        </Button>
      </div>
      <Replay key={run} judging={judging} scored={scored} scoresOpen={scoresOpen} onToggle={() => setScoresOpen((o) => !o)} />
    </main>
  );
}

function Replay({
  judging,
  scored,
  scoresOpen,
  onToggle,
}: {
  judging: Judging;
  scored: boolean;
  scoresOpen: boolean;
  onToggle: () => void;
}) {
  const video = scored ? { id: PICKED.id, title: PICKED.title, searchUrl: "" } : null;
  const racing = useScoresOnScreen(judging, video);
  return (
    <>
      <div className="max-w-xl">
        <VideoSlot
          video={video}
          judging={judging}
          racing={racing}
          onShowScores={onToggle}
          renderVideo={(id, title) => (
            <div>
              <div className="video ring-1 ring-foreground/10">
                <iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title={title ?? "Lesson video"} allowFullScreen />
              </div>
              {title && <p className="mt-2 truncate text-sm text-muted-foreground">{title}</p>}
            </div>
          )}
        />
      </div>
      {scored && scoresOpen && (
        <div className="mt-8">
          <VideoJudging judging={judging} />
        </div>
      )}
    </>
  );
}

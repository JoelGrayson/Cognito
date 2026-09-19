import { Fragment } from "react";
import type { MapNode, MindMap, Phase } from "@/lib/schema";

function Card({ node, phase }: { node: MapNode; phase: Phase }) {
  return (
    <div className="card" data-phase={phase} title={node.description}>
      <div className="card-name">{node.name}</div>
      <div className="card-sub">{node.subtitle}</div>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 12 64" width="12" aria-hidden="true">
      <line x1="6" y1="0" x2="6" y2="55" stroke="var(--arrow)" strokeWidth="1.5" />
      <path d="M1 50 L6 58 L11 50" fill="none" stroke="var(--arrow)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Roadmap({ map }: { map: MindMap }) {
  return (
    <div className="panel px-6 py-10 sm:px-10 md:px-16">
      {map.stages.map((stage, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <div className="arrow-row">
              <Arrow />
            </div>
          )}
          <div className="stage-row">
            <div className="slot">
              {stage.supporting[0] && <Card node={stage.supporting[0]} phase={stage.phase} />}
            </div>
            <div className="slot slot-core">
              <Card node={stage.core} phase={stage.phase} />
            </div>
            <div className="slot">
              {stage.supporting[1] && <Card node={stage.supporting[1]} phase={stage.phase} />}
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** Placeholder grid shown while a roadmap is being generated. */
export function RoadmapSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="panel px-6 py-10 sm:px-10 md:px-16" aria-busy="true" aria-label="Generating roadmap">
      {Array.from({ length: rows }).map((_, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <div className="arrow-row">
              <Arrow />
            </div>
          )}
          <div className="stage-row">
            <div className="slot">{i % 3 !== 1 && <div className="skeleton" />}</div>
            <div className="slot slot-core">
              <div className="skeleton" />
            </div>
            <div className="slot">{i % 3 !== 1 && <div className="skeleton" />}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

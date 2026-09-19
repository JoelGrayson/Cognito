import { Fragment } from "react";
import { nodeAt, sameRef, type NodeRef } from "@/lib/roadmap";
import type { MapNode, MindMap, Phase } from "@/lib/schema";

interface CardProps {
  node: MapNode;
  phase: Phase;
  selected?: boolean;
  onClick?: () => void;
}

function Card({ node, phase, selected, onClick }: CardProps) {
  const inner = (
    <>
      <div className="card-name">{node.name}</div>
      <div className="card-sub">{node.subtitle}</div>
    </>
  );
  if (!onClick) {
    return (
      <div className="card" data-phase={phase} title={node.description}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="card"
      data-phase={phase}
      data-selected={selected ? "true" : undefined}
      aria-current={selected ? "true" : undefined}
      title={node.description}
      onClick={onClick}
    >
      {inner}
    </button>
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

interface RoadmapProps {
  map: MindMap;
  /** When given, blocks become buttons. */
  onSelect?: (ref: NodeRef) => void;
  /** Block to outline as the current one. */
  selected?: NodeRef | null;
  /** Thumbnail-sized rendering for the lesson view's mini map. */
  compact?: boolean;
}

export function Roadmap({ map, onSelect, selected, compact }: RoadmapProps) {
  const slot = (ref: NodeRef) => {
    const at = nodeAt(map, ref);
    if (!at) return null;
    return (
      <Card
        node={at.node}
        phase={at.phase}
        selected={sameRef(selected, ref)}
        onClick={onSelect ? () => onSelect(ref) : undefined}
      />
    );
  };

  return (
    <div className={compact ? "panel roadmap-compact p-2" : "panel px-6 py-10 sm:px-10 md:px-16"}>
      {map.stages.map((_, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <div className="arrow-row">
              <Arrow />
            </div>
          )}
          <div className="stage-row">
            <div className="slot">{slot({ stage: i, kind: "supporting", index: 0 })}</div>
            <div className="slot slot-core">{slot({ stage: i, kind: "core", index: 0 })}</div>
            <div className="slot">{slot({ stage: i, kind: "supporting", index: 1 })}</div>
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

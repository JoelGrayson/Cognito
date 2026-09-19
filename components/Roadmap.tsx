import { Fragment } from "react";
import { nodeAt, sameRef, type NodeRef } from "@/lib/roadmap";
import type { MapNode, MindMap, Phase } from "@/lib/schema";

interface CardProps {
  node: MapNode;
  phase: Phase;
  selected?: boolean;
  onClick?: () => void;
  /** Makes the block a link, so it can also be opened in a new tab. */
  href?: string;
  /** Its lesson is fully written: solid border instead of dotted. */
  ready?: boolean;
}

function Card({ node, phase, selected, onClick, href, ready }: CardProps) {
  const readyAttr = ready ? "true" : undefined;
  const inner = (
    <>
      <div className="card-name">{node.name}</div>
      <div className="card-sub">{node.subtitle}</div>
    </>
  );
  if (!onClick) {
    return (
      <div className="card" data-phase={phase} data-ready={readyAttr} title={node.description}>
        {inner}
      </div>
    );
  }
  if (href) {
    return (
      <a
        href={href}
        className="card"
        data-phase={phase}
        data-ready={readyAttr}
        data-selected={selected ? "true" : undefined}
        aria-current={selected ? "true" : undefined}
        title={node.description}
        onClick={(e) => {
          // Leave new-tab and new-window gestures to the browser. Middle click never fires click.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onClick();
        }}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      className="card"
      data-phase={phase}
      data-ready={readyAttr}
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

function ArrowRow() {
  return (
    <div className="arrow-row">
      <Arrow />
    </div>
  );
}

/** A placeholder stage; `wide` adds the two supporting slots. */
function SkeletonRow({ wide }: { wide: boolean }) {
  return (
    <div className="stage-row">
      <div className="slot">{wide && <div className="skeleton" />}</div>
      <div className="slot slot-core">
        <div className="skeleton" />
      </div>
      <div className="slot">{wide && <div className="skeleton" />}</div>
    </div>
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
  /** Placeholder rows to show after the stages while more are streaming in. */
  pending?: number;
  /** The map is still arriving: the last block may be half-written, so it stays inert. */
  streaming?: boolean;
  /** Address of a block's lesson, so blocks are links that open in a new tab too. */
  hrefFor?: (ref: NodeRef) => string | undefined;
  /** Whether a block's lesson is fully written. */
  isReady?: (node: MapNode) => boolean;
}

/** The block most recently added to a map, which is the one still being written while streaming. */
function tailOf(map: MindMap): NodeRef | null {
  const stage = map.stages.length - 1;
  if (stage < 0) return null;
  const supporting = map.stages[stage].supporting.length;
  return supporting > 0
    ? { stage, kind: "supporting", index: supporting - 1 }
    : { stage, kind: "core", index: 0 };
}

export function Roadmap({
  map,
  onSelect,
  selected,
  compact,
  pending = 0,
  streaming = false,
  hrefFor,
  isReady,
}: RoadmapProps) {
  const tail = streaming ? tailOf(map) : null;
  const slot = (ref: NodeRef) => {
    const at = nodeAt(map, ref);
    if (!at) return null;
    const clickable = onSelect && !sameRef(tail, ref);
    return (
      <Card
        node={at.node}
        phase={at.phase}
        selected={sameRef(selected, ref)}
        onClick={clickable ? () => onSelect(ref) : undefined}
        href={clickable ? hrefFor?.(ref) : undefined}
        ready={isReady?.(at.node)}
      />
    );
  };
  const count = map.stages.length;

  return (
    <div className={compact ? "panel roadmap-compact p-2" : "panel px-6 py-10 sm:px-10 md:px-16"}>
      {map.stages.map((_, i) => (
        <Fragment key={i}>
          {i > 0 && <ArrowRow />}
          <div className="stage-row">
            <div className="slot">{slot({ stage: i, kind: "supporting", index: 0 })}</div>
            <div className="slot slot-core">{slot({ stage: i, kind: "core", index: 0 })}</div>
            <div className="slot">{slot({ stage: i, kind: "supporting", index: 1 })}</div>
          </div>
        </Fragment>
      ))}
      {Array.from({ length: pending }).map((_, j) => (
        <Fragment key={`pending-${j}`}>
          {count + j > 0 && <ArrowRow />}
          <SkeletonRow wide={(count + j) % 3 !== 1} />
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
          {i > 0 && <ArrowRow />}
          <SkeletonRow wide={i % 3 !== 1} />
        </Fragment>
      ))}
    </div>
  );
}

/** Explains the map's colours and borders. Swatches reuse the card styles, so they always match. */
export function RoadmapLegend() {
  const phases: { phase: Phase; label: string }[] = [
    { phase: "prerequisite", label: "Prerequisite" },
    { phase: "core", label: "Core" },
    { phase: "advanced", label: "Advanced" },
  ];
  return (
    <ul className="legend" aria-label="Map legend">
      {phases.map(({ phase, label }) => (
        <li key={phase}>
          <span className="card legend-swatch" data-phase={phase} data-ready="true" aria-hidden="true" />
          {label}
        </li>
      ))}
      <li>
        <span className="card legend-swatch legend-swatch-plain" data-ready="true" aria-hidden="true" />
        Lesson written
      </li>
      <li>
        <span className="card legend-swatch legend-swatch-plain" aria-hidden="true" />
        Not written yet
      </li>
    </ul>
  );
}

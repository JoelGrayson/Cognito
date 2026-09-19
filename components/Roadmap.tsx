import { Fragment, useEffect, useState, type DragEvent } from "react";
import { nodeAt, sameRef, type NodeRef } from "@/lib/roadmap";
import type { MapNode, MindMap, Phase, StageLink } from "@/lib/schema";

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

/** Space between stages with no hard dependency: top to bottom is just the suggested order. */
function GapRow() {
  return <div className="gap-row" aria-hidden="true" />;
}

type Stage = MindMap["stages"][number];

/** Roadmaps saved before stage links existed have none; they read as a suggested order. */
function linkOf(stage: Stage): StageLink {
  return stage.link ?? "recommended";
}

/** Consecutive stages joined by "any-order" form one group that can be taken in any order. */
function groupStages(stages: Stage[]): { start: number; end: number }[] {
  const groups: { start: number; end: number }[] = [];
  stages.forEach((stage, i) => {
    if (i > 0 && linkOf(stage) === "any-order") groups[groups.length - 1].end = i;
    else groups.push({ start: i, end: i });
  });
  return groups;
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
  /** Editing, when given: rename, delete and drag blocks around. */
  onEdit?: (ref: NodeRef) => void;
  onDelete?: (ref: NodeRef) => void;
  onMove?: (from: NodeRef, to: NodeRef) => void;
}

const REF_TYPE = "application/x-roadmap-block";

function parseRef(e: DragEvent): NodeRef | null {
  try {
    const raw = e.dataTransfer.getData(REF_TYPE);
    return raw ? (JSON.parse(raw) as NodeRef) : null;
  } catch {
    return null;
  }
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
  onEdit,
  onDelete,
  onMove,
}: RoadmapProps) {
  const editable = Boolean(onEdit || onDelete || onMove) && !compact;
  const [menu, setMenu] = useState<NodeRef | null>(null);
  const [dragging, setDragging] = useState<NodeRef | null>(null);
  const [over, setOver] = useState<NodeRef | null>(null);

  // A click anywhere else closes the block menu.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  const tail = streaming ? tailOf(map) : null;
  const slot = (ref: NodeRef) => {
    const at = nodeAt(map, ref);
    if (!at) return null;
    const clickable = onSelect && !sameRef(tail, ref);
    const card = (
      <Card
        node={at.node}
        phase={at.phase}
        selected={sameRef(selected, ref)}
        onClick={clickable ? () => onSelect(ref) : undefined}
        href={clickable ? hrefFor?.(ref) : undefined}
        ready={isReady?.(at.node)}
      />
    );
    if (!editable) return card;
    const open = sameRef(menu, ref);
    return (
      <div
        className="card-wrap"
        draggable={Boolean(onMove)}
        data-dragging={sameRef(dragging, ref) ? "true" : undefined}
        onDragStart={(e) => {
          e.dataTransfer.setData(REF_TYPE, JSON.stringify(ref));
          e.dataTransfer.effectAllowed = "move";
          setDragging(ref);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(open ? null : ref);
        }}
      >
        {card}
        <button
          type="button"
          className="card-menu"
          aria-label={`Actions for ${at.node.name}`}
          aria-expanded={open}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            setMenu(open ? null : ref);
          }}
        >
          …
        </button>
        {open && (
          <div className="card-actions" role="menu" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onEdit?.(ref);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              className="card-action-danger"
              onClick={() => {
                setMenu(null);
                onDelete?.(ref);
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  /** Drop targets: every slot, including the empty ones. */
  const dropProps = (ref: NodeRef) =>
    onMove && editable
      ? {
          "data-over": sameRef(over, ref) && !sameRef(dragging, ref) ? "true" : undefined,
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes(REF_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move" as const;
            setOver(ref);
          },
          onDragLeave: () => setOver((current) => (sameRef(current, ref) ? null : current)),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            const from = parseRef(e);
            setOver(null);
            setDragging(null);
            if (from) onMove(from, ref);
          },
        }
      : {};
  const count = map.stages.length;
  const row = (i: number) => (
    <Fragment>
      {/* Why this stage comes here; the mini map has no room for it. */}
      {!compact && map.stages[i].why && <p className="stage-why">{map.stages[i].why}</p>}
      <div className="stage-row">
        <div className="slot" {...dropProps({ stage: i, kind: "supporting", index: 0 })}>
          {slot({ stage: i, kind: "supporting", index: 0 })}
        </div>
        <div className="slot slot-core" {...dropProps({ stage: i, kind: "core", index: 0 })}>
          {slot({ stage: i, kind: "core", index: 0 })}
        </div>
        <div className="slot" {...dropProps({ stage: i, kind: "supporting", index: 1 })}>
          {slot({ stage: i, kind: "supporting", index: 1 })}
        </div>
      </div>
    </Fragment>
  );

  return (
    <div className={compact ? "panel roadmap-compact p-2" : "panel px-6 py-10 sm:px-10 md:px-16"}>
      {groupStages(map.stages).map(({ start, end }, g) => (
        <Fragment key={start}>
          {/* Arrows only for true prerequisites; otherwise top to bottom is a suggested order. */}
          {g > 0 && (linkOf(map.stages[start]) === "requires" ? <ArrowRow /> : <GapRow />)}
          {end > start ? (
            <div className="order-group" role="group" aria-label="These can be learned in any order">
              {!compact && <span className="order-group-label">Any order</span>}
              {Array.from({ length: end - start + 1 }, (_, k) => start + k).map((i) => (
                <Fragment key={i}>
                  {i > start && <div className="group-gap" aria-hidden="true" />}
                  {row(i)}
                </Fragment>
              ))}
            </div>
          ) : (
            row(start)
          )}
        </Fragment>
      ))}
      {Array.from({ length: pending }).map((_, j) => (
        <Fragment key={`pending-${j}`}>
          {count + j > 0 && <GapRow />}
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
          {i > 0 && <GapRow />}
          <SkeletonRow wide={i % 3 !== 1} />
        </Fragment>
      ))}
    </div>
  );
}

/** Explains the map's colours, borders and structure. Swatches reuse the map's own styles, so they always match. */
export function RoadmapLegend({ structure = true }: { structure?: boolean }) {
  const phases: { phase: Phase; label: string }[] = [
    { phase: "prerequisite", label: "Prerequisite" },
    { phase: "core", label: "Core" },
    { phase: "advanced", label: "Advanced" },
  ];
  return (
    <div className="legend" aria-label="Map legend">
      <ul>
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
      {structure && (
      <ul>
        <li>
          <svg className="legend-arrow" viewBox="0 0 12 22" aria-hidden="true">
            <line x1="6" y1="1" x2="6" y2="17" stroke="var(--arrow)" strokeWidth="1.5" />
            <path d="M2 13 L6 19 L10 13" fill="none" stroke="var(--arrow)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          Must come first
        </li>
        <li>
          <span className="legend-group" aria-hidden="true" />
          Any order
        </li>
        <li>No arrow: suggested order, top to bottom</li>
      </ul>
      )}
    </div>
  );
}

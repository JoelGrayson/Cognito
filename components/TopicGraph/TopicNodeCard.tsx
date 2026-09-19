"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { DraftNode, Progress } from "@/types/learning";
import { formatMinutes } from "./helpers";

export type TopicNodeData = {
  node: DraftNode;
  /** Minutes to show. For a container this is the sum of its children. */
  minutes: number;
  childCount: number;
  progress: Progress;
  /** Changes every time the node is highlighted; null when it is not. Restarts the animation. */
  pulseKey: number | null;
  selected: boolean;
  onSelect: (id: string) => void;
};

export type TopicFlowNode = Node<TopicNodeData, "topic" | "container">;

const PROGRESS_LABEL: Record<Progress, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 4.8" />
    </svg>
  );
}

function describe(data: TopicNodeData): string {
  const { node, minutes, progress } = data;
  const parts = [node.title, formatMinutes(minutes), node.kind === "optional" ? "optional" : "core"];
  if (node.scope !== "included") parts.push(node.scope);
  else if (progress !== "todo") parts.push(PROGRESS_LABEL[progress].toLowerCase());
  return parts.join(", ");
}

/** Scope and progress tags shown in the meta row. Colour is never the only cue. */
function Tags({ data }: { data: TopicNodeData }) {
  const { node, progress } = data;
  return (
    <>
      {node.kind === "optional" && <span className="tg-tag">Optional</span>}
      {node.scope === "known" && (
        <span className="tg-tag"><CheckIcon />Known</span>
      )}
      {node.scope === "excluded" && <span className="tg-tag">Excluded</span>}
      {node.scope === "included" && progress === "done" && (
        <span className="tg-tag tg-progress-tag" data-progress="done"><CheckIcon />Done</span>
      )}
      {node.scope === "included" && progress === "in_progress" && (
        <span className="tg-tag tg-progress-tag" data-progress="in_progress">In progress</span>
      )}
    </>
  );
}

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Top} className="tg-handle" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className="tg-handle" isConnectable={false} />
    </>
  );
}

/** A leaf, or a top-level node with no children. */
export function TopicNodeCard({ data }: NodeProps<TopicFlowNode>) {
  const { node, minutes, progress, pulseKey, selected, onSelect } = data;
  return (
    <>
      <button
        type="button"
        className="tg-card"
        data-tg-node={node.id}
        data-kind={node.kind}
        data-scope={node.scope}
        data-progress={progress}
        data-selected={selected}
        aria-label={describe(data)}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(node.id)}
      >
        <span className="tg-title">{node.title}</span>
        <span className="tg-meta">
          <span>{formatMinutes(minutes)}</span>
          <Tags data={data} />
        </span>
      </button>
      {pulseKey !== null && <span key={pulseKey} className="tg-pulse" aria-hidden="true" />}
      <Handles />
    </>
  );
}

/** The group box for a node that has children. Its children are separate nodes inside it. */
export function TopicGroupNode({ data }: NodeProps<TopicFlowNode>) {
  const { node, minutes, childCount, progress, pulseKey, selected, onSelect } = data;
  return (
    <div
      className="tg-group"
      data-kind={node.kind}
      data-scope={node.scope}
      data-progress={progress}
    >
      <button
        type="button"
        className="tg-group-head"
        data-tg-node={node.id}
        data-scope={node.scope}
        data-selected={selected}
        aria-label={`${describe(data)}, ${childCount} subtopics`}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(node.id)}
      >
        <span className="tg-title">{node.title}</span>
        <span className="tg-meta">
          <Tags data={data} />
          <span>{formatMinutes(minutes)}</span>
        </span>
      </button>
      {pulseKey !== null && <span key={pulseKey} className="tg-pulse" aria-hidden="true" />}
      <Handles />
    </div>
  );
}

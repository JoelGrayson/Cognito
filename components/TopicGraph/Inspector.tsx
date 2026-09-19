"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { DraftNode, GraphOp } from "@/types/learning";
import {
  MAX_SUMMARY,
  MAX_TITLE,
  buildAddChildOps,
  buildEditOps,
  buildRemoveOps,
  buildScopeOps,
  canAddChild,
  childrenOf,
  containerMinutes,
  formatMinutes,
  isContainer,
  type AnyGraph,
} from "./helpers";

type Props = {
  graph: AnyGraph;
  node: DraftNode;
  /** True for a saved PlanGraph: "delete" is then a soft remove and is labelled "Remove". */
  isPlan: boolean;
  onOps: (ops: GraphOp[]) => void;
  onClose: () => void;
};

const SCOPES: { value: DraftNode["scope"]; label: string }[] = [
  { value: "included", label: "Included" },
  { value: "known", label: "Known" },
  { value: "excluded", label: "Excluded" },
];

/**
 * Edit panel for one node. It holds only form state; every change leaves as GraphOp[] through
 * onOps and the parent decides what to do with it. It is remounted (keyed) when the node's
 * saved values change, so it always shows the graph it was given.
 */
export function Inspector({ graph, node, isPlan, onOps, onClose }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const titleId = useId();

  // Move focus into the panel when it opens or switches node, so keyboard users land in it.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [node.id]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <section
      ref={rootRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="tg-inspector"
      data-testid="tg-inspector"
      onKeyDown={onKeyDown}
    >
      <header className="flex items-start justify-between gap-3 border-b border-[#eeeeea] px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6f6f6b]">
            {isContainer(graph, node.id)
              ? `Group, ${formatMinutes(containerMinutes(graph, node.id))}`
              : `Topic, ${formatMinutes(node.estMinutes)}`}
          </p>
          <h2 id={titleId} className="truncate text-[15px] font-semibold">{node.title}</h2>
        </div>
        <button type="button" className="tg-btn" onClick={onClose} aria-label="Close inspector">
          Close
        </button>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4">
        <TextFields key={node.id} node={node} onOps={onOps} />
        <ScopeControl graph={graph} node={node} onOps={onOps} />
        {canAddChild(node) && <AddChild graph={graph} node={node} onOps={onOps} />}
        <DeleteControl graph={graph} node={node} isPlan={isPlan} onOps={onOps} />
      </div>
    </section>
  );
}

function TextFields({ node, onOps }: { node: DraftNode; onOps: (ops: GraphOp[]) => void }) {
  const [title, setTitle] = useState(node.title);
  const [summary, setSummary] = useState(node.summary);
  // When the saved values change (an edit was applied, or the graph changed elsewhere), show
  // them. Adjusting state during render keeps focus, unlike remounting the form.
  const [seen, setSeen] = useState({ title: node.title, summary: node.summary });
  if (seen.title !== node.title || seen.summary !== node.summary) {
    setSeen({ title: node.title, summary: node.summary });
    setTitle(node.title);
    setSummary(node.summary);
  }
  const titleFieldId = useId();
  const summaryFieldId = useId();

  const ops = buildEditOps(node, { title, summary });
  const dirty = ops.length > 0;
  const titleEmpty = title.trim().length === 0;

  function commit() {
    if (dirty && !titleEmpty) onOps(ops);
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={titleFieldId} className="text-[13px] font-semibold">Title</label>
        <input
          id={titleFieldId}
          className="tg-field"
          value={title}
          maxLength={MAX_TITLE}
          aria-invalid={titleEmpty}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commit}
        />
        {titleEmpty && <p className="text-[12px] text-[#a12622]">A title is required.</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={summaryFieldId} className="text-[13px] font-semibold">Summary</label>
        <textarea
          id={summaryFieldId}
          className="tg-field resize-none"
          rows={3}
          value={summary}
          maxLength={MAX_SUMMARY}
          onChange={(event) => setSummary(event.target.value)}
          onBlur={commit}
        />
        <p className="self-end text-[12px] text-[#6f6f6b]">{summary.length}/{MAX_SUMMARY}</p>
      </div>
      <button type="submit" className="tg-btn self-start" data-variant="primary" disabled={!dirty || titleEmpty}>
        Save changes
      </button>
    </form>
  );
}

function ScopeControl({
  graph,
  node,
  onOps,
}: {
  graph: AnyGraph;
  node: DraftNode;
  onOps: (ops: GraphOp[]) => void;
}) {
  const kids = childrenOf(graph, node.id).length;
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[13px] font-semibold">Scope</span>
      <div className="tg-seg" role="radiogroup" aria-labelledby={labelId}>
        {SCOPES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={node.scope === value}
            onClick={() => {
              const ops = buildScopeOps(graph, node, value);
              if (ops.length > 0) onOps(ops);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-[#6f6f6b]">
        {kids > 0
          ? `Applies to this group and its ${kids} subtopics.`
          : "Known topics are skipped in the schedule. Excluded topics stay on the map, greyed out."}
      </p>
    </div>
  );
}

function AddChild({
  graph,
  node,
  onOps,
}: {
  graph: AnyGraph;
  node: DraftNode;
  onOps: (ops: GraphOp[]) => void;
}) {
  const [title, setTitle] = useState("");
  const fieldId = useId();
  const ops = buildAddChildOps(graph, node, title);
  const isLeaf = childrenOf(graph, node.id).length === 0;
  const full = graph.nodes.length >= 30;

  return (
    <form
      className="flex flex-col gap-1.5 border-t border-[#eeeeea] pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ops.length === 0 || full) return;
        onOps(ops);
        setTitle("");
      }}
    >
      <label htmlFor={fieldId} className="text-[13px] font-semibold">Add a subtopic</label>
      <div className="flex gap-2">
        <input
          id={fieldId}
          className="tg-field"
          placeholder="Subtopic title"
          value={title}
          maxLength={MAX_TITLE}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" className="tg-btn shrink-0" disabled={ops.length === 0 || full}>
          Add
        </button>
      </div>
      <p className="text-[12px] text-[#6f6f6b]">
        {full
          ? "The map is full (30 topics)."
          : isLeaf && node.estMinutes > 0
            ? "This topic becomes a group; its own minutes move to its subtopics."
            : "New subtopics start at 30 minutes."}
      </p>
    </form>
  );
}

function DeleteControl({
  graph,
  node,
  isPlan,
  onOps,
}: {
  graph: AnyGraph;
  node: DraftNode;
  isPlan: boolean;
  onOps: (ops: GraphOp[]) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const kids = childrenOf(graph, node.id).length;
  const label = isPlan ? "Remove" : "Delete";
  const needsConfirm = kids > 0;

  return (
    <div className="flex flex-col gap-1.5 border-t border-[#eeeeea] pt-4">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <span className="text-[13px]">
            {isPlan
              ? `Exclude this group and its ${kids} subtopics?`
              : `Delete this group and its ${kids} subtopics?`}
          </span>
          <button type="button" className="tg-btn" data-variant="danger" onClick={() => onOps(buildRemoveOps(node))}>
            {label} all
          </button>
          <button type="button" className="tg-btn" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="tg-btn self-start"
          data-variant="danger"
          onClick={() => (needsConfirm ? setConfirming(true) : onOps(buildRemoveOps(node)))}
        >
          {label} {kids > 0 ? "group" : "topic"}
        </button>
      )}
      {isPlan && (
        <p className="text-[12px] text-[#6f6f6b]">
          Saved plans keep the topic so progress is not lost; it is marked excluded instead.
        </p>
      )}
    </div>
  );
}

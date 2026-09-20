"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type Edge as FlowEdge,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./topic-graph.css";
import { NARROW_NODE_WIDTH, layoutGraph, type GraphLayout } from "@/lib/graph/layout";
import type { DraftGraph, DraftNode, GraphOp, PlanGraph, Progress } from "@/types/learning";
import { Inspector } from "./Inspector";
import { TopicGroupNode, TopicNodeCard, type TopicFlowNode } from "./TopicNodeCard";
import { containerMinutes, looksLikePlanGraph, resolveProgress } from "./helpers";

// Defined outside the component so React Flow does not see a new object on every render.
const nodeTypes: NodeTypes = { topic: TopicNodeCard, container: TopicGroupNode };

const EMPTY_IDS: string[] = [];
const EMPTY_PROGRESS: Record<string, Progress> = {};
/** Below this width the layout switches to one child per row and starts at the top. */
const NARROW_PX = 640;
const FIT_PADDING = 16;

export type TopicGraphProps = {
  graph: PlanGraph | DraftGraph;
  mode: "edit" | "view";
  /**
   * Node ids to pulse for about 2 seconds. Pass a stable array (state, not a fresh literal each
   * render): a new array identity retriggers the pulse, even with the same ids.
   */
  highlightIds?: string[];
  /** Missing entries mean "todo". Containers without an entry are derived from their leaves. */
  progress?: Record<string, Progress>;
  /** Called on every node click or Enter, in both modes. */
  onNodeClick?: (node: DraftNode) => void;
  /**
   * When set, hovering (or keyboard-focusing) a node shows quick actions: mark known,
   * ignore, delete. The parent applies the matching ops and passes the new graph back.
   */
  onNodeAction?: (node: DraftNode, action: NodeAction) => void;
  /** When set, right-clicking empty canvas opens a small bar to type an extra topic. */
  onAddTopic?: (title: string) => void;
  /**
   * Edit mode only. Every change the user makes is emitted here as ops. The component never
   * mutates or stores the graph; the parent applies the ops (applyOps or applyPlanOps, then
   * validateGraph) and passes the new graph back in.
   */
  onOps?: (ops: GraphOp[]) => void;
  /** Wording only: "Remove" (saved plan) versus "Delete" (draft). Guessed from the graph if omitted. */
  graphKind?: "draft" | "plan";
  /** The component fills its parent, which needs an explicit height. */
  className?: string;
  style?: CSSProperties;
};

function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev && Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
          ? prev
          : { w: width, h: height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function layoutBounds(layout: GraphLayout) {
  let width = 0;
  let height = 0;
  for (const [id, pos] of Object.entries(layout.positions)) {
    width = Math.max(width, pos.x + layout.sizes[id].width);
    height = Math.max(height, pos.y + layout.sizes[id].height);
  }
  return { width, height };
}

/** Narrow screens: fit the width, start at the top, and let the user pan down. */
function narrowViewport(layout: GraphLayout, containerWidth: number): Viewport {
  const { width } = layoutBounds(layout);
  const zoom = Math.min(1, Math.max(0.2, (containerWidth - 2 * FIT_PADDING) / Math.max(width, 1)));
  return { x: (containerWidth - width * zoom) / 2, y: FIT_PADDING, zoom };
}

/** Re-fits the view when nodes are added or removed (not on edits to text, scope or progress). */
function AutoFit({
  signature,
  narrow,
  layout,
  containerWidth,
}: {
  signature: string;
  narrow: boolean;
  layout: GraphLayout;
  containerWidth: number;
}) {
  const { fitView, setViewport } = useReactFlow();
  const previous = useRef(signature);
  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;
    const timer = setTimeout(() => {
      if (narrow) void setViewport(narrowViewport(layout, containerWidth), { duration: 250 });
      else void fitView({ padding: 0.06, minZoom: 0.3, maxZoom: 1, duration: 250 });
    }, 60);
    return () => clearTimeout(timer);
  }, [signature, narrow, layout, containerWidth, fitView, setViewport]);
  return null;
}

export type NodeAction = "known" | "excluded" | "delete";

function enablePointerEvents() {}

export function TopicGraph({
  graph,
  mode,
  highlightIds = EMPTY_IDS,
  progress = EMPTY_PROGRESS,
  onNodeClick,
  onNodeAction,
  onAddTopic,
  onOps,
  graphKind,
  className,
  style,
}: TopicGraphProps) {
  const [rootRef, size] = useElementSize();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ x: number; y: number } | null>(null);

  // A new highlightIds array restarts the pulse. State is adjusted during render (not in an
  // effect) so the first paint already carries the ring.
  const [seenIds, setSeenIds] = useState(highlightIds);
  const [pulseKey, setPulseKey] = useState(0);
  if (seenIds !== highlightIds) {
    setSeenIds(highlightIds);
    setPulseKey((k) => k + 1);
  }

  const narrow = size !== null && size.w < NARROW_PX;
  const layout = useMemo(
    () => layoutGraph(
      graph,
      narrow ? { leafColumns: 1, nodeWidth: NARROW_NODE_WIDTH } : { leafColumns: 3 },
    ),
    [graph, narrow],
  );

  const editing = mode === "edit";
  const selectedNode = editing ? graph.nodes.find((n) => n.id === selectedId) : undefined;

  const handleSelect = useCallback(
    (id: string) => {
      const node = graph.nodes.find((n) => n.id === id);
      if (!node) return;
      onNodeClick?.(node);
      if (editing) setSelectedId(id);
    },
    [graph, onNodeClick, editing],
  );

  const closeInspector = useCallback(() => {
    const id = selectedId;
    setSelectedId(null);
    // Hand focus back to the node that opened the inspector.
    if (id) {
      requestAnimationFrame(() => {
        rootRef.current?.querySelector<HTMLElement>(`[data-tg-node="${id}"]`)?.focus();
      });
    }
  }, [selectedId, rootRef]);

  const nodes = useMemo<TopicFlowNode[]>(() => {
    const resolved = resolveProgress(graph, progress);
    const highlighted = new Set(highlightIds);
    // Containers are decided by the layout, so a node with a dangling parentId stays a plain card.
    const childCounts = new Map<string, number>();
    for (const parent of Object.values(layout.parentOf)) childCounts.set(parent, (childCounts.get(parent) ?? 0) + 1);
    const toNode = (node: DraftNode): TopicFlowNode => {
      const childCount = childCounts.get(node.id) ?? 0;
      const container = childCount > 0;
      const parentId = layout.parentOf[node.id];
      const pos = layout.positions[node.id];
      const parentPos = parentId ? layout.positions[parentId] : undefined;
      const { width, height } = layout.sizes[node.id];
      return {
        id: node.id,
        type: container ? "container" : "topic",
        position: parentPos ? { x: pos.x - parentPos.x, y: pos.y - parentPos.y } : pos,
        parentId,
        width,
        height,
        style: { width, height },
        draggable: false,
        selectable: false,
        focusable: false,
        data: {
          node,
          minutes: container ? containerMinutes(graph, node.id) : node.estMinutes,
          childCount,
          progress: resolved[node.id],
          pulseKey: highlighted.has(node.id) ? pulseKey : null,
          selected: node.id === selectedId && editing,
          onSelect: handleSelect,
          onAction: onNodeAction,
        },
      };
    };
    // React Flow needs a parent before its children; tab order then follows reading order.
    const result: TopicFlowNode[] = [];
    for (const node of graph.nodes) {
      if (layout.parentOf[node.id]) continue;
      result.push(toNode(node));
      for (const child of graph.nodes) if (layout.parentOf[child.id] === node.id) result.push(toNode(child));
    }
    return result;
  }, [graph, layout, progress, highlightIds, pulseKey, selectedId, editing, handleSelect, onNodeAction]);

  const edges = useMemo<FlowEdge[]>(() => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    return graph.edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e): FlowEdge => {
        const faded = byId.get(e.source)?.scope === "excluded" || byId.get(e.target)?.scope === "excluded";
        const prerequisite = e.kind === "prerequisite";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "smoothstep",
          focusable: false,
          selectable: false,
          markerEnd: prerequisite
            ? { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#a3948a" }
            : undefined,
          style: {
            stroke: prerequisite ? "#a3948a" : "#c4b5a6",
            strokeWidth: prerequisite ? 2 : 1.5,
            strokeDasharray: prerequisite ? undefined : "6 5",
            opacity: faded ? 0.35 : 1,
          },
        };
      });
  }, [graph]);

  const signature = useMemo(() => graph.nodes.map((n) => n.id).join(","), [graph]);
  const isPlan = graphKind ? graphKind === "plan" : looksLikePlanGraph(graph);

  return (
    <div
      ref={rootRef}
      className={`tg-root relative h-full w-full min-h-[320px] overflow-hidden ${className ?? ""}`}
      style={style}
      data-testid="topic-graph"
      data-mode={mode}
    >
      {size !== null && size.w > 0 && size.h > 0 && (
        <ReactFlow
          // Remount when the layout flavour changes so the first viewport is right.
          key={narrow ? "narrow" : "wide"}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          minZoom={0.2}
          maxZoom={2}
          fitView={!narrow}
          fitViewOptions={{ padding: 0.06, minZoom: 0.3, maxZoom: 1 }}
          defaultViewport={narrow ? narrowViewport(layout, size.w) : undefined}
          onPaneClick={() => {
            setComposer(null);
            if (editing && selectedId) closeInspector();
          }}
          onPaneContextMenu={(event) => {
            if (!onAddTopic) return;
            event.preventDefault();
            const rect = rootRef.current?.getBoundingClientRect();
            if (!rect) return;
            setComposer({
              x: Math.min(Math.max(8, event.clientX - rect.left), Math.max(8, rect.width - 268)),
              y: Math.min(Math.max(8, event.clientY - rect.top), Math.max(8, rect.height - 84)),
            });
          }}
          // React Flow sets pointer-events: none on nodes that are neither selectable, draggable
          // nor clickable; the cards handle clicks themselves, so this only turns them back on.
          onNodeClick={enablePointerEvents}
          aria-label={`Topic graph: ${graph.title}`}
        >
          <Controls showInteractive={false} position="bottom-left" />
          <AutoFit signature={signature} narrow={narrow} layout={layout} containerWidth={size.w} />
        </ReactFlow>
      )}
      {composer && onAddTopic && (
        <form
          className="tg-composer"
          style={{ left: composer.x, top: composer.y }}
          onSubmit={(event) => {
            event.preventDefault();
            const title = new FormData(event.currentTarget).get("topic");
            if (typeof title === "string" && title.trim()) onAddTopic(title.trim());
            setComposer(null);
          }}
        >
          <input
            name="topic"
            autoFocus
            maxLength={80}
            placeholder="Add a topic…"
            aria-label="Add a topic"
            className="tg-field"
            onKeyDown={(event) => event.key === "Escape" && setComposer(null)}
            onBlur={() => setComposer(null)}
          />
          <span className="tg-composer-hint">Enter to add, Esc to cancel</span>
        </form>
      )}
      {editing && selectedNode && onOps && (
        <Inspector
          graph={graph}
          node={selectedNode}
          isPlan={isPlan}
          onOps={onOps}
          onClose={closeInspector}
        />
      )}
    </div>
  );
}

export default TopicGraph;

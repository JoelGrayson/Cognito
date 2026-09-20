"use client";

import { useState } from "react";
import { TopicGraph } from "@/components/TopicGraph";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { applyOps, applyPlanOps } from "@/lib/graph/applyOps";
import { validateGraph } from "@/lib/graph/validate";
import { GraphOp, type DraftGraph, type PlanGraph, type Progress } from "@/types/learning";

type Kind = "plan" | "draft";

type LogEntry = {
  n: number;
  ops: GraphOp[];
  opsSchema: string | null; // null when every op parses
  applied: boolean;
  validation: string; // "ok" or the error list
};

const PROGRESS_STATES: Progress[] = ["todo", "in_progress", "done"];

// The same fixture as a DraftGraph: objectives removed, so the inspector says "Delete".
function toDraft(graph: PlanGraph): DraftGraph {
  return { ...graph, nodes: graph.nodes.map(({ objectives, ...rest }) => (void objectives, rest)) };
}

function freshGraph(kind: Kind): PlanGraph | DraftGraph {
  return kind === "plan" ? structuredClone(samplePlanGraph) : toDraft(samplePlanGraph);
}

export function DevGraph() {
  const [mode, setMode] = useState<"edit" | "view">("edit");
  const [kind, setKind] = useState<Kind>("plan");
  const [graph, setGraph] = useState<PlanGraph | DraftGraph>(() => freshGraph("plan"));
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [highlightText, setHighlightText] = useState("vector_basics, matrices, backprop");
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [progressTarget, setProgressTarget] = useState("vector_basics");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [clicked, setClicked] = useState<string>("none");

  const validation = validateGraph(graph);
  const ids = graph.nodes.map((n) => n.id);

  function switchKind(next: Kind) {
    setKind(next);
    setGraph(freshGraph(next));
    setLog([]);
    setProgress({});
  }

  function handleOps(ops: GraphOp[]) {
    const parsed = ops.map((op) => GraphOp.safeParse(op));
    const schemaError = parsed.find((p) => !p.success);
    const base = {
      n: log.length + 1,
      ops,
      opsSchema: schemaError && !schemaError.success ? schemaError.error.message : null,
    };
    try {
      const next =
        kind === "plan" ? applyPlanOps(graph as PlanGraph, ops) : applyOps(graph as DraftGraph, ops);
      const result = validateGraph(next);
      if (result.ok) {
        setGraph(next);
        setLog((prev) => [{ ...base, applied: true, validation: "ok" }, ...prev]);
      } else {
        setLog((prev) => [{ ...base, applied: false, validation: result.errors.join("; ") }, ...prev]);
      }
    } catch (error) {
      setLog((prev) => [
        { ...base, applied: false, validation: `${error instanceof Error ? error.name : "Error"}: ${String(error instanceof Error ? error.message : error)}` },
        ...prev,
      ]);
    }
  }

  function fireHighlight(list: string[]) {
    // A fresh array each time retriggers the pulse, even for the same ids.
    setHighlightIds(list.filter((id) => ids.includes(id)));
  }

  function setNodeProgress(target: string, value: Progress) {
    setProgress((prev) => {
      if (target === "__all__") {
        return Object.fromEntries(graph.nodes.filter((n) => !graph.nodes.some((c) => c.parentId === n.id)).map((n) => [n.id, value]));
      }
      return { ...prev, [target]: value };
    });
  }

  const button = "rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black";
  const idle = "border-[#cfcdc6] bg-white hover:bg-[#f3f3ef]";
  const active = "border-(--wb-primary) bg-(--wb-primary) text-(--wb-card) hover:opacity-90";

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5">
      <header>
        <h1 className="text-xl font-semibold">TopicGraph playground</h1>
        <p className="text-sm text-[#5c5c58]">
          {graph.nodes.length} nodes, {graph.edges.length} edges. Graph validation:{" "}
          <strong data-testid="graph-validation" className={validation.ok ? "text-[#12703f]" : "text-[#a12622]"}>
            {validation.ok ? "ok" : validation.errors.join("; ")}
          </strong>
        </p>
      </header>

      <section aria-label="Controls" className="grid gap-3 rounded-lg bg-[#f8f8f6] p-3 text-sm md:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Mode</span>
          {(["edit", "view"] as const).map((m) => (
            <button key={m} type="button" className={`${button} ${mode === m ? active : idle}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
          <span className="ml-3 font-semibold">Graph</span>
          {(["plan", "draft"] as const).map((k) => (
            <button key={k} type="button" className={`${button} ${kind === k ? active : idle}`} aria-pressed={kind === k} onClick={() => switchKind(k)}>
              {k}
            </button>
          ))}
          <button type="button" className={`${button} ${idle}`} onClick={() => switchKind(kind)}>Reset graph</button>
        </div>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            fireHighlight(highlightText.split(/[\s,]+/).filter(Boolean));
          }}
        >
          <label htmlFor="hl" className="font-semibold">Highlight ids</label>
          <input
            id="hl"
            className="min-w-0 flex-1 rounded-md border border-[#cfcdc6] bg-white px-2 py-1.5"
            value={highlightText}
            onChange={(event) => setHighlightText(event.target.value)}
          />
          <button type="submit" className={`${button} ${idle}`}>Highlight</button>
          <button type="button" className={`${button} ${idle}`} onClick={() => fireHighlight(ids.filter((id) => graph.nodes.find((n) => n.id === id)?.parentId === "matrices"))}>
            Matrices children
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <label htmlFor="pt" className="font-semibold">Progress</label>
          <select id="pt" className="rounded-md border border-[#cfcdc6] bg-white px-2 py-1.5" value={progressTarget} onChange={(event) => setProgressTarget(event.target.value)}>
            <option value="__all__">all leaves</option>
            {graph.nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.id}</option>
            ))}
          </select>
          {PROGRESS_STATES.map((p) => (
            <button key={p} type="button" className={`${button} ${idle}`} onClick={() => setNodeProgress(progressTarget, p)}>
              {p}
            </button>
          ))}
          <button type="button" className={`${button} ${idle}`} onClick={() => setProgress({})}>Clear</button>
          <button
            type="button"
            className={`${button} ${idle}`}
            onClick={() =>
              setProgress({
                vector_basics: "done", dot_product: "done", norms: "done",
                matrix_basics: "done", matrix_multiplication: "in_progress",
              })
            }
          >
            Demo progress
          </button>
        </div>
      </section>

      <div className="h-[75vh] min-h-[540px] overflow-hidden rounded-lg border border-[#dddcd7]" data-testid="graph-frame">
        <TopicGraph
          graph={graph}
          mode={mode}
          graphKind={kind}
          highlightIds={highlightIds}
          progress={progress}
          onNodeClick={(node) => setClicked(node.id)}
          onOps={handleOps}
        />
      </div>

      <section aria-label="Emitted ops" className="rounded-lg bg-[#f8f8f6] p-3 text-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Emitted ops <span className="font-normal text-[#5c5c58]">(last click: <code data-testid="last-click">{clicked}</code>)</span></h2>
          <button type="button" className={`${button} ${idle}`} onClick={() => setLog([])}>Clear</button>
        </div>
        {log.length === 0 ? (
          <p className="text-[#5c5c58]">Nothing yet. In edit mode, click a node and change something.</p>
        ) : (
          <ol className="flex flex-col gap-2" data-testid="ops-log">
            {log.map((entry) => (
              <li key={entry.n} className="rounded-md bg-white p-2" data-testid="ops-entry">
                <p className="mb-1">
                  <strong>#{entry.n}</strong>{" "}
                  ops schema: <span className={entry.opsSchema ? "text-[#a12622]" : "text-[#12703f]"}>{entry.opsSchema ?? "ok"}</span>
                  {" | "}
                  {kind === "plan" ? "applyPlanOps" : "applyOps"} + validateGraph:{" "}
                  <span className={entry.validation === "ok" ? "text-[#12703f]" : "text-[#a12622]"} data-testid="ops-validation">{entry.validation}</span>
                  {" | "}
                  {entry.applied ? "applied" : "not applied"}
                </p>
                <pre className="overflow-x-auto text-xs">{JSON.stringify(entry.ops, null, 1)}</pre>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

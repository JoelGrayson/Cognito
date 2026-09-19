/**
 * Prompt eval for generateGraph and editGraph.
 *
 *   node_modules/.bin/tsx --env-file=.env.local scripts/eval-graph.ts        # real API
 *   MOCK_AI=true node_modules/.bin/tsx scripts/eval-graph.ts                 # smoke test, no API
 *
 * Runs generateGraph over 10 varied profiles and editGraph over 5 canned chat instructions, one call at a
 * time, and prints first-try validation pass rate, pass rate after the single retry, node counts, cycle
 * counts and latency. Mock numbers are NOT measurements of prompt quality.
 */
import { AiValidationError, editGraph, generateGraph, type AttemptReport } from "@/lib/ai";
import { isMockAi } from "@/lib/ai/client";
import { FAST_MODEL, STRONG_MODEL } from "@/lib/ai/models";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { applyOps } from "@/lib/graph/applyOps";
import { validateGraph } from "@/lib/graph/validate";
import type { DraftGraph, GraphOp, LearnerProfile } from "@/types/learning";

const prefs = (pace: "relaxed" | "steady" | "intense" = "steady") =>
  ({ formats: ["reading", "practice"] as ("reading" | "practice")[], pace });

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const PROFILES: LearnerProfile[] = [
  {
    goal: "learn enough linear algebra to understand neural networks",
    goalType: "curiosity", deadline: inDays(42), hoursPerWeek: 4,
    priorKnowledge: [{ concept: "Vectors", level: 1 }, { concept: "Matrices", level: 0 }, { concept: "Derivatives", level: 2 }],
    preferences: prefs(),
  },
  {
    goal: "prepare for the AWS Solutions Architect Associate exam",
    goalType: "exam", deadline: inDays(56), hoursPerWeek: 10,
    priorKnowledge: [{ concept: "Networking basics", level: 2 }, { concept: "IAM", level: 0 }, { concept: "S3", level: 1 }],
    preferences: prefs("intense"),
  },
  {
    goal: "become a backend engineer using Rust",
    goalType: "career", hoursPerWeek: 8,
    priorKnowledge: [{ concept: "Rust basics", level: 0 }, { concept: "HTTP", level: 2 }, { concept: "SQL", level: 1 }],
    preferences: prefs(),
  },
  {
    goal: "hold a basic conversation in Spanish for a trip",
    goalType: "project", deadline: inDays(90), hoursPerWeek: 3,
    priorKnowledge: [{ concept: "Greetings", level: 2 }, { concept: "Verb conjugation", level: 0 }],
    preferences: prefs("relaxed"),
  },
  {
    goal: "understand how the immune system works",
    goalType: "curiosity", hoursPerWeek: 2,
    priorKnowledge: [],
    preferences: prefs("relaxed"),
  },
  {
    goal: "pass AP Calculus BC",
    goalType: "exam", deadline: inDays(70), hoursPerWeek: 12,
    priorKnowledge: [{ concept: "Limits", level: 2 }, { concept: "Derivatives", level: 2 }, { concept: "Integrals", level: 1 }, { concept: "Series", level: 0 }],
    preferences: prefs("intense"),
  },
  {
    goal: "build and ship a personal website with React",
    goalType: "project", deadline: inDays(21), hoursPerWeek: 20,
    priorKnowledge: [{ concept: "HTML", level: 2 }, { concept: "CSS", level: 1 }, { concept: "JavaScript", level: 1 }, { concept: "React", level: 0 }],
    preferences: prefs("intense"),
  },
  {
    goal: "learn music theory well enough to write my own songs",
    goalType: "curiosity", hoursPerWeek: 5,
    priorKnowledge: [{ concept: "Reading notes", level: 1 }, { concept: "Chords", level: 0 }, { concept: "Scales", level: 1 }],
    preferences: prefs(),
  },
  {
    goal: "get started in machine learning for a data science job",
    goalType: "career", deadline: inDays(120), hoursPerWeek: 6,
    priorKnowledge: [{ concept: "Python", level: 2 }, { concept: "Statistics", level: 1 }, { concept: "Linear algebra", level: 0 }, { concept: "Pandas", level: 1 }],
    preferences: prefs(),
  },
  {
    goal: "understand personal finance and start investing",
    goalType: "curiosity", deadline: inDays(30), hoursPerWeek: 2,
    priorKnowledge: [{ concept: "Budgeting", level: 2 }, { concept: "Index funds", level: 0 }],
    preferences: prefs("relaxed"),
    constraints: "I only want the essentials, no crypto.",
  },
];

const INSTRUCTIONS = [
  "skip the calculus, I only have 3 hours a week",
  "add a section on probability and statistics",
  "I already know the first topic well, mark it as known",
  "this is too much, cut it down to the essentials",
  "make the last core topic optional and rename it to something friendlier",
];

interface Run {
  label: string;
  ok: boolean;
  attempts: AttemptReport[];
  ms: number;
  nodes?: number;
  note?: string;
}

async function timed<T>(label: string, fn: (onAttempt: (r: AttemptReport) => void) => Promise<T>) {
  const attempts: AttemptReport[] = [];
  const started = Date.now();
  let value: T | undefined;
  let error: unknown;
  try {
    value = await fn((r) => attempts.push(r));
  } catch (e) {
    error = e;
  }
  return { label, value, error, attempts, ms: Date.now() - started };
}

const percentile = (sorted: number[], p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : 0;
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${Math.round((n / d) * 100)}% (${n}/${d})`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function describeError(error: unknown): string {
  if (error instanceof AiValidationError) return `validation failed after retry: ${error.issues.slice(0, 3).join(" | ")}`;
  return `error: ${error instanceof Error ? error.message : String(error)}`;
}

function summarize(title: string, runs: Run[]) {
  const firstTry = runs.filter((r) => r.attempts[0]?.ok).length;
  const afterRetry = runs.filter((r) => r.ok).length;
  const retried = runs.filter((r) => r.attempts.length > 1).length;
  const cycles = runs.reduce((n, r) => n + r.attempts.filter((a) => a.issues.some((i) => /cycle/i.test(i))).length, 0);
  const latencies = runs.map((r) => r.ms).sort((a, b) => a - b);
  const nodeCounts = runs.flatMap((r) => (r.nodes === undefined ? [] : [r.nodes]));
  console.log(`\n== ${title} (n=${runs.length}) ==`);
  console.log(`first-try validation pass rate : ${pct(firstTry, runs.length)}`);
  console.log(`pass rate after one retry      : ${pct(afterRetry, runs.length)}`);
  console.log(`runs that needed the retry     : ${retried}`);
  console.log(`attempts that contained a cycle: ${cycles}`);
  if (nodeCounts.length) console.log(`average node count (successes) : ${(nodeCounts.reduce((a, b) => a + b, 0) / nodeCounts.length).toFixed(1)}`);
  console.log(`latency p50 / max              : ${secs(percentile(latencies, 0.5))} / ${secs(latencies[latencies.length - 1] ?? 0)}`);
  for (const r of runs) {
    const tries = r.attempts.map((a) => (a.ok ? "ok" : "fail")).join(",") || "-";
    console.log(`  ${r.ok ? "PASS" : "FAIL"} ${secs(r.ms).padStart(6)} attempts[${tries}] ${r.label}${r.note ? `  -> ${r.note}` : ""}`);
  }
}

async function main() {
  const mock = isMockAi();
  if (!mock && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Use --env-file=.env.local, or MOCK_AI=true for a smoke test.");
    process.exit(1);
  }
  console.log(`eval-graph: ${mock ? "MOCK_AI=true (mock results, NOT a measurement of the prompts)" : `real API, generateGraph=${STRONG_MODEL}, editGraph=${FAST_MODEL}`}`);
  console.log(`date: ${new Date().toISOString().slice(0, 10)}`);

  // generateGraph over the profiles
  const generated: DraftGraph[] = [];
  const genRuns: Run[] = [];
  for (const profile of PROFILES) {
    const r = await timed(profile.goal.slice(0, 60), (onAttempt) => generateGraph(profile, { onAttempt }));
    const graph = r.value;
    if (graph) generated.push(graph);
    genRuns.push({ label: r.label, ok: Boolean(graph), attempts: r.attempts, ms: r.ms, nodes: graph?.nodes.length, note: r.error ? describeError(r.error) : undefined });
  }
  summarize("generateGraph", genRuns);

  // editGraph over canned instructions, each on the same base graph with a user edit already applied
  const base = generated[0] ?? samplePlanGraph;
  const renameTarget = base.nodes.find((n) => n.kind === "optional") ?? base.nodes[base.nodes.length - 1];
  const userEditLog: GraphOp[] = [{ op: "update_node", id: renameTarget.id, patch: { title: "My renamed topic" } }];
  const editBase = applyOps(base, userEditLog);
  const profile = PROFILES[0];
  const editRuns: Run[] = [];
  let reverts = 0;
  for (const message of INSTRUCTIONS) {
    const r = await timed(message.slice(0, 60), (onAttempt) =>
      editGraph({ profile, graph: editBase, userEditLog, messages: [], message }, { onAttempt }),
    );
    let note = r.error ? describeError(r.error) : r.value ? `${r.value.ops.length} ops: ${r.value.message.slice(0, 90)}` : undefined;
    if (r.value) {
      const next = applyOps(editBase, r.value.ops);
      const kept = next.nodes.find((n) => n.id === renameTarget.id)?.title === "My renamed topic";
      const touchedIt = r.value.ops.some((op) => (op.op === "update_node" || op.op === "remove_node") && op.id === renameTarget.id);
      if (!kept && !touchedIt) reverts++;
      if (!validateGraph(next).ok) note = `INVALID result: ${note}`;
    }
    editRuns.push({ label: r.label, ok: Boolean(r.value), attempts: r.attempts, ms: r.ms, note });
  }
  summarize("editGraph", editRuns);
  console.log(`user-edit reverts detected     : ${reverts}`);

  const genPassed = genRuns.filter((r) => r.ok).length;
  console.log(`\nTarget: at least 9/10 generateGraph runs valid after one retry. Result: ${genPassed}/10 ${genPassed >= 9 ? "(met)" : "(NOT met)"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

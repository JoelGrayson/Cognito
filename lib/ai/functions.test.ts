import { describe, expect, it } from "vitest";
import { samplePlanGraph } from "@/fixtures/samplePlanGraph";
import { sampleProfile } from "@/fixtures/sampleProfile";
import { validateGraph } from "@/lib/graph/validate";
import type { DraftGraph, DraftNode, GraphOp } from "@/types/learning";
import { fakeClient, toolUse } from "./fakeClient";
import { editGraph } from "./functions/editGraph";
import { enrichModule, fallbackObjectives } from "./functions/enrichModule";
import { generateGraph } from "./functions/generateGraph";
import { mockGenerateGraph } from "./mock/graph";
import { FAST_MODEL, STRONG_MODEL } from "./models";
import { TOOLS, toInputSchema } from "./tools";
import { AiValidationError, type AttemptReport } from "./withRetry";

const draft = (): Promise<DraftGraph> => mockGenerateGraph(sampleProfile);

describe("tool definitions", () => {
  it("derives an object JSON schema for every tool", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["set_concepts", "set_graph", "edit_graph", "set_objectives"]);
    for (const tool of TOOLS) {
      const json = toInputSchema(tool.schema) as Record<string, unknown>;
      expect(json.type, tool.name).toBe("object");
      expect(json.$schema).toBeUndefined();
      expect(JSON.stringify(json), tool.name).not.toContain("$ref");
    }
  });

  it("describes GraphOp as a oneOf over the five ops", () => {
    const edit = TOOLS.find((t) => t.name === "edit_graph")!;
    const json = JSON.stringify(toInputSchema(edit.schema));
    for (const op of ["add_node", "update_node", "remove_node", "add_edge", "remove_edge"]) {
      expect(json).toContain(`"const":"${op}"`);
    }
  });
});

describe("generateGraph (fake client)", () => {
  it("forces set_graph on the fast model and returns a valid graph", async () => {
    const graph = await draft();
    const { client, create } = fakeClient(toolUse("set_graph", graph));
    const reports: AttemptReport[] = [];
    const result = await generateGraph(sampleProfile, { client, onAttempt: (r) => reports.push(r) });
    expect(result).toEqual(graph);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe(FAST_MODEL);
    expect(params.tool_choice).toEqual({ type: "tool", name: "set_graph" });
    expect(params.tools[0].name).toBe("set_graph");
    expect(params.messages[0].content).toContain(sampleProfile.goal);
    expect(reports.map((r) => r.ok)).toEqual([true]);
  });

  it("lists every validateGraph error in the retry message, then succeeds", async () => {
    const good = await draft();
    const bad: DraftGraph = {
      ...good,
      edges: [
        ...good.edges,
        { id: "matrices__vectors", source: "matrices", target: "vectors", kind: "prerequisite" }, // cycle
        { id: "ghost_edge", source: "vectors", target: "nowhere", kind: "related" }, // dangling
      ],
    };
    const expected = validateGraph(bad);
    expect(expected.ok).toBe(false);
    const { client, create } = fakeClient(toolUse("set_graph", bad), toolUse("set_graph", good, "tu_2"));
    const reports: AttemptReport[] = [];
    await generateGraph(sampleProfile, { client, onAttempt: (r) => reports.push(r) });
    expect(create).toHaveBeenCalledTimes(2);
    const retry = create.mock.calls[1][0].messages;
    expect(retry[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1", is_error: true });
    const content: string = retry[2].content[0].content;
    if (!expected.ok) for (const error of expected.errors) expect(content).toContain(error);
    expect(reports.map((r) => [r.attempt, r.ok])).toEqual([[1, false], [2, true]]);
    expect(reports[0].issues.some((i) => /cycle/i.test(i))).toBe(true);
  });

  it("retries on zod failures too", async () => {
    const good = await draft();
    const { client, create } = fakeClient(toolUse("set_graph", { title: "x", nodes: "nope" }), toolUse("set_graph", good, "tu_2"));
    await generateGraph(sampleProfile, { client });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws AiValidationError when the second attempt is invalid too", async () => {
    const good = await draft();
    const cyclic: DraftGraph = { ...good, edges: [...good.edges, { id: "back", source: "matrices", target: "vectors", kind: "prerequisite" }] };
    const { client, create } = fakeClient(toolUse("set_graph", cyclic));
    const error = await generateGraph(sampleProfile, { client }).catch((e) => e);
    expect(error).toBeInstanceOf(AiValidationError);
    expect(error.issues.join(" ")).toMatch(/cycle/i);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("editGraph (fake client)", () => {
  const base = async () => ({
    profile: sampleProfile,
    graph: await draft(),
    userEditLog: [{ op: "update_node", id: "tensors", patch: { title: "Tensor tricks" } }] as GraphOp[],
    messages: Array.from({ length: 8 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `chat line ${i}` })),
    message: "skip the calculus",
  });
  const goodOps: GraphOp[] = [{ op: "update_node", id: "gradients", patch: { scope: "excluded" } }];

  it("forces edit_graph on the fast model and sends compact context", async () => {
    const input = await base();
    const { client, create } = fakeClient(toolUse("edit_graph", { message: "Done.", ops: goodOps }));
    const result = await editGraph(input, { client });
    expect(result).toEqual({ message: "Done.", ops: goodOps });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe(FAST_MODEL);
    expect(params.tool_choice).toEqual({ type: "tool", name: "edit_graph" });
    const prompt: string = params.messages[0].content;
    expect(prompt).toContain("gradients | Multivariable calculus | core | included | - | 0");
    expect(prompt).toContain("vectors>matrices (prerequisite)");
    expect(prompt).toContain("Tensor tricks"); // the user's edit log
    expect(prompt).toContain("skip the calculus");
    expect(prompt).toContain("chat line 7");
    expect(prompt).toContain("chat line 2");
    expect(prompt).not.toContain("chat line 1"); // only the last 6 messages
    expect(prompt).toContain("Time budget:");
    expect(params.system).toMatch(/ground truth/);
  });

  it("feeds a GraphOpError (missing id) back and retries", async () => {
    const input = await base();
    const missing: GraphOp[] = [{ op: "remove_node", id: "not_a_node" }];
    const { client, create } = fakeClient(
      toolUse("edit_graph", { message: "Removed it.", ops: missing }),
      toolUse("edit_graph", { message: "Done.", ops: goodOps }, "tu_2"),
    );
    const reports: AttemptReport[] = [];
    const result = await editGraph(input, { client, onAttempt: (r) => reports.push(r) });
    expect(result.ops).toEqual(goodOps);
    const feedback: string = create.mock.calls[1][0].messages[2].content[0].content;
    expect(feedback).toContain("not_a_node");
    expect(reports.map((r) => r.ok)).toEqual([false, true]);
  });

  it("rejects ops that create a cycle, retries, then throws AiValidationError", async () => {
    const input = await base();
    const cycle: GraphOp[] = [
      { op: "add_edge", edge: { id: "matrices__vectors", source: "matrices", target: "vectors", kind: "prerequisite" } },
    ];
    const { client, create } = fakeClient(toolUse("edit_graph", { message: "Linked.", ops: cycle }));
    const error = await editGraph(input, { client }).catch((e) => e);
    expect(error).toBeInstanceOf(AiValidationError);
    expect(error.issues.join(" ")).toMatch(/cycle/i);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("rejects ops that leave a dangling reference", async () => {
    const input = await base();
    const dangling: GraphOp[] = [{ op: "add_edge", edge: { id: "x", source: "vectors", target: "ghost", kind: "related" } }];
    const { client } = fakeClient(toolUse("edit_graph", { message: "Ok.", ops: dangling }));
    await expect(editGraph(input, { client })).rejects.toBeInstanceOf(AiValidationError);
  });

  it("accepts an empty ops list (a message-only reply)", async () => {
    const input = await base();
    const { client } = fakeClient(toolUse("edit_graph", { message: "Which topic do you mean?", ops: [] }));
    expect(await editGraph(input, { client })).toEqual({ message: "Which topic do you mean?", ops: [] });
  });
});

describe("enrichModule (fake client)", () => {
  const core = samplePlanGraph.nodes.find((n) => n.id === "gradients")!;
  const leaves: DraftNode[] = samplePlanGraph.nodes.filter((n) => n.parentId === "gradients");
  const entry = (id: string, extra: object = {}) => ({
    id,
    objectives: ["Explain the idea in your own words", "Compute a small worked example by hand"],
    ...extra,
  });
  const valid = { nodes: leaves.map((n) => entry(n.id, { estMinutes: 60 })) };
  const input = { profile: sampleProfile, coreNode: core, nodes: leaves };

  it("forces set_objectives on the strong model and returns objectives per leaf", async () => {
    const { client, create } = fakeClient(toolUse("set_objectives", valid));
    expect(await enrichModule(input, { client })).toEqual(valid);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe(STRONG_MODEL);
    expect(params.tool_choice).toEqual({ type: "tool", name: "set_objectives" });
    expect(params.messages[0].content).toContain("partial_derivatives");
  });

  it("retries when a requested leaf is missing", async () => {
    const missing = { nodes: valid.nodes.slice(1) };
    const { client, create } = fakeClient(toolUse("set_objectives", missing), toolUse("set_objectives", valid, "tu_2"));
    await enrichModule(input, { client });
    expect(create.mock.calls[1][0].messages[2].content[0].content).toContain('Missing topic id "partial_derivatives"');
  });

  it("rejects extra ids", async () => {
    const extra = { nodes: [...valid.nodes, entry("bonus_topic")] };
    const { client } = fakeClient(toolUse("set_objectives", extra));
    const error = await enrichModule(input, { client }).catch((e) => e);
    expect(error).toBeInstanceOf(AiValidationError);
    expect(error.issues.join(" ")).toContain('Unknown topic id "bonus_topic"');
  });

  it("rejects a bare topic name as an objective", async () => {
    const bare = { nodes: valid.nodes.map((n, i) => (i === 0 ? { ...n, objectives: ["Partial derivatives", "Explain slopes of surfaces"] } : n)) };
    const { client } = fakeClient(toolUse("set_objectives", bare));
    const error = await enrichModule(input, { client }).catch((e) => e);
    expect(error).toBeInstanceOf(AiValidationError);
    expect(error.issues.join(" ")).toContain("bare topic name");
  });

  it("enforces 2 to 4 objectives, 120 characters and estMinutes 15 to 90 via zod", async () => {
    const cases = [
      { objectives: ["Explain one thing only"] },
      { objectives: ["Explain a", "Explain b", "Explain c", "Explain d", "Explain e"] },
      { objectives: ["Explain " + "x".repeat(120), "Explain the second one"] },
      { estMinutes: 5 },
      { estMinutes: 120 },
    ];
    for (const bad of cases) {
      const output = { nodes: valid.nodes.map((n, i) => (i === 0 ? { ...n, ...bad } : n)) };
      const { client } = fakeClient(toolUse("set_objectives", output));
      await expect(enrichModule(input, { client }), JSON.stringify(bad).slice(0, 40)).rejects.toBeInstanceOf(AiValidationError);
    }
  });

  it("fallbackObjectives returns the spec sentence", () => {
    expect(fallbackObjectives("Eigenvalues")).toEqual(["Explain Eigenvalues in your own words"]);
  });
});

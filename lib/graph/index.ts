export { validateGraph, MAX_NODES, type ValidationResult } from "./validate";
export { GraphOpError, applyOps, applyPlanOps } from "./applyOps";
export { topoSort } from "./topoSort";
export { touchedIds, diffGraphs } from "./diff";
export { buildFallbackGraph } from "./fallback";
export { applyKnownScope, conceptMatchesNode } from "./known";

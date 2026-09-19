/* Runs a learner's code in the browser, away from the page:
   - JavaScript (and TypeScript, once transpiled) in a module Web Worker built from a Blob.
   - Python in a Pyodide Web Worker, kept alive between runs because loading takes seconds.
   Tests are boolean expressions evaluated after the code, each on its own, so one
   failing test does not hide the others. Runaway code is stopped by terminating the worker. */

export const PYODIDE_VERSION = "314.0.7";
export const RUNNABLE = new Set(["javascript", "typescript", "python"]);

export interface TestCase {
  name: string;
  expression: string;
}
export interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
}
export interface RunResult {
  output: string[];
  error: string | null;
  results: TestResult[];
  timedOut: boolean;
  ms: number;
}

const JS_TIMEOUT_MS = 5000;
const PY_TIMEOUT_MS = 20000;
const PY_FIRST_TIMEOUT_MS = 90000;

/** Run JavaScript. TypeScript must be transpiled first (see the editor's TypeScript worker). */
export function runJavaScript(code: string, tests: TestCase[]): Promise<RunResult> {
  const checks = tests
    .map((t) => {
      const name = JSON.stringify(t.name);
      return `try { __results.push({ name: ${name}, pass: !!(${t.expression}) }); } catch (e) { __results.push({ name: ${name}, pass: false, error: String(e && e.message || e) }); }`;
    })
    .join("\n");
  const program = `
const __out = [];
const __fmt = (v) => typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
const __log = (...a) => { if (__out.length < 500) __out.push(a.map(__fmt).join(" ")); };
globalThis.console = { log: __log, info: __log, warn: __log, error: __log, debug: __log, table: __log };
const __results = [];
self.addEventListener("error", (e) => { self.postMessage({ output: __out, error: String(e.message || e), results: [] }); });
self.addEventListener("unhandledrejection", (e) => { self.postMessage({ output: __out, error: String(e.reason && e.reason.message || e.reason), results: [] }); });
${code}
;
${checks}
self.postMessage({ output: __out, error: null, results: __results });
`;
  const started = performance.now();
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([program], { type: "text/javascript" }));
    const worker = new Worker(url, { type: "module" });
    let settled = false;
    const finish = (r: Omit<RunResult, "ms">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ ...r, ms: Math.round(performance.now() - started) });
    };
    const timer = setTimeout(
      () => finish({ output: [], error: `Stopped after ${JS_TIMEOUT_MS / 1000}s. Is there an infinite loop?`, results: [], timedOut: true }),
      JS_TIMEOUT_MS,
    );
    worker.onmessage = (e: MessageEvent<Omit<RunResult, "ms" | "timedOut">>) => finish({ ...e.data, timedOut: false });
    // Syntax errors fail the module before any of it runs.
    worker.onerror = (e) => {
      e.preventDefault();
      finish({ output: [], error: e.message || "The code could not run.", results: [], timedOut: false });
    };
  });
}

/* ---------- Python (Pyodide) ---------- */

const PY_WORKER = `
importScripts("https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js");
const ready = loadPyodide();
ready.then(() => self.postMessage({ type: "ready" }));
const lastLines = (msg) => String(msg).trim().split("\\n").filter(Boolean).slice(-3).join("\\n");
self.onmessage = async (e) => {
  const { id, code, tests } = e.data;
  const py = await ready;
  const output = [];
  py.setStdout({ batched: (s) => { if (output.length < 500) output.push(s); } });
  py.setStderr({ batched: (s) => { if (output.length < 500) output.push(s); } });
  const ns = py.globals.get("dict")();
  const results = [];
  let error = null;
  try {
    await py.loadPackagesFromImports(code);
    await py.runPythonAsync(code, { globals: ns });
    for (const t of tests) {
      try {
        results.push({ name: t.name, pass: !!py.runPython("bool(" + t.expression + ")", { globals: ns }) });
      } catch (err) {
        results.push({ name: t.name, pass: false, error: lastLines(err.message) });
      }
    }
  } catch (err) {
    error = lastLines(err.message);
  }
  ns.destroy();
  self.postMessage({ type: "result", id, output, error, results });
};
`;

let pyWorker: Worker | null = null;
let pyReady = false;
let pyRunId = 0;
const readyListeners = new Set<() => void>();

function pythonWorker(): Worker {
  if (pyWorker) return pyWorker;
  const url = URL.createObjectURL(new Blob([PY_WORKER], { type: "text/javascript" }));
  pyWorker = new Worker(url);
  pyReady = false;
  pyWorker.addEventListener("message", (e: MessageEvent<{ type: string }>) => {
    if (e.data.type !== "ready") return;
    pyReady = true;
    for (const l of readyListeners) l();
  });
  return pyWorker;
}

/** Start downloading Python early; calls `onReady` once it can run code. */
export function preloadPython(onReady?: () => void): () => void {
  pythonWorker();
  if (onReady) {
    if (pyReady) onReady();
    else readyListeners.add(onReady);
  }
  return () => {
    if (onReady) readyListeners.delete(onReady);
  };
}

export function isPythonReady(): boolean {
  return pyReady;
}

export function runPython(code: string, tests: TestCase[]): Promise<RunResult> {
  const worker = pythonWorker();
  const id = ++pyRunId;
  const started = performance.now();
  const limit = pyReady ? PY_TIMEOUT_MS : PY_FIRST_TIMEOUT_MS;
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent<{ type: string; id: number } & Omit<RunResult, "ms" | "timedOut">>) => {
      if (e.data.type !== "result" || e.data.id !== id) return;
      done({ output: e.data.output, error: e.data.error, results: e.data.results, timedOut: false });
    };
    const done = (r: Omit<RunResult, "ms">) => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      resolve({ ...r, ms: Math.round(performance.now() - started) });
    };
    const timer = setTimeout(() => {
      // The only way to stop runaway Python is to throw the worker away; the next run reloads it.
      worker.terminate();
      if (pyWorker === worker) pyWorker = null;
      pyReady = false;
      done({ output: [], error: `Stopped after ${limit / 1000}s. Is there an infinite loop?`, results: [], timedOut: true });
    }, limit);
    worker.addEventListener("message", onMessage);
    worker.postMessage({ id, code, tests });
  });
}

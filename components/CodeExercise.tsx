"use client";

import Editor, { loader, type BeforeMount, type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { ensureOk } from "@/lib/ndjson";
import type { ProviderId } from "@/lib/providers/types";
import { preloadPython, RUNNABLE, runJavaScript, runPython, type RunResult, type TestCase } from "@/lib/runner";
import type { CodeReview, Exercise, Lesson } from "@/lib/schema";
import { RichText } from "./RichText";

// Load Monaco from the CDN at the same version as the installed types.
loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.56.0/min/vs" } });

type EditorInstance = Parameters<OnMount>[0];
type Model = NonNullable<ReturnType<EditorInstance["getModel"]>>;

const LABEL: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  rust: "Rust",
  go: "Go",
  java: "Java",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  sql: "SQL",
  shell: "Shell",
  ruby: "Ruby",
  kotlin: "Kotlin",
  swift: "Swift",
  php: "PHP",
};

/** Lessons with code (or formulas set as code) get a coding exercise; prose-only lessons do not. */
export function lessonWantsCode(lesson: Lesson): boolean {
  const text = lesson.sections.map((s) => s.body).join("\n");
  return text.includes("```") || (text.match(/`[^`\n]+`/g)?.length ?? 0) >= 3;
}

interface Props {
  topic: string;
  lesson: Lesson;
  providerId: ProviderId;
}

/** A hands-on exercise for a lesson in a Monaco editor; JS, TS and Python run in the browser. */
export function CodeExercise({ topic, lesson, providerId }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [tests, setTests] = useState<TestCase[]>([]);
  /** null while checking the solution against its own tests. */
  const [verified, setVerified] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [run, setRun] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [review, setReview] = useState<CodeReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [pyReady, setPyReady] = useState(false);

  const editorRef = useRef<EditorInstance | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const runRef = useRef<() => void>(() => {});
  const stopPreload = useRef<(() => void) | null>(null);
  /** New exercises requested because the starter code already passed every test. */
  const retries = useRef(0);

  const runnable = exercise ? RUNNABLE.has(exercise.language) : false;

  async function start() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/lesson/exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, lesson, provider: providerId }),
      });
      await ensureOk(res);
      const data = (await res.json()) as { exercise: Exercise };
      setExercise(data.exercise);
      setTests(data.exercise.tests);
      setCode(data.exercise.starterCode);
      setRun(null);
      setReview(null);
      setShowSolution(false);
      setVerified(RUNNABLE.has(data.exercise.language) ? null : false);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make an exercise.");
      setState("error");
    }
  }

  /** TypeScript becomes JavaScript through the editor's own TypeScript worker. */
  async function toJavaScript(model: Model): Promise<string> {
    const monaco = monacoRef.current!;
    const getWorker = await monaco.typescript.getTypeScriptWorker();
    const client = await getWorker(model.uri);
    const out = await client.getEmitOutput(model.uri.toString());
    return out.outputFiles[0]?.text ?? "";
  }

  async function execute(language: string, source: string, cases: TestCase[], model?: Model): Promise<RunResult> {
    if (language === "python") return runPython(source, cases);
    if (language === "typescript") {
      const monaco = monacoRef.current!;
      const temp = model ? null : monaco.editor.createModel(source, "typescript");
      try {
        return await runJavaScript(await toJavaScript(model ?? temp!), cases);
      } finally {
        temp?.dispose();
      }
    }
    return runJavaScript(source, cases);
  }

  /**
   * Keep only tests that mean something: the hidden solution must pass them (otherwise the
   * test is wrong) and the starter code must fail them (otherwise they test nothing). If the
   * starter already passes everything, the exercise gives the answer away, so ask for a new one.
   */
  async function verify(ex: Exercise) {
    try {
      const solved = await execute(ex.language, ex.solution, ex.tests);
      const starter = await execute(ex.language, ex.starterCode, ex.tests);
      const passBySolution = new Set(solved.results.filter((r) => r.pass).map((r) => r.name));
      const passByStarter = new Set(starter.error ? [] : starter.results.filter((r) => r.pass).map((r) => r.name));
      const meaningful = ex.tests.filter((t) => passBySolution.has(t.name) && !passByStarter.has(t.name));
      if (!solved.error && meaningful.length > 0) {
        setTests(meaningful);
        setVerified(true);
      } else if (!solved.error && passBySolution.size > 0 && retries.current < 1) {
        retries.current += 1;
        void start();
      } else {
        setVerified(false);
      }
    } catch {
      setVerified(false);
    }
  }

  async function onRun() {
    if (!exercise || !runnable || running) return;
    setRunning(true);
    try {
      const model = editorRef.current?.getModel() ?? undefined;
      setRun(await execute(exercise.language, code, tests, model));
    } finally {
      setRunning(false);
    }
  }

  async function onReview() {
    if (!exercise || reviewing) return;
    setReviewing(true);
    setReview(null);
    try {
      let latest = run;
      if (runnable) {
        const model = editorRef.current?.getModel() ?? undefined;
        latest = await execute(exercise.language, code, tests, model);
        setRun(latest);
      }
      const res = await fetch("/api/lesson/exercise/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercise: { title: exercise.title, language: exercise.language, task: exercise.task, tests },
          code,
          run: runnable && latest ? { output: latest.output, error: latest.error, results: latest.results } : null,
          provider: providerId,
        }),
      });
      await ensureOk(res);
      setReview(((await res.json()) as { review: CodeReview }).review);
    } catch (err) {
      setReview({ verdict: "incorrect", feedback: err instanceof Error ? err.message : "The tutor could not review this.", hint: "" });
    } finally {
      setReviewing(false);
    }
  }

  // The editor's Cmd/Ctrl+Enter command is registered once, so it calls the latest Run through a ref.
  useEffect(() => {
    runRef.current = () => void onRun();
  });
  useEffect(() => () => stopPreload.current?.(), []);

  const beforeMount: BeforeMount = (monaco) => {
    const ts = monaco.typescript;
    ts.typescriptDefaults.setCompilerOptions({
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      strict: true,
      noEmitOnError: false,
      allowNonTsExtensions: true,
    });
  };

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    if (!exercise) return;
    if (exercise.language === "python") stopPreload.current = preloadPython(() => setPyReady(true));
    if (RUNNABLE.has(exercise.language)) void verify(exercise);
  };

  if (state === "idle" || state === "error") {
    return (
      <section className="code-card mt-10">
        <div>
          <h2 className="lesson-h2">Practice in code</h2>
          <p className="mt-1 text-sm text-neutral-500">A short exercise on this lesson, with tests you can run in the browser.</p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
        <button type="button" className="code-btn code-btn-primary" onClick={() => void start()}>
          {state === "error" ? "Try again" : "Start coding exercise"}
        </button>
      </section>
    );
  }

  if (state === "loading" || !exercise) {
    return (
      <section className="mt-10" aria-busy="true">
        <h2 className="lesson-h2">Practice in code</h2>
        <div className="mt-3 space-y-2">
          <div className="skeleton-line w-2/3" />
          <div className="skeleton-line w-1/2" />
          <div className="skeleton code-skeleton" />
        </div>
      </section>
    );
  }

  const passed = run?.results.filter((r) => r.pass).length ?? 0;
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="lesson-h2">Practice: {exercise.title}</h2>
        <span className="code-lang">{LABEL[exercise.language] ?? exercise.language}</span>
      </div>
      <RichText text={exercise.task} className="mt-3 text-[16px] leading-relaxed text-neutral-800" />

      <div className="code-editor mt-4">
        <Editor
          height="340px"
          language={exercise.language}
          value={code}
          onChange={(value) => setCode(value ?? "")}
          beforeMount={beforeMount}
          onMount={onMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: exercise.language === "python" ? 4 : 2,
            padding: { top: 12, bottom: 12 },
          }}
          loading={<div className="code-editor-loading">Loading editor…</div>}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {runnable && (
          <button type="button" className="code-btn code-btn-primary" onClick={() => void onRun()} disabled={running}>
            {running ? "Running…" : "Run tests"} <kbd>⌘↵</kbd>
          </button>
        )}
        <button type="button" className="code-btn" onClick={() => void onReview()} disabled={reviewing}>
          {reviewing ? "Checking…" : "Check with tutor"}
        </button>
        <button type="button" className="code-btn" onClick={() => setCode(exercise.starterCode)}>
          Reset
        </button>
        <button type="button" className="code-btn" onClick={() => setShowSolution(!showSolution)}>
          {showSolution ? "Hide solution" : "Show solution"}
        </button>
        <span className="text-xs text-neutral-400">
          {exercise.language === "python" && !pyReady
            ? "Loading Python in your browser (first time takes a few seconds)…"
            : !runnable
              ? `${LABEL[exercise.language] ?? exercise.language} can't run in the browser; the tutor checks it by reading.`
              : verified === null
                ? "Checking the tests…"
                : verified
                  ? `${tests.length} tests, checked against a reference solution`
                  : "Tests could not be verified against the reference solution"}
        </span>
      </div>

      {run && (
        <div className="code-results mt-4">
          <p className="text-sm font-medium" data-ok={run.results.length > 0 && passed === run.results.length ? "true" : undefined}>
            {run.error ? "Error" : `${passed} of ${run.results.length} tests passed`}
            <span className="ml-2 font-normal text-neutral-400">{run.ms} ms</span>
          </p>
          {run.results.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {run.results.map((r) => (
                <li key={r.name} data-pass={r.pass ? "true" : "false"} className="code-test">
                  <span aria-hidden="true">{r.pass ? "✓" : "✗"}</span> {r.name}
                  {r.error && <span className="text-neutral-500"> ({r.error})</span>}
                </li>
              ))}
            </ul>
          )}
          {(run.output.length > 0 || run.error) && (
            <pre className="code-console mt-3">
              {run.output.join("\n")}
              {run.error && <span className="text-red-300">{`${run.output.length ? "\n" : ""}${run.error}`}</span>}
            </pre>
          )}
        </div>
      )}

      {review && (
        <div className="code-review mt-4" data-verdict={review.verdict}>
          <p className="text-sm font-semibold">
            {review.verdict === "correct" ? "Correct" : review.verdict === "almost" ? "Almost there" : "Not yet"}
          </p>
          <RichText text={review.feedback} className="mt-1.5 text-[15px] leading-relaxed" />
          {review.hint && <p className="mt-2 text-[15px]"><span className="font-medium">Hint:</span> {review.hint}</p>}
        </div>
      )}

      {showSolution && (
        <div className="code-editor mt-4">
          <Editor
            height="260px"
            language={exercise.language}
            value={exercise.solution}
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, automaticLayout: true }}
          />
        </div>
      )}
    </section>
  );
}

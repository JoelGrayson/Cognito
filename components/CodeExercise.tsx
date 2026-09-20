"use client";

import Editor, { loader, type BeforeMount, type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { ensureOk } from "@/lib/ndjson";
import type { ProviderId } from "@/lib/providers/types";
import { preloadPython, RUNNABLE, runJavaScript, runPython, type RunResult, type TestCase } from "@/lib/runner";
import type { CodeReview, Exercise, Lesson } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, Code2, Eye, EyeOff, Loader2, Play, RotateCcw, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
      <Card className="mt-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Code2 className="size-4 text-primary" aria-hidden="true" />
            Practice in code
          </CardTitle>
          <CardDescription>A short exercise on this lesson, with tests you can run in the browser.</CardDescription>
          <CardAction>
            <Button type="button" onClick={() => void start()}>
              {state === "error" ? "Try again" : "Start coding exercise"}
            </Button>
          </CardAction>
        </CardHeader>
        {error && (
          <CardContent>
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        )}
      </Card>
    );
  }

  if (state === "loading" || !exercise) {
    return (
      <section className="mt-10" aria-busy="true">
        <h2 className="lesson-h2">Practice in code</h2>
        <div className="mt-3 space-y-2.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </section>
    );
  }

  const passed = run?.results.filter((r) => r.pass).length ?? 0;
  const allPassed = run ? run.results.length > 0 && passed === run.results.length : false;
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="lesson-h2">Practice: {exercise.title}</h2>
        <Badge variant="outline" className="font-mono">{LABEL[exercise.language] ?? exercise.language}</Badge>
      </div>
      <RichText text={exercise.task} className="mt-3 text-[16px] leading-relaxed text-foreground/90" />

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
          <Button type="button" onClick={() => void onRun()} disabled={running}>
            {running ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
            {running ? "Running…" : "Run tests"}
            <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 font-sans text-[11px]">⌘↵</kbd>
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => void onReview()} disabled={reviewing}>
          {reviewing ? "Checking…" : "Check with tutor"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setCode(exercise.starterCode)}>
          <RotateCcw aria-hidden="true" />
          Reset
        </Button>
        <Button type="button" variant="ghost" onClick={() => setShowSolution(!showSolution)}>
          {showSolution ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          {showSolution ? "Hide solution" : "Show solution"}
        </Button>
        <span className="text-xs text-muted-foreground">
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
        <Card size="sm" className={cn("mt-4", allPassed && "bg-emerald-50 ring-emerald-600/30")}>
          <CardContent>
            <p className={cn("text-sm font-medium", allPassed && "text-emerald-800")}>
              {run.error ? "Error" : `${passed} of ${run.results.length} tests passed`}
              <span className="ml-2 font-normal text-muted-foreground">{run.ms} ms</span>
            </p>
            {run.results.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {run.results.map((r) => (
                  <li key={r.name} className={cn("flex items-start gap-2", r.pass ? "text-emerald-700" : "text-destructive")}>
                    {r.pass ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <X className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                    <span>
                      {r.name}
                      {r.error && <span className="text-muted-foreground"> ({r.error})</span>}
                    </span>
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
          </CardContent>
        </Card>
      )}

      {review && (
        <Alert
          className={cn(
            "mt-4",
            review.verdict === "correct" && "border-emerald-600/40 bg-emerald-50 text-emerald-900",
            review.verdict === "almost" && "border-amber-500/40 bg-amber-50 text-amber-900",
            review.verdict !== "correct" && review.verdict !== "almost" && "border-destructive/30 bg-destructive/5",
          )}
        >
          {review.verdict === "correct" ? <Check /> : review.verdict === "almost" ? <AlertCircle /> : <X />}
          <AlertTitle>{review.verdict === "correct" ? "Correct" : review.verdict === "almost" ? "Almost there" : "Not yet"}</AlertTitle>
          <AlertDescription className="text-current/85">
            <RichText text={review.feedback} className="text-[15px] leading-relaxed" />
            {review.hint && (
              <p className="mt-2 text-[15px]">
                <span className="font-medium">Hint:</span> {review.hint}
              </p>
            )}
          </AlertDescription>
        </Alert>
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

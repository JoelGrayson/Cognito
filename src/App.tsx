import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckRequest, CheckResponse, Mark } from "../shared/types";
import { PAGE_H, PAGE_W } from "../shared/types";
import { FeedbackPanel, type Attempt } from "./components/FeedbackPanel";
import { InkLayer } from "./components/InkLayer";
import { LayersPanel, type LayerId, type LayerState } from "./components/LayersPanel";
import { MarkLayer } from "./components/MarkLayer";
import { Toolbar } from "./components/Toolbar";
import { readFileAsDataUrl, renderQuestionPage, SAMPLE_QUESTIONS, type Doc } from "./lib/document";
import { markToPage, PEN_COLORS, renderPage, type Stroke, type Tool } from "./lib/ink";
import { useHistory } from "./lib/useHistory";

export default function App() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const ink = useHistory<Stroke[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(PEN_COLORS[0]);
  const [width, setWidth] = useState(3.5);
  const [layers, setLayers] = useState<Record<LayerId, LayerState>>({
    document: { visible: true },
    ink: { visible: true },
    marks: { visible: true },
  });

  const fileInput = useRef<HTMLInputElement>(null);
  const checkSeq = useRef(0);

  const resetInk = ink.reset;
  const openSample = useCallback(
    (i: number) => {
      const q = SAMPLE_QUESTIONS[i];
      setDoc({ id: `sample-${i}`, title: q.title, question: q.question, src: renderQuestionPage(q.title, q.question) });
      resetInk([]);
      setMarks([]);
      setAttempts([]);
      setError(null);
    },
    [resetInk],
  );

  const docRef = useRef(doc);
  docRef.current = doc;
  const inkRef = useRef(ink.value);
  inkRef.current = ink.value;
  useEffect(() => {
    if (!doc) openSample(0);
  }, [doc, openSample]);

  const { undo, redo } = ink;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    const src = await readFileAsDataUrl(file);
    setDoc({ id: `upload-${Date.now()}`, title: file.name, question: "", src });
    ink.reset([]);
    setMarks([]);
    setAttempts([]);
    setError(null);
  };

  const check = async () => {
    if (!doc) return;
    const seq = ++checkSeq.current;
    const snapshot = { doc, ink: ink.value };
    const stillCurrent = () =>
      seq === checkSeq.current && docRef.current === snapshot.doc && inkRef.current === snapshot.ink;
    setChecking(true);
    setError(null);
    try {
      const image = await renderPage(doc.src, ink.value);
      const body: CheckRequest = { image, question: doc.question || undefined };
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as CheckResponse | { error: string };
      if (!res.ok || "error" in json) throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      if (!stillCurrent()) return;
      setMarks(json.marks.map(markToPage));
      setAttempts((a) => [{ ...json, at: Date.now() }, ...a]);
      setLayers((l) => ({ ...l, marks: { visible: true } }));
    } catch (e) {
      if (stillCurrent()) setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      if (seq === checkSeq.current) setChecking(false);
    }
  };

  const clearLayer = (id: LayerId) => {
    if (id === "ink") ink.set([]);
    if (id === "marks") setMarks([]);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Draw</div>
        <select
          className="doc-select"
          value={doc?.id.startsWith("sample-") ? doc.id : "upload"}
          onChange={(e) => {
            if (e.target.value === "upload") fileInput.current?.click();
            else openSample(Number(e.target.value.replace("sample-", "")));
          }}
        >
          {SAMPLE_QUESTIONS.map((q, i) => (
            <option key={i} value={`sample-${i}`}>
              {q.title}
            </option>
          ))}
          <option value="upload">{doc?.id.startsWith("upload-") ? doc.title : "Upload an image…"}</option>
        </select>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void onUpload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Toolbar
          tool={tool}
          color={color}
          width={width}
          canUndo={ink.canUndo}
          canRedo={ink.canRedo}
          onTool={setTool}
          onColor={setColor}
          onWidth={setWidth}
          onUndo={ink.undo}
          onRedo={ink.redo}
        />
      </header>

      <main className="workspace">
        <div className="sidebar">
          <LayersPanel
            layers={layers}
            counts={{ ink: ink.value.length, marks: marks.length }}
            onToggle={(id) => setLayers((l) => ({ ...l, [id]: { visible: !l[id].visible } }))}
            onClear={clearLayer}
          />
        </div>

        <div className="canvas-wrap">
          <div className="page" style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}>
            {doc && layers.document.visible && (
              <img
                className="layer"
                src={doc.src}
                alt={doc.title}
                draggable={false}
                style={{ objectFit: "contain", objectPosition: "top center" }}
              />
            )}
            <InkLayer
              strokes={ink.value}
              tool={tool}
              color={color}
              width={width}
              interactive={layers.ink.visible}
              visible={layers.ink.visible}
              onAdd={(s) => ink.set([...ink.value, s])}
              onErase={(ids) => ink.set(ink.value.filter((s) => !ids.includes(s.id)))}
            />
            <MarkLayer marks={marks} visible={layers.marks.visible} />
            {checking && <div className="scan" />}
          </div>
        </div>

        <FeedbackPanel
          attempts={attempts}
          checking={checking}
          error={error}
          disabled={ink.value.length === 0}
          onCheck={check}
        />
      </main>
    </div>
  );
}

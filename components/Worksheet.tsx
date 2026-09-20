"use client";

import { useRef, useState } from "react";
import { applyActions, learnerStroke, type BoardElement, type ResolvedAction } from "@/lib/board";
import { ensureOk } from "@/lib/ndjson";
import type { ProviderId, ProviderInfo } from "@/lib/providers/types";
import type { BoardColor } from "@/lib/schema";
import { Board, INK } from "./Board";

/** pdf.js ships its worker separately; take it from the CDN at the installed version. */
const PDFJS_VERSION = "6.3.289";
const PENS: BoardColor[] = ["blue", "ink", "red", "green"];
/** Render PDF pages at this width; tall enough to read, small enough to send. */
const PAGE_WIDTH = 1100;

interface Check {
  verdict: "correct" | "mistakes" | "unreadable";
  summary: string;
  marks: ResolvedAction[];
}

interface Page {
  url: string;
  width: number;
  height: number;
}

/** Upload a PDF or photo, write on it by hand, then have it marked. */
export function Worksheet({ providers }: { providers: ProviderInfo[] }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [ink, setInk] = useState<Record<number, BoardElement[]>>({});
  const [marks, setMarks] = useState<Record<number, BoardElement[]>>({});
  const [checks, setChecks] = useState<Record<number, Check>>({});
  const [checking, setChecking] = useState(false);
  const [penColor, setPenColor] = useState<BoardColor>("blue");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ProviderId | null>(null);
  const strokeCount = useRef(0);

  // Only OpenAI and Claude read pictures; fall back to whichever of them is set up.
  const readers = providers.filter((p) => p.id === "openai" || p.id === "anthropic");
  const usable = readers.filter((p) => p.configured);
  const providerId: ProviderId = picked && usable.some((p) => p.id === picked) ? picked : (usable[0]?.id ?? "openai");

  const page = pages[index];
  const elements = [...(ink[index] ?? []), ...(marks[index] ?? [])];
  const check = checks[index];
  const canCheck = Boolean(page) && (ink[index]?.length ?? 0) > 0 && !checking;

  async function openFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      pages.forEach((p) => URL.revokeObjectURL(p.url));
      setPages([]);
      setInk({});
      setMarks({});
      setChecks({});
      setIndex(0);
      setName(file.name);
      setPages(await readFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file could not be opened.");
    } finally {
      setLoading(false);
    }
  }

  function onStroke(points: number[]) {
    strokeCount.current += 1;
    const stroke = learnerStroke(points, penColor, strokeCount.current);
    setInk((all) => ({ ...all, [index]: [...(all[index] ?? []), stroke] }));
  }

  function undo() {
    setInk((all) => ({ ...all, [index]: (all[index] ?? []).slice(0, -1) }));
  }

  function clearPage() {
    setInk((all) => ({ ...all, [index]: [] }));
    setMarks((all) => ({ ...all, [index]: [] }));
    setChecks((all) => ({ ...all, [index]: undefined as unknown as Check }));
  }

  /** Flatten the page and the learner's ink into one picture for the model to read. */
  async function snapshot(current: Page): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = current.width;
    canvas.height = current.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = await imageElement(current.url);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3.5;
    for (const element of ink[index] ?? []) {
      if (element.type !== "stroke") continue;
      ctx.strokeStyle = INK[element.color];
      ctx.beginPath();
      for (let i = 0; i + 1 < element.points.length; i += 2) {
        const [x, y] = [element.points[i], element.points[i + 1]];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function checkWork() {
    if (!page || checking) return;
    setChecking(true);
    setError(null);
    try {
      const image = await snapshot(page);
      const res = await fetch("/api/whiteboard/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, width: page.width, height: page.height, provider: providerId }),
      });
      await ensureOk(res);
      const data = (await res.json()) as Check;
      setChecks((all) => ({ ...all, [index]: data }));
      setMarks((all) => ({ ...all, [index]: applyActions([], data.marks) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check failed.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="worksheet">
      <header className="worksheet-bar">
        <div className="flex min-w-0 items-center gap-3">
          <label className="code-btn code-btn-primary cursor-pointer">
            {pages.length > 0 ? "Open another" : "Upload a PDF"}
            <input
              type="file"
              accept=".note,application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void openFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {name && <span className="truncate text-sm text-neutral-500">{name}</span>}
          {pages.length > 1 && (
            <span className="flex items-center gap-1 text-sm text-neutral-500">
              <button type="button" className="code-btn" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>
                ←
              </button>
              page {index + 1} of {pages.length}
              <button
                type="button"
                className="code-btn"
                onClick={() => setIndex(Math.min(pages.length - 1, index + 1))}
                disabled={index + 1 >= pages.length}
              >
                →
              </button>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="call-pens" role="group" aria-label="Pen colour">
            {PENS.map((c) => (
              <button
                key={c}
                type="button"
                className="pen-dot"
                style={{ background: INK[c], borderColor: penColor === c ? "#111" : "transparent" }}
                data-on={penColor === c ? "true" : undefined}
                onClick={() => setPenColor(c)}
                aria-label={`${c} pen`}
              />
            ))}
          </span>
          <button type="button" className="code-btn" onClick={undo} disabled={!(ink[index]?.length ?? 0)}>
            Undo
          </button>
          <button type="button" className="code-btn" onClick={clearPage} disabled={!page}>
            Clear
          </button>
          <select
            className="worksheet-model"
            value={providerId}
            onChange={(e) => setPicked(e.target.value as ProviderId)}
            aria-label="Model that marks the work"
          >
            {readers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured}>
                {p.label}
                {p.configured ? "" : " (not set up)"}
              </option>
            ))}
          </select>
          <button type="button" className="code-btn code-btn-primary" onClick={() => void checkWork()} disabled={!canCheck}>
            {checking ? "Checking…" : "Check My Work"}
          </button>
        </div>
      </header>

      {error && <p className="worksheet-error">{error}</p>}

      {check && (
        <p className="worksheet-verdict" data-verdict={check.verdict}>
          <strong>
            {check.verdict === "correct" ? "Looks right" : check.verdict === "mistakes" ? "Found a problem" : "Hard to read"}
          </strong>{" "}
          {check.summary}
        </p>
      )}

      <div className="worksheet-page">
        {page ? (
          <Board
            elements={elements}
            width={page.width}
            height={page.height}
            background={page.url}
            plain
            canDraw
            penColor={penColor}
            onStroke={onStroke}
          />
        ) : (
          <label className="worksheet-drop">
            <input
              type="file"
              accept=".note,application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void openFile(file);
                e.target.value = "";
              }}
            />
            <span>{loading ? "Opening…" : "Upload a PDF, a Goodnotes .note file, or a photo of your work. Write on it, then press Check My Work."}</span>
          </label>
        )}
      </div>
    </main>
  );
}

/* ---------- Files ---------- */

async function readFile(file: File): Promise<Page[]> {
  if (file.type.startsWith("image/")) return [await loadImage(file)];
  if (file.name.toLowerCase().endsWith(".note")) return renderPdf(await pdfInsideNote(file));
  return renderPdf(await file.arrayBuffer());
}

/**
 * A .note file (Goodnotes) is a zip holding the original PDF plus the app's own
 * handwriting data. The PDF is the page; the handwriting stays in Goodnotes.
 */
async function pdfInsideNote(file: File): Promise<ArrayBuffer> {
  const { unzipSync } = await import("fflate");
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const name = Object.keys(entries)
    .filter((n) => n.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => entries[b].length - entries[a].length)[0];
  if (!name) throw new Error("That .note file has no PDF inside, so there is no page to write on.");
  const bytes = entries[name];
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function renderPdf(data: ArrayBuffer): Promise<Page[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: Page[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PAGE_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    pages.push({ url: canvas.toDataURL("image/jpeg", 0.9), width: canvas.width, height: canvas.height });
  }
  return pages;
}

async function loadImage(file: File): Promise<Page> {
  const url = URL.createObjectURL(file);
  const img = await imageElement(url);
  const scale = Math.min(1, PAGE_WIDTH / img.naturalWidth);
  return { url, width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) };
}

function imageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That picture could not be opened."));
    img.src = src;
  });
}

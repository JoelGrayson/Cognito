/**
 * A TEST RIG, not a feature. Answers one question before anything is built on it:
 * can Mathpix read YOUR hand-drawn molecules well enough to check them?
 *
 * Draw a few structures and press Read. Nothing to type: each drawing is compared with
 * every answer on the practice sheet, and with the usual wrong answers, so the verdict
 * says which question it answers or which mistake it is. Each drawing is cut out on
 * its own, read into SMILES, and drawn BACK by RDKit so you can judge the reading by
 * eye instead of by decoding SMILES.
 *
 * Judge it on three things:
 *   1. Does it read your messy structures correctly? Try rings, wedges, charges.
 *   2. Draw one deliberately WRONG (a carbon with five bonds). Does the reading keep
 *      your mistake, or quietly hand back a valid molecule? If it repairs the mistake,
 *      a checker built on it can never catch that mistake.
 *   3. Draw two close together. Were they cut apart correctly?
 * Every drawing is saved under fixtures/structures/ with the question it was for.
 *
 * FOUND SO FAR, with simulated pen strokes (a real stylus is still untested):
 *   - 2-butanol and chlorobenzene read correctly, ~450ms each, confidence 0.98-0.99.
 *   - Two molecules drawn apart are cut and read separately.
 *   - A carbon drawn with FIVE bonds came back as a valid four-bond molecule: Mathpix
 *     dropped a bond and repaired the mistake. Confidence fell to 0.52. So an
 *     impossible structure is never reported as such; the signals are low confidence
 *     and a molecule that does not match the answer key.
 *   - Acetic acid, toluene and cyclohexanol read correctly (0.95-1.00). A BARE hexagon
 *     with nothing on it reads as cycloheptane, every time, at 0.82.
 *   - Cyclohexanone and butanal read correctly at 1.00. 2-bromo-2-methylbutane read
 *     correctly at only 0.64, with a clumsily lettered "Br".
 *   - So confidence is a hint, not a gate. Wrong and repaired readings scored 0.52 and
 *     0.82, but a CORRECT one scored 0.64. A floor near 0.9 would stay silent on some
 *     correct work, which is the safe direction to be wrong in.
 */
"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { Tldraw, createShapeId, toRichText, type Editor, type TLShapeId } from "tldraw";
import "tldraw/tldraw.css";
import { clusterByGap } from "@/lib/whiteboard/cluster";
import type { Bounds } from "@/lib/whiteboard/strokes";
import { judgeStructure, type KeyEntry, type StructureVerdict } from "@/lib/whiteboard/structure-key";
import sheetKey from "@/fixtures/structures/ochem-practice.key.json";

/** RDKit is 7 MB of WebAssembly. It comes from the CDN at the installed version
 *  rather than through the bundler, the same way the worksheet takes its pdf.js worker. */
const RDKIT_BASE = "https://unpkg.com/@rdkit/rdkit@2026.3.6/dist/";

interface RDKitMol {
  get_smiles(): string;
  get_svg(w: number, h: number): string;
  delete(): void;
}
interface RDKit {
  get_mol(smiles: string): RDKitMol | null;
}
declare global {
  interface Window {
    initRDKitModule?: (opts: { locateFile: (file: string) => string }) => Promise<RDKit>;
  }
}

interface Reading {
  n: number;
  picture: string;
  smiles: string | null;
  structuresSeen: number;
  confidence: number | null;
  ms: number;
  /** RDKit's verdict on the SMILES: its own spelling and a drawing, or why not. */
  canonical: string | null;
  svg: string | null;
  /** Against the sheet's answer key; null when nothing valid was read. */
  verdict: StructureVerdict | null;
  error?: string;
}

/** What to say for a verdict, and whether it is good news. */
function describe(v: StructureVerdict): { text: string; tone: "good" | "bad" | "unsure" } {
  switch (v.kind) {
    case "correct":
      return { text: `Correct: ${v.name}, the answer to question ${v.problem}.`, tone: "good" };
    case "other-question":
      return { text: `That is ${v.name}, the answer to question ${v.problem}, not question ${v.asked}.`, tone: "bad" };
    case "known-mistake":
      return { text: `That is ${v.name}: the usual mistake on question ${v.problem}.`, tone: "bad" };
    case "no-match":
      return v.asked === null
        ? { text: "Not an answer to any question on the sheet.", tone: "unsure" }
        : { text: `Not the answer to question ${v.asked}.`, tone: "bad" };
  }
}
const TONE = { good: "bg-green-950/60 text-green-300", bad: "bg-red-950/60 text-red-300", unsure: "bg-neutral-800 text-neutral-300" } as const;

const LABEL_META = { chemReadLabel: true } as const;

function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function ChemReadPage() {
  const editorRef = useRef<Editor | null>(null);
  const rdkitRef = useRef<RDKit | null>(null);
  const [rdkitReady, setRdkitReady] = useState(false);
  /** Optional. Left on auto, a drawing is matched against every question. */
  const [asked, setAsked] = useState<number | null>(null);
  /** The key in RDKit's spelling, built once RDKit is up. Comparing the file's SMILES
   *  as text would call "OC(C)CC" a wrong answer to a question whose key says "CCC(C)O". */
  const keyRef = useRef<KeyEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [error, setError] = useState<string | null>(null);

  function canonicalOf(smiles: string | null): { canonical: string | null; svg: string | null } {
    const mol = smiles ? rdkitRef.current?.get_mol(smiles) : null;
    if (!mol) return { canonical: null, svg: null };
    try {
      return { canonical: mol.get_smiles(), svg: mol.get_svg(220, 160) };
    } finally {
      mol.delete();
    }
  }

  async function read() {
    const editor = editorRef.current;
    if (!editor) return;
    setError(null);

    const ink = editor.getCurrentPageShapes().filter((s) => s.type === "draw");
    const boxes = ink.flatMap((s) => {
      const b = editor.getShapePageBounds(s.id);
      return b ? [{ id: s.id, bounds: { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY } as Bounds }] : [];
    });
    if (boxes.length === 0) return setError("Draw a structure first.");

    const old = editor.getCurrentPageShapes().filter((s) => (s.meta as { chemReadLabel?: boolean }).chemReadLabel);
    editor.deleteShapes(old.map((s) => s.id));

    setBusy(true);
    try {
      const clusters = clusterByGap(boxes.map((b) => b.bounds));
      const forQuestion = asked === null ? "" : `question ${asked}`;

      const results = await Promise.all(
        clusters.map(async (cluster, i): Promise<Reading> => {
          const ids = cluster.members.map((m) => boxes[m].id) as TLShapeId[];
          const { blob } = await editor.toImage(ids, { format: "png", background: true, padding: 32, scale: 2, darkMode: false });
          const picture = await dataUrlOf(blob);
          const res = await fetch("/api/whiteboard/structure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: picture, intended: forQuestion }),
          });
          const data = await res.json().catch(() => null);
          const base = { n: i + 1, picture, smiles: null, structuresSeen: 0, confidence: null, ms: 0, canonical: null, svg: null, verdict: null };
          if (!res.ok || !data) return { ...base, error: data?.error ?? "Request failed." };

          const drawn = canonicalOf(data.smiles);
          editor.createShape({
            id: createShapeId(),
            type: "text",
            x: cluster.bounds.minX,
            y: cluster.bounds.maxY + 12,
            meta: LABEL_META,
            props: { richText: toRichText(`${i + 1}. ${data.smiles ?? "not read"}`), color: "blue", size: "s", font: "mono", autoSize: true },
          });
          return {
            ...base,
            smiles: data.smiles,
            structuresSeen: data.structuresSeen,
            confidence: data.confidence,
            ms: data.ms,
            ...drawn,
            verdict: drawn.canonical ? judgeStructure(drawn.canonical, keyRef.current, asked) : null,
          };
        }),
      );
      setReadings(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    const editor = editorRef.current;
    if (editor) editor.deleteShapes(editor.getCurrentPageShapes().map((s) => s.id));
    setReadings([]);
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-neutral-950 text-neutral-100">
      <Script
        src={`${RDKIT_BASE}RDKit_minimal.js`}
        onReady={() => {
          void window.initRDKitModule?.({ locateFile: (file) => RDKIT_BASE + file }).then((rdkit) => {
            rdkitRef.current = rdkit;
            keyRef.current = sheetKey.answers.flatMap((a) => {
              const smiles = canonicalOf(a.smiles).canonical;
              if (!smiles) return [];
              const commonWrong = (a.commonWrong ?? []).flatMap((w) => {
                const wrong = canonicalOf(w.smiles).canonical;
                return wrong ? [{ name: w.name, smiles: wrong }] : [];
              });
              return [{ problem: a.problem, name: a.name, smiles, commonWrong }];
            });
            setRdkitReady(true);
          });
        }}
      />
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <h1 className="text-sm font-semibold">Structure reading test</h1>
        <label className="flex items-center gap-1.5 text-xs text-neutral-400">
          question
          <select
            value={asked ?? ""}
            onChange={(e) => setAsked(e.target.value ? Number(e.target.value) : null)}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
          >
            <option value="">auto-detect</option>
            {sheetKey.answers.map((a) => (
              <option key={a.problem} value={a.problem}>
                {a.problem}
              </option>
            ))}
          </select>
        </label>
        <span className="flex-1" />
        <span className="text-[11px] text-neutral-500">{rdkitReady ? "RDKit ready" : "loading RDKit…"}</span>
        <button onClick={() => void read()} disabled={busy} className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-50">
          {busy ? "reading…" : "Read structures"}
        </button>
        <button onClick={clear} className="rounded border border-neutral-700 px-3 py-2 text-sm">
          Clear
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[55dvh] w-full flex-1 touch-none lg:min-h-0">
          <div className="absolute inset-0">
            <Tldraw
              components={{ StylePanel: null, PageMenu: null, MainMenu: null, ActionsMenu: null, NavigationPanel: null, HelpMenu: null, DebugPanel: null }}
              onMount={(editor) => {
                editorRef.current = editor;
                editor.setCurrentTool("draw");
                editor.registerExternalContentHandler("text", () => {});
              }}
            />
          </div>
        </div>

        <aside className="max-h-[40dvh] shrink-0 overflow-y-auto border-t border-neutral-800 p-3 lg:max-h-none lg:w-[26rem] lg:border-l lg:border-t-0">
          {error && <p className="mb-3 rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}
          {readings.length === 0 && !error && (
            <p className="text-xs leading-relaxed text-neutral-500">
              Draw one or more structures, leaving clear space between them, then press Read. Try a ring, a wedge bond, a
              charge, and one deliberately wrong structure such as a carbon with five bonds.
            </p>
          )}
          <ol className="space-y-3">
            {readings.map((r) => (
              <li key={r.n} className="rounded border border-neutral-800 p-2.5 text-xs">
                <div className="mb-2 flex items-center justify-between text-neutral-500">
                  <span>drawing {r.n}</span>
                  <span>
                    {r.ms}ms{r.confidence !== null && ` · confidence ${r.confidence.toFixed(2)}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made a moment ago */}
                    <img src={r.picture} alt={`drawing ${r.n} as sent`} className="h-28 w-full rounded bg-white object-contain" />
                    <figcaption className="mt-1 text-neutral-500">what was sent</figcaption>
                  </figure>
                  <figure>
                    {r.svg ? (
                      <div className="h-28 rounded bg-white [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: r.svg }} />
                    ) : (
                      <div className="flex h-28 items-center justify-center rounded bg-neutral-900 px-2 text-center text-neutral-500">
                        {r.smiles ? "RDKit rejects this as not a valid molecule" : "nothing to draw"}
                      </div>
                    )}
                    <figcaption className="mt-1 text-neutral-500">what it read</figcaption>
                  </figure>
                </div>
                <div className="mt-2 break-all font-mono text-sm text-neutral-100">{r.smiles ?? r.error ?? "(no structure read)"}</div>
                {r.canonical && r.canonical !== r.smiles && <div className="mt-1 break-all font-mono text-[11px] text-neutral-400">→ {r.canonical}</div>}
                {r.structuresSeen > 1 && <div className="mt-1 text-amber-400">{r.structuresSeen} structures in one picture: the cut was wrong</div>}
                {r.verdict && (
                  <div className={`mt-2 rounded px-2 py-1.5 text-sm ${TONE[describe(r.verdict).tone]}`}>{describe(r.verdict).text}</div>
                )}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

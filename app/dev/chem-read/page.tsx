/**
 * A TEST RIG, not a feature. Answers one question before anything is built on it:
 * can Mathpix read YOUR hand-drawn molecules well enough to check them?
 *
 * Draw a few structures, type what you meant, press Read. Each drawing is cut out on
 * its own, read into SMILES, and drawn BACK by RDKit so you can judge the reading by
 * eye instead of by decoding SMILES.
 *
 * Judge it on three things:
 *   1. Does it read your messy structures correctly? Try rings, wedges, charges.
 *   2. Draw one deliberately WRONG (a carbon with five bonds). Does the reading keep
 *      your mistake, or quietly hand back a valid molecule? If it repairs the mistake,
 *      a checker built on it can never catch that mistake.
 *   3. Draw two close together. Were they cut apart correctly?
 * Every drawing is saved under fixtures/structures/ with what you said you meant.
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
 *   - Across every run so far: correct readings scored 0.95 or higher, wrong or
 *     repaired ones 0.82 or lower. A confidence floor near 0.9 would have separated
 *     them all, the same idea as the math checker's recognition floor.
 */
"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { Tldraw, createShapeId, toRichText, type Editor, type TLShapeId } from "tldraw";
import "tldraw/tldraw.css";
import { clusterByGap } from "@/lib/whiteboard/cluster";
import type { Bounds } from "@/lib/whiteboard/strokes";

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
  /** Whether it is the molecule the person typed; null when they typed nothing usable. */
  matchesIntended: boolean | null;
  error?: string;
}

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
  const [intended, setIntended] = useState("");
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
      // One molecule typed means one molecule meant; with several drawn there is no
      // telling which it refers to.
      const meant = clusters.length === 1 ? canonicalOf(intended.trim()).canonical : null;

      const results = await Promise.all(
        clusters.map(async (cluster, i): Promise<Reading> => {
          const ids = cluster.members.map((m) => boxes[m].id) as TLShapeId[];
          const { blob } = await editor.toImage(ids, { format: "png", background: true, padding: 32, scale: 2, darkMode: false });
          const picture = await dataUrlOf(blob);
          const res = await fetch("/api/whiteboard/structure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: picture, intended: intended.trim() }),
          });
          const data = await res.json().catch(() => null);
          const base = { n: i + 1, picture, smiles: null, structuresSeen: 0, confidence: null, ms: 0, canonical: null, svg: null, matchesIntended: null };
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
            matchesIntended: meant && drawn.canonical ? meant === drawn.canonical : null,
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
            setRdkitReady(true);
          });
        }}
      />
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <h1 className="text-sm font-semibold">Structure reading test</h1>
        <input
          value={intended}
          onChange={(e) => setIntended(e.target.value)}
          placeholder="what you meant: a name, or SMILES like CCO to auto-compare"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm placeholder:text-neutral-600"
        />
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
                {r.matchesIntended !== null && (
                  <div className={`mt-2 rounded px-2 py-1 ${r.matchesIntended ? "bg-green-950/60 text-green-300" : "bg-red-950/60 text-red-300"}`}>
                    {r.matchesIntended ? "same molecule as the SMILES you typed" : "NOT the molecule you typed"}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

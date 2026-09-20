import type { Mark } from "../../shared/types";
import { MARK_GRID, PAGE_H, PAGE_W } from "../../shared/types";

export type Tool = "pen" | "highlighter" | "eraser";

export interface Stroke {
  id: string;
  /** Flat [x0, y0, x1, y1, ...] in page space. */
  points: number[];
  color: string;
  width: number;
  /** Highlighter strokes are drawn translucent behind pen strokes. */
  highlighter?: boolean;
}

export const PEN_COLORS = ["#1f2328", "#2563eb", "#15803d", "#7c3aed", "#ea580c"] as const;
export const HIGHLIGHT = "#fde047";
export const RED_PEN = "#dc2626";

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Catmull-Rom-ish smoothing into an SVG path via quadratic midpoints. */
export function strokePath(points: number[]): string {
  const n = points.length / 2;
  if (n === 0) return "";
  if (n === 1) return `M${points[0]} ${points[1]} l0.01 0`;
  let d = `M${points[0]} ${points[1]}`;
  for (let i = 1; i < n - 1; i++) {
    const x = points[i * 2], y = points[i * 2 + 1];
    const nx = points[i * 2 + 2], ny = points[i * 2 + 3];
    d += ` Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  d += ` L${points[(n - 1) * 2]} ${points[(n - 1) * 2 + 1]}`;
  return d;
}

/** True when any point of the stroke is within `radius` of (x, y). */
export function strokeHits(s: Stroke, x: number, y: number, radius: number) {
  const r = radius + s.width / 2;
  for (let i = 0; i < s.points.length; i += 2) {
    if (Math.hypot(s.points[i] - x, s.points[i + 1] - y) <= r) return true;
  }
  return false;
}

/** Composite the document image and the learner's strokes into a PNG data URL. */
export async function renderPage(documentSrc: string | null, strokes: Stroke[]): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  if (documentSrc) {
    const img = await loadImage(documentSrc);
    drawContained(ctx, img);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const ordered = [...strokes.filter((s) => s.highlighter), ...strokes.filter((s) => !s.highlighter)];
  for (const s of ordered) {
    ctx.globalAlpha = s.highlighter ? 0.4 : 1;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.stroke(new Path2D(strokePath(s.points)));
  }
  return canvas.toDataURL("image/png");
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load image"));
    img.src = src;
  });
}

/** Fit an image inside the page, top-aligned and centered horizontally. */
export function containedRect(w: number, h: number) {
  const scale = Math.min(PAGE_W / w, PAGE_H / h);
  const dw = w * scale, dh = h * scale;
  return { x: (PAGE_W - dw) / 2, y: 0, w: dw, h: dh };
}

function drawContained(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const r = containedRect(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
}

/** Model marks arrive on a 0..1000 grid; scale into page space. */
export function markToPage<T extends Mark>(m: T): T {
  const sx = PAGE_W / MARK_GRID, sy = PAGE_H / MARK_GRID;
  const out: Record<string, unknown> = { ...m };
  for (const [k, v] of Object.entries(m)) {
    if (typeof v !== "number") continue;
    if (k === "r" || k === "size") out[k] = v * sx;
    else if (k.startsWith("x") || k === "cx") out[k] = v * sx;
    else if (k.startsWith("y") || k === "cy") out[k] = v * sy;
  }
  return out as T;
}

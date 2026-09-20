import type { BoardAction, BoardColor } from "@/lib/schema";

/* The shared whiteboard in a video lesson: what can be on it, a safe
   evaluator for plotted functions, and the compact text the tutor model reads
   each turn. The learner's drawing is sent as simplified point lists rather
   than screenshots, which keeps every turn cheap. */

export const BOARD_W = 1000;
export const BOARD_H = 600;

/** A board action after the server has resolved image searches to URLs. */
export type ResolvedAction =
  | Exclude<BoardAction, { type: "image" }>
  | (Extract<BoardAction, { type: "image" }> & { url: string });

type Drawn = Exclude<ResolvedAction, { type: "erase" } | { type: "clear" }>;

/** Something on the board. `key` is unique per placement, so redrawn elements animate again. */
export type BoardElement =
  | (Drawn & { key: string; delay: number })
  | { type: "stroke"; id: string; key: string; delay: number; points: number[]; color: BoardColor }
  | { type: "rub"; id: string; key: string; delay: number; points: number[]; size: number };

/** How wide the eraser is, in board units. */
export const RUB_SIZE = 44;

let placed = 0;

/** Apply a tutor turn's actions; new elements get staggered delays so they draw one after another. */
export function applyActions(elements: BoardElement[], actions: ResolvedAction[]): BoardElement[] {
  let next = elements;
  let step = 0;
  for (const action of actions) {
    if (action.type === "clear") {
      next = [];
      continue;
    }
    next = next.filter((e) => e.id !== action.id);
    if (action.type === "erase") continue;
    placed += 1;
    next = [...next, { ...action, key: `${action.id}:${placed}`, delay: step * 450 }];
    step += 1;
  }
  return next;
}

/** A stroke the learner drew, simplified. */
export function learnerStroke(points: number[], color: BoardColor, n: number): BoardElement {
  placed += 1;
  return { type: "stroke", id: `you${n}`, key: `you${n}:${placed}`, delay: 0, points: simplifyStroke(points), color };
}

/**
 * A white stroke that covers the page underneath. Digital ink is deleted
 * outright; anything printed into the page itself can only be painted over.
 */
export function rubStroke(points: number[], n: number, size = RUB_SIZE): BoardElement {
  placed += 1;
  return { type: "rub", id: `rub${n}`, key: `rub${n}:${placed}`, delay: 0, points: simplifyStroke(points), size };
}

/** Shortest distance from (x, y) to the segment (ax, ay)-(bx, by). */
function distToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function nearPolyline(points: number[], x: number, y: number, r: number): boolean {
  const pts = pairs(points);
  if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) <= r;
  for (let i = 0; i + 1 < pts.length; i++) {
    if (distToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= r) return true;
  }
  return false;
}

function nearBox(x: number, y: number, r: number, bx: number, by: number, bw: number, bh: number): boolean {
  return x >= bx - r && x <= bx + bw + r && y >= by - r && y <= by + bh + r;
}

/** True when the eraser, centred at (x, y) with radius r, touches this element. */
export function elementNear(e: BoardElement, x: number, y: number, r: number): boolean {
  switch (e.type) {
    case "stroke":
      return nearPolyline(e.points, x, y, r);
    case "rub":
      return nearPolyline(e.points, x, y, r + e.size / 2);
    case "path":
      return nearPolyline(e.closed ? [...e.points, e.points[0], e.points[1]] : e.points, x, y, r);
    case "line":
      return distToSegment(x, y, e.x1, e.y1, e.x2, e.y2) <= r;
    case "circle":
      return Math.hypot(x - e.cx, y - e.cy) <= e.r + r;
    case "rect":
    case "image":
    case "plot":
      return nearBox(x, y, r, e.x, e.y, e.w, e.h);
    case "text": {
      const size = e.size === "small" ? 18 : e.size === "medium" ? 24 : 34;
      const lines = e.text.split("\n");
      const widest = Math.max(...lines.map((l) => l.length));
      return nearBox(x, y, r, e.x, e.y, widest * size * 0.55, lines.length * size * 1.2);
    }
    default:
      return false;
  }
}

/** Drop every element the eraser stroke passed over. */
export function rubOut(elements: BoardElement[], points: number[], r = RUB_SIZE / 2): BoardElement[] {
  const path = pairs(points);
  return elements.filter((e) => !path.some(([x, y]) => elementNear(e, x, y, r)));
}

export function pairs(points: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push([points[i], points[i + 1]]);
  return out;
}

/** Ramer–Douglas–Peucker, then capped at `max` points. */
export function simplifyStroke(points: number[], epsilon = 3, max = 32): number[] {
  const pts = pairs(points);
  if (pts.length <= 2) return points;
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1;
    let farDist = epsilon;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > farDist) {
        far = i;
        farDist = d;
      }
    }
    if (far !== -1) {
      keep[far] = true;
      stack.push([a, far], [far, b]);
    }
  }
  let kept = pts.filter((_, i) => keep[i]);
  if (kept.length > max) {
    const stride = (kept.length - 1) / (max - 1);
    kept = Array.from({ length: max }, (_, i) => kept[Math.round(i * stride)]);
  }
  return kept.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);
}

/** The board as short lines of text for the tutor model. */
export function describeBoard(elements: BoardElement[]): string {
  if (elements.length === 0) return "(empty)";
  const p = (x: number, y: number) => `(${Math.round(x)},${Math.round(y)})`;
  const r = Math.round;
  return elements
    .map((e) => {
      switch (e.type) {
        case "text":
          return `text ${e.id} "${e.text}" at ${p(e.x, e.y)} ${e.size} ${e.color}`;
        case "line":
          return `${e.arrow ? "arrow" : "line"} ${e.id} ${p(e.x1, e.y1)} to ${p(e.x2, e.y2)} ${e.color}${e.dashed ? " dashed" : ""}`;
        case "rect":
          return `rect ${e.id} at ${p(e.x, e.y)} size ${r(e.w)}x${r(e.h)} ${e.color}${e.fill ? " filled" : ""}`;
        case "circle":
          return `circle ${e.id} centre ${p(e.cx, e.cy)} radius ${r(e.r)} ${e.color}${e.fill ? " filled" : ""}`;
        case "path": {
          const pts = pairs(e.points);
          const shown = pts.length > 12 ? [...pts.slice(0, 6), ...pts.slice(-6)] : pts;
          return `path ${e.id} ${pts.length} points ${shown.map(([x, y]) => p(x, y)).join(" ")}${e.closed ? " closed" : ""} ${e.color}`;
        }
        case "plot":
          return `plot ${e.id} y=${e.fn} in box at ${p(e.x, e.y)} size ${r(e.w)}x${r(e.h)}, x ${e.xMin}..${e.xMax}, y ${e.yMin}..${e.yMax}`;
        case "image":
          return `image ${e.id} "${e.query}" in box at ${p(e.x, e.y)} size ${r(e.w)}x${r(e.h)}`;
        case "stroke":
          return `LEARNER stroke ${e.id} (${e.color}): ${pairs(e.points)
            .map(([x, y]) => p(x, y))
            .join(" ")}`;
      }
    })
    .join("\n");
}

/* ---------- Safe function evaluator for plots (no eval) ---------- */

type Fn = (x: number) => number;

const FUNCS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  log10: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Compile "0.5*9.8*x^2" or "exp(-x)*cos(4x)" into a function of x, or null if it is not valid. */
export function compileFn(source: string): Fn | null {
  const src = source.toLowerCase().replace(/\s+/g, "").replace(/π/g, "pi").replace(/·|×/g, "*");
  if (!src || src.length > 200) return null;
  const tokens = src.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z_][a-z_0-9]*|\*\*|[-+*/^(),]/g);
  if (!tokens || tokens.join("") !== src) return null;
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const startsFactor = (t: string | undefined) => t !== undefined && /^[\d.a-z_(]/.test(t);

  function expr(): Fn {
    let left = term();
    while (peek() === "+" || peek() === "-") {
      const op = take();
      const l = left;
      const r = term();
      left = op === "+" ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return left;
  }
  function term(): Fn {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t !== "*" && t !== "/" && !startsFactor(t)) return left;
      const op = t === "*" || t === "/" ? take() : "*"; // "2x" means 2*x
      const l = left;
      const r = unary();
      left = op === "/" ? (x) => l(x) / r(x) : (x) => l(x) * r(x);
    }
  }
  function unary(): Fn {
    if (peek() === "-") {
      take();
      const f = unary();
      return (x) => -f(x);
    }
    if (peek() === "+") {
      take();
      return unary();
    }
    return power();
  }
  function power(): Fn {
    const base = primary();
    if (peek() === "^" || peek() === "**") {
      take();
      const exponent = unary();
      return (x) => Math.pow(base(x), exponent(x));
    }
    return base;
  }
  function primary(): Fn {
    const t = take();
    if (t === undefined) throw new Error("unexpected end");
    if (/^[\d.]/.test(t)) {
      const v = Number(t);
      if (!Number.isFinite(v)) throw new Error("bad number");
      return () => v;
    }
    if (t === "(") {
      const f = expr();
      if (take() !== ")") throw new Error("missing )");
      return f;
    }
    if (t === "x" || t === "t") return (x) => x;
    if (t in CONSTS) {
      const v = CONSTS[t];
      return () => v;
    }
    if (t in FUNCS) {
      if (take() !== "(") throw new Error("missing (");
      const args = [expr()];
      while (peek() === ",") {
        take();
        args.push(expr());
      }
      if (take() !== ")") throw new Error("missing )");
      const fn = FUNCS[t];
      return (x) => fn(...args.map((a) => a(x)));
    }
    throw new Error(`unknown ${t}`);
  }

  try {
    const f = expr();
    return i === tokens.length ? f : null;
  } catch {
    return null;
  }
}

"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { BOARD_H, BOARD_W, RUB_SIZE, compileFn, type BoardElement } from "@/lib/board";
import type { BoardColor } from "@/lib/schema";

export const INK: Record<BoardColor, string> = {
  ink: "#1f2328",
  blue: "#2563eb",
  red: "#dc2626",
  green: "#15803d",
  orange: "#ea580c",
  purple: "#7c3aed",
};
const FONT = { small: 18, medium: 24, large: 34 };

interface Props {
  elements: BoardElement[];
  /** Board size; the default is the 1000x600 whiteboard. */
  width?: number;
  height?: number;
  /** A page (a PDF page or a photo) drawn behind everything. */
  background?: string;
  /** Hide the faint grid, e.g. when a page is behind the ink. */
  plain?: boolean;
  /** The learner can draw with the pen. */
  canDraw: boolean;
  penColor: BoardColor;
  /** Draw with the eraser instead of a pen. */
  erasing?: boolean;
  /** `erased` is true when the stroke rubs out rather than draws, which the eraser
   *  end of a stylus can decide on its own. */
  onStroke: (points: number[], erased: boolean) => void;
}

/** The stroke being drawn right now. `erase` is fixed when the pen goes down, so
 *  flipping the eraser mid-stroke cannot turn half a line into a rub. */
interface Stroke {
  points: number[];
  erase: boolean;
  /** Drawn by a stylus rather than a finger. */
  pen: boolean;
}

/** A stylus reports its eraser end as button 5, or bit 32 of `buttons` while it moves. */
function isEraserEnd(button: number, buttons: number): boolean {
  return button === 5 || (buttons & 32) !== 0;
}

/** The shared whiteboard: the tutor's drawings animate in, and the learner can draw on top. */
export function Board({ elements, canDraw, penColor, erasing, onStroke, width = BOARD_W, height = BOARD_H, background, plain }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [current, setCurrent] = useState<Stroke | null>(null);
  /** The same stroke, for the handlers to read and finish with: `onStroke` tells the
   *  parent to store it, and a parent cannot be updated from inside a state updater. */
  const stroke = useRef<Stroke | null>(null);
  /** The one pointer allowed to draw. A tablet reports the palm resting on the glass
   *  as a second pointer, and without this its moves are appended to the line the
   *  stylus is drawing - the line jumps across the page to the heel of the hand. */
  const drawingId = useRef<number | null>(null);
  /** A stylus has touched this board, so fingers on it are a palm, not a second pen. */
  const sawPen = useRef(false);

  const toBoard = (clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return [Math.round(p.x), Math.round(p.y)];
  };

  /** Points for one move, including the ones the browser coalesced into it. A stylus
   *  reports far faster than the screen refreshes, and only the coalesced batch has
   *  the whole path - taking the event alone turns fast handwriting into polygons. */
  const movePoints = (e: PointerEvent<SVGSVGElement>): [number, number][] => {
    const native = e.nativeEvent;
    const batch = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const moves = batch.length > 0 ? batch : [native];
    return moves.map((m) => toBoard(m.clientX, m.clientY)).filter((p): p is [number, number] => p !== null);
  };

  /** End the stroke, keeping it if it is long enough to be a mark. A cancelled stroke
   *  is kept too: Android cancels the stylus the moment a palm lands, and throwing the
   *  line away would delete work the learner had already written. */
  const finish = () => {
    const done = stroke.current;
    drawingId.current = null;
    stroke.current = null;
    setCurrent(null);
    if (done && done.points.length >= 4) onStroke(done.points, done.erase);
  };

  return (
    <svg
      ref={svgRef}
      className="board"
      viewBox={`0 0 ${width} ${height}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      data-drawing={canDraw ? "true" : undefined}
      data-erasing={canDraw && erasing ? "true" : undefined}
      role="img"
      aria-label="Whiteboard"
      onPointerDown={(e) => {
        if (!canDraw) return;
        if (e.pointerType === "pen") sawPen.current = true;
        else if (sawPen.current && e.pointerType === "touch") return;
        // One stroke at a time. A second pointer during a stroke is the other hand
        // steadying the tablet, and it must not take the line over. The exception is
        // the stylus: a palm usually lands just before the pen writes, and the pen must
        // not be locked out until the hand is lifted. Its ink is dropped as the palm's.
        if (drawingId.current !== null && !(e.pointerType === "pen" && stroke.current?.pen === false)) return;
        const p = toBoard(e.clientX, e.clientY);
        if (!p) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drawingId.current = e.pointerId;
        stroke.current = { points: p, erase: Boolean(erasing) || isEraserEnd(e.button, e.buttons), pen: e.pointerType === "pen" };
        setCurrent(stroke.current);
      }}
      onPointerMove={(e) => {
        if (drawingId.current !== e.pointerId) return;
        const drawn = stroke.current;
        if (!drawn) return;
        const points = movePoints(e);
        const next = [...drawn.points];
        for (const [x, y] of points) {
          const [lx, ly] = next.slice(-2);
          if (Math.hypot(x - lx, y - ly) >= 2) next.push(x, y);
        }
        if (next.length === drawn.points.length) return;
        stroke.current = { ...drawn, points: next };
        setCurrent(stroke.current);
      }}
      onPointerUp={(e) => {
        if (drawingId.current !== e.pointerId) return;
        finish();
      }}
      // Both fire when the system takes the pointer away mid-stroke - a palm landing,
      // the browser starting a gesture, the stylus leaving range.
      onPointerCancel={(e) => {
        if (drawingId.current === e.pointerId) finish();
      }}
      onLostPointerCapture={(e) => {
        if (drawingId.current === e.pointerId) finish();
      }}
    >
      <defs>
        <pattern id="board-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#eef0f3" strokeWidth="1" />
        </pattern>
        {(Object.keys(INK) as BoardColor[]).map((c) => (
          <marker key={c} id={`board-arrow-${c}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={INK[c]} />
          </marker>
        ))}
      </defs>
      {background ? (
        <image href={background} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
      ) : null}
      {!plain && <rect width={width} height={height} fill="url(#board-grid)" />}
      {elements.map(renderElement)}
      {current && (current.erase ? <polyline points={current.points.join(" ")} {...rub(RUB_SIZE)} /> : <polyline points={current.points.join(" ")} {...pen(penColor)} />)}
    </svg>
  );
}

function pen(color: BoardColor) {
  return { fill: "none", stroke: INK[color], strokeWidth: 3.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
}

/** The eraser paints opaque white, so whatever is printed underneath disappears. */
function rub(size: number) {
  return { fill: "none", stroke: "#ffffff", strokeWidth: size, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
}

function renderElement(e: BoardElement): ReactNode {
  const style = { animationDelay: `${e.delay}ms` };
  const draw = { className: "board-draw", style, pathLength: 1 };
  const fade = { className: "board-fade", style };
  switch (e.type) {
    case "text":
      return (
        <text key={e.key} x={e.x} y={e.y} dominantBaseline="hanging" fontSize={FONT[e.size]} fill={INK[e.color]} className="board-text board-fade" style={style}>
          {e.text.split("\n").map((line, i) => (
            <tspan key={i} x={e.x} dy={i === 0 ? 0 : FONT[e.size] * 1.2}>
              {line}
            </tspan>
          ))}
        </text>
      );
    case "line":
      return (
        <line
          key={e.key}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke={INK[e.color]}
          strokeWidth={3}
          strokeLinecap="round"
          markerEnd={e.arrow ? `url(#board-arrow-${e.color})` : undefined}
          // A dashed line cannot also use the dash trick that animates drawing, so it fades in.
          {...(e.dashed ? { ...fade, strokeDasharray: "10 8" } : draw)}
        />
      );
    case "rect":
      return (
        <rect key={e.key} x={e.x} y={e.y} width={e.w} height={e.h} rx={4} stroke={INK[e.color]} strokeWidth={3} fill={e.fill ? INK[e.color] : "none"} fillOpacity={0.14} {...draw} />
      );
    case "circle":
      return <circle key={e.key} cx={e.cx} cy={e.cy} r={e.r} stroke={INK[e.color]} strokeWidth={3} fill={e.fill ? INK[e.color] : "none"} fillOpacity={0.14} {...draw} />;
    case "path": {
      const points = e.points.join(" ");
      return e.closed ? (
        <polygon key={e.key} points={points} stroke={INK[e.color]} strokeWidth={3} strokeLinejoin="round" fill="none" {...draw} />
      ) : (
        <polyline key={e.key} points={points} stroke={INK[e.color]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" {...draw} />
      );
    }
    case "stroke":
      return <polyline key={e.key} points={e.points.join(" ")} {...pen(e.color)} />;
    case "rub":
      return <polyline key={e.key} points={e.points.join(" ")} {...rub(e.size)} />;
    case "image":
      return (
        <g key={e.key} {...fade}>
          <rect x={e.x} y={e.y} width={e.w} height={e.h} fill="#fff" stroke="#d6d8dc" />
          <image href={e.url} x={e.x} y={e.y} width={e.w} height={e.h} preserveAspectRatio="xMidYMid meet" />
        </g>
      );
    case "plot":
      return <Plot key={e.key} plot={e} />;
  }
}

/** Axes plus a sampled function; segments break where it leaves the frame or is undefined. */
function Plot({ plot: e }: { plot: Extract<BoardElement, { type: "plot" }> }) {
  const style = { animationDelay: `${e.delay}ms` };
  const f = compileFn(e.fn);
  const spanX = e.xMax - e.xMin || 1;
  const spanY = e.yMax - e.yMin || 1;
  const sx = (x: number) => e.x + ((x - e.xMin) / spanX) * e.w;
  const sy = (y: number) => e.y + e.h - ((y - e.yMin) / spanY) * e.h;
  const axisY = sy(e.yMin <= 0 && e.yMax >= 0 ? 0 : e.yMin);
  const axisX = sx(e.xMin <= 0 && e.xMax >= 0 ? 0 : e.xMin);

  const segments: string[] = [];
  if (f) {
    let seg: string[] = [];
    const steps = 240;
    for (let k = 0; k <= steps; k++) {
      const x = e.xMin + (spanX * k) / steps;
      const y = f(x);
      const inside = Number.isFinite(y) && y >= e.yMin - spanY * 0.02 && y <= e.yMax + spanY * 0.02;
      if (inside) seg.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
      else if (seg.length) {
        segments.push(seg.join(" "));
        seg = [];
      }
    }
    if (seg.length) segments.push(seg.join(" "));
  }

  const axis = { stroke: "#6b7280", strokeWidth: 2, markerEnd: "url(#board-arrow-ink)" };
  const label = { fontSize: 16, fill: "#4b5563", className: "board-text" };
  return (
    <g className="board-fade" style={style}>
      <line x1={e.x} y1={axisY} x2={e.x + e.w} y2={axisY} {...axis} />
      <line x1={axisX} y1={e.y + e.h} x2={axisX} y2={e.y} {...axis} />
      <text x={e.x + e.w} y={axisY + 8} dominantBaseline="hanging" textAnchor="end" {...label}>
        {e.xLabel}
      </text>
      <text x={axisX + 8} y={e.y} dominantBaseline="hanging" {...label}>
        {e.yLabel}
      </text>
      {segments.map((points, i) => (
        <polyline key={i} points={points} fill="none" stroke={INK[e.color]} strokeWidth={3} strokeLinejoin="round" pathLength={1} className="board-draw" style={style} />
      ))}
      {!f && (
        <text x={e.x + 10} y={e.y + e.h / 2} {...label}>
          y = {e.fn}
        </text>
      )}
    </g>
  );
}

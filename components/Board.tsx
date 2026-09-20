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
  onStroke: (points: number[]) => void;
}
/** The shared whiteboard: the tutor's drawings animate in, and the learner can draw on top. */
export function Board({ elements, canDraw, penColor, erasing, onStroke, width = BOARD_W, height = BOARD_H, background, plain }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [current, setCurrent] = useState<number[] | null>(null);

  const toBoard = (e: PointerEvent<SVGSVGElement>): [number, number] | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    return [Math.round(p.x), Math.round(p.y)];
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
        const p = toBoard(e);
        if (!p) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setCurrent(p);
      }}
      onPointerMove={(e) => {
        if (!current) return;
        const p = toBoard(e);
        if (!p) return;
        const [lx, ly] = current.slice(-2);
        if (Math.hypot(p[0] - lx, p[1] - ly) >= 2) setCurrent([...current, ...p]);
      }}
      onPointerUp={() => {
        if (current && current.length >= 4) onStroke(current);
        setCurrent(null);
      }}
      onPointerCancel={() => setCurrent(null)}
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
      {current && (erasing ? <polyline points={current.join(" ")} {...rub(RUB_SIZE)} /> : <polyline points={current.join(" ")} {...pen(penColor)} />)}
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

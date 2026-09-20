import { useRef, useState, type PointerEvent } from "react";
import { PAGE_H, PAGE_W } from "../../shared/types";
import { HIGHLIGHT, newId, strokeHits, strokePath, type Stroke, type Tool } from "../lib/ink";

interface Props {
  strokes: Stroke[];
  tool: Tool;
  color: string;
  width: number;
  /** When false the layer is drawn but ignores the pointer. */
  interactive: boolean;
  visible: boolean;
  onAdd: (s: Stroke) => void;
  onErase: (ids: string[]) => void;
}

/** The learner's ink: an SVG the pointer draws into. */
export function InkLayer({ strokes, tool, color, width, interactive, visible, onAdd, onErase }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [current, setCurrent] = useState<number[] | null>(null);
  const erasing = useRef(false);
  const pointers = useRef(new Set<number>());
  const multiTouch = useRef(false);

  const toPage = (e: PointerEvent<SVGSVGElement>): [number, number] | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
  };

  const eraseAt = (x: number, y: number) => {
    const hit = strokes.filter((s) => strokeHits(s, x, y, 10)).map((s) => s.id);
    if (hit.length) onErase(hit);
  };

  const isHl = tool === "highlighter";
  const strokeColor = isHl ? HIGHLIGHT : color;
  const strokeWidth = isHl ? 22 : width;
  const ordered = [...strokes.filter((s) => s.highlighter), ...strokes.filter((s) => !s.highlighter)];

  return (
    <svg
      ref={svgRef}
      className="layer"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      style={{
        pointerEvents: interactive ? "auto" : "none",
        opacity: visible ? 1 : 0,
        cursor: tool === "eraser" ? "cell" : "crosshair",
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        pointers.current.add(e.pointerId);
        if (pointers.current.size > 1) {
          multiTouch.current = true;
          erasing.current = false;
          setCurrent(null);
          return;
        }
        if (!interactive) return;
        const p = toPage(e);
        if (!p) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (tool === "eraser") {
          erasing.current = true;
          eraseAt(...p);
        } else setCurrent(p);
      }}
      onPointerMove={(e) => {
        if (multiTouch.current) return;
        const p = toPage(e);
        if (!p) return;
        if (erasing.current) return eraseAt(...p);
        if (!current) return;
        const lx = current[current.length - 2], ly = current[current.length - 1];
        if (Math.hypot(p[0] - lx, p[1] - ly) >= 1.5) setCurrent([...current, ...p]);
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) multiTouch.current = false;
        erasing.current = false;
        if (current) {
          onAdd({ id: newId(), points: current, color: strokeColor, width: strokeWidth, highlighter: isHl });
          setCurrent(null);
        }
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) multiTouch.current = false;
        erasing.current = false;
        setCurrent(null);
      }}
    >
      {ordered.map((s) => (
        <path
          key={s.id}
          d={strokePath(s.points)}
          stroke={s.color}
          strokeWidth={s.width}
          strokeOpacity={s.highlighter ? 0.4 : 1}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {current && (
        <path
          d={strokePath(current)}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeOpacity={isHl ? 0.4 : 1}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

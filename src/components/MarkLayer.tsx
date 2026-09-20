import type { Mark } from "../../shared/types";
import { PAGE_H, PAGE_W } from "../../shared/types";
import { RED_PEN } from "../lib/ink";

interface Props {
  marks: Mark[];
  visible: boolean;
}

/** The grader's red pen: marks drawn on top of everything, animated in stroke by stroke. */
export function MarkLayer({ marks, visible }: Props) {
  return (
    <svg
      className="layer"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      style={{ pointerEvents: "none", opacity: visible ? 1 : 0 }}
    >
      <g
        stroke={RED_PEN}
        strokeWidth={3.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {marks.map((m, i) => (
          <g key={i} className="mark" style={{ animationDelay: `${i * 220}ms` }}>
            {renderMark(m)}
          </g>
        ))}
      </g>
    </svg>
  );
}

function renderMark(m: Mark) {
  switch (m.kind) {
    case "circle": {
      // slightly wobbly hand-drawn ellipse
      const rx = m.r, ry = m.r * 0.72;
      return (
        <path
          d={`M${m.cx + rx} ${m.cy} A${rx} ${ry} 0 1 1 ${m.cx - rx} ${m.cy} A${rx * 1.04} ${ry * 0.96} 0 1 1 ${m.cx + rx * 0.98} ${m.cy + ry * 0.12}`}
        />
      );
    }
    case "underline":
      return <path d={`M${m.x1} ${m.y} Q${(m.x1 + m.x2) / 2} ${m.y + 5} ${m.x2} ${m.y}`} />;
    case "cross": {
      const s = m.size / 2;
      return (
        <path d={`M${m.x - s} ${m.y - s} L${m.x + s} ${m.y + s} M${m.x + s} ${m.y - s} L${m.x - s} ${m.y + s}`} />
      );
    }
    case "check": {
      const s = m.size / 2;
      return <path d={`M${m.x - s} ${m.y} L${m.x - s * 0.2} ${m.y + s * 0.8} L${m.x + s * 1.2} ${m.y - s}`} />;
    }
    case "arrow": {
      const a = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
      const h = 12;
      const p1 = [m.x2 - h * Math.cos(a - 0.5), m.y2 - h * Math.sin(a - 0.5)];
      const p2 = [m.x2 - h * Math.cos(a + 0.5), m.y2 - h * Math.sin(a + 0.5)];
      return (
        <path d={`M${m.x1} ${m.y1} L${m.x2} ${m.y2} M${p1[0]} ${p1[1]} L${m.x2} ${m.y2} L${p2[0]} ${p2[1]}`} />
      );
    }
    case "text":
      return (
        <text x={m.x} y={m.y} fill={RED_PEN} stroke="none" className="mark-text">
          {m.text}
        </text>
      );
  }
}

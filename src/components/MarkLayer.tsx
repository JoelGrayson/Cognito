import type { Mark } from "../../shared/types";
import { PAGE_H, PAGE_W } from "../../shared/types";
import { RED_PEN } from "../lib/ink";
import { renderMark } from "../lib/marks";

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


// Static illustration of a generated roadmap. Not the interactive graph.
type Tone = "core" | "advanced" | "known" | "skipped";

const TONES: Record<Tone, { fill: string; stroke: string; text: string; sub: string; dash?: string }> = {
  core: { fill: "#f8efc8", stroke: "#e0cd84", text: "#5c4c14", sub: "#6d5b1c" },
  advanced: { fill: "#e4f1e3", stroke: "#b3d2b2", text: "#24552f", sub: "#2f6b3c" },
  known: { fill: "#f3ebe3", stroke: "#d6c8ba", text: "#5b4d42", sub: "#7d6e63" },
  skipped: { fill: "#fffdfa", stroke: "#d6c8ba", text: "#7d6e63", sub: "#7d6e63", dash: "5 4" },
};

const W = 150;
const H = 46;

const NODES: { id: string; title: string; sub: string; tone: Tone }[] = [
  { id: "python", title: "Python basics", sub: "Already know", tone: "known" },
  { id: "linalg", title: "Linear algebra", sub: "3 h", tone: "core" },
  { id: "prob", title: "Probability", sub: "4 h", tone: "core" },
  { id: "calc", title: "Calculus", sub: "Skipped", tone: "skipped" },
  { id: "regress", title: "Regression", sub: "5 h", tone: "advanced" },
  { id: "nn", title: "Neural networks", sub: "8 h", tone: "advanced" },
];

const AT: Record<string, [x: number, y: number]> = {
  python: [20, 16],
  linalg: [190, 16],
  prob: [20, 96],
  calc: [190, 96],
  regress: [105, 176],
  nn: [105, 256],
};

const EDGES: { d: string; dashed?: boolean }[] = [
  { d: "M95 62 V94" },
  { d: "M265 62 C265 84 140 74 140 94" },
  { d: "M95 142 C95 162 140 156 140 174" },
  { d: "M265 142 C265 162 220 156 220 174", dashed: true },
  { d: "M180 222 V254" },
];

export default function RoadmapPreview({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 318"
      role="img"
      aria-label="Example roadmap: Python basics marked as known, linear algebra and probability first, calculus skipped, then regression and neural networks."
      className={className}
    >
      <defs>
        <marker id="lp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke="#a3948a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {EDGES.map((edge) => (
        <path
          key={edge.d}
          d={edge.d}
          fill="none"
          stroke="#a3948a"
          strokeWidth="1.6"
          strokeDasharray={edge.dashed ? "4 4" : undefined}
          markerEnd="url(#lp-arrow)"
        />
      ))}
      {NODES.map((node) => {
        const tone = TONES[node.tone];
        const [x, y] = AT[node.id];
        return (
          <g key={node.id}>
            <rect
              x={x}
              y={y}
              width={W}
              height={H}
              rx="10"
              fill={tone.fill}
              stroke={tone.stroke}
              strokeWidth="1.5"
              strokeDasharray={tone.dash}
            />
            <text
              x={x + W / 2}
              y={y + 20}
              textAnchor="middle"
              fontSize="13.5"
              fontWeight="500"
              fill={tone.text}
              textDecoration={node.tone === "skipped" ? "line-through" : undefined}
            >
              {node.title}
            </text>
            <text x={x + W / 2} y={y + 36} textAnchor="middle" fontSize="11.5" fill={tone.sub}>
              {node.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

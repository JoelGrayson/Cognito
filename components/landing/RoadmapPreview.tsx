// Static illustration of a generated roadmap. Not the interactive graph.
type Tone = "core" | "advanced" | "known" | "skipped";

const TONES: Record<Tone, { fill: string; stroke: string; text: string; sub: string; dash?: string }> = {
  core: { fill: "#ecebfb", stroke: "#b7b3ee", text: "#3b3499", sub: "#4f48b8" },
  advanced: { fill: "#e5f2ec", stroke: "#a8d0be", text: "#22553f", sub: "#2e6a51" },
  known: { fill: "#f4f4f1", stroke: "#bdbbb3", text: "#3d3d3d", sub: "#5c5c5c" },
  skipped: { fill: "#ffffff", stroke: "#bdbbb3", text: "#5c5c5c", sub: "#5c5c5c", dash: "5 4" },
};

const W = 150;
const H = 46;

const NODES: { id: string; x: number; y: number; title: string; sub: string; tone: Tone }[] = [
  { id: "python", x: 20, y: 16, title: "Python basics", sub: "Already know", tone: "known" },
  { id: "linalg", x: 190, y: 16, title: "Linear algebra", sub: "3 h", tone: "core" },
  { id: "prob", x: 20, y: 96, title: "Probability", sub: "4 h", tone: "core" },
  { id: "calc", x: 190, y: 96, title: "Calculus", sub: "Skipped", tone: "skipped" },
  { id: "regress", x: 105, y: 176, title: "Regression", sub: "5 h", tone: "advanced" },
  { id: "nn", x: 105, y: 256, title: "Neural networks", sub: "8 h", tone: "advanced" },
];

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
          <path d="M1 1 L9 5 L1 9" fill="none" stroke="#8a8a85" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {EDGES.map((edge) => (
        <path
          key={edge.d}
          d={edge.d}
          fill="none"
          stroke="#8a8a85"
          strokeWidth="1.6"
          strokeDasharray={edge.dashed ? "4 4" : undefined}
          markerEnd="url(#lp-arrow)"
        />
      ))}
      {NODES.map((node) => {
        const tone = TONES[node.tone];
        return (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={W}
              height={H}
              rx="10"
              fill={tone.fill}
              stroke={tone.stroke}
              strokeWidth="1.5"
              strokeDasharray={tone.dash}
            />
            <text
              x={node.x + W / 2}
              y={node.y + 20}
              textAnchor="middle"
              fontSize="13.5"
              fontWeight="600"
              fill={tone.text}
              textDecoration={node.tone === "skipped" ? "line-through" : undefined}
            >
              {node.title}
            </text>
            <text x={node.x + W / 2} y={node.y + 36} textAnchor="middle" fontSize="11.5" fill={tone.sub}>
              {node.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

import { PEN_COLORS, type Tool } from "../lib/ink";

interface Props {
  tool: Tool;
  color: string;
  width: number;
  canUndo: boolean;
  canRedo: boolean;
  onTool: (t: Tool) => void;
  onColor: (c: string) => void;
  onWidth: (w: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function Toolbar({ tool, color, width, canUndo, canRedo, onTool, onColor, onWidth, onUndo, onRedo }: Props) {
  const tools: { id: Tool; label: string; icon: string }[] = [
    { id: "pen", label: "Pen", icon: "✎" },
    { id: "highlighter", label: "Highlighter", icon: "▮" },
    { id: "eraser", label: "Eraser", icon: "◫" },
  ];
  return (
    <div className="toolbar">
      <div className="group">
        {tools.map((t) => (
          <button
            key={t.id}
            className={`tool ${tool === t.id ? "active" : ""}`}
            title={t.label}
            aria-pressed={tool === t.id}
            onClick={() => onTool(t.id)}
          >
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      <div className="group">
        {PEN_COLORS.map((c) => (
          <button
            key={c}
            className={`color ${color === c ? "active" : ""}`}
            style={{ background: c }}
            title={c}
            aria-label={`Pen color ${c}`}
            onClick={() => {
              onColor(c);
              if (tool !== "pen") onTool("pen");
            }}
          />
        ))}
      </div>
      <div className="group">
        {[2, 3.5, 6].map((w) => (
          <button
            key={w}
            className={`size ${width === w ? "active" : ""}`}
            title={`Width ${w}`}
            aria-label={`Pen width ${w}`}
            onClick={() => onWidth(w)}
          >
            <span style={{ width: w * 2.2, height: w * 2.2 }} />
          </button>
        ))}
      </div>
      <div className="group">
        <button className="tool" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶ Undo
        </button>
        <button className="tool" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷ Redo
        </button>
      </div>
    </div>
  );
}

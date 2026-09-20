export type LayerId = "document" | "ink" | "marks";

export interface LayerState {
  visible: boolean;
}

interface Props {
  layers: Record<LayerId, LayerState>;
  counts: { ink: number; marks: number };
  onToggle: (id: LayerId) => void;
  onClear: (id: LayerId) => void;
}

const LABELS: Record<LayerId, { name: string; hint: string }> = {
  marks: { name: "Red pen", hint: "the grader's marks" },
  ink: { name: "Your writing", hint: "pen, highlighter, eraser" },
  document: { name: "Document", hint: "the question page" },
};

/** Notability-style layer list, top layer first. */
export function LayersPanel({ layers, counts, onToggle, onClear }: Props) {
  const order: LayerId[] = ["marks", "ink", "document"];
  return (
    <div className="layers">
      <div className="panel-title">Layers</div>
      {order.map((id) => (
        <div key={id} className={`layer-row ${layers[id].visible ? "" : "hidden-layer"}`}>
          <button
            className="eye"
            title={layers[id].visible ? "Hide layer" : "Show layer"}
            aria-pressed={layers[id].visible}
            onClick={() => onToggle(id)}
          >
            {layers[id].visible ? "●" : "○"}
          </button>
          <span className={`swatch swatch-${id}`} />
          <div className="layer-meta">
            <div className="layer-name">
              {LABELS[id].name}
              {id !== "document" && <span className="count">{counts[id]}</span>}
            </div>
            <div className="layer-hint">{LABELS[id].hint}</div>
          </div>
          {id !== "document" && (
            <button className="link" onClick={() => onClear(id)} disabled={counts[id] === 0}>
              clear
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

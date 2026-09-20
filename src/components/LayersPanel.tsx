import type { Mark } from "../../shared/types";
import { PAGE_H, PAGE_W } from "../../shared/types";
import { RED_PEN, strokePath, type Stroke } from "../lib/ink";
import { renderMark } from "../lib/marks";

export type LayerId = "document" | "ink" | "marks";

export interface LayerState {
  visible: boolean;
}

interface Props {
  open: boolean;
  layers: Record<LayerId, LayerState>;
  docSrc: string | null;
  strokes: Stroke[];
  marks: Mark[];
  onToggle: (id: LayerId) => void;
  onClear: (id: LayerId) => void;
  onClose: () => void;
}

const LABELS: Record<LayerId, string> = {
  marks: "Red pen",
  ink: "Your writing",
  document: "Document",
};

/** Floating layer list over the page, top layer first, with live thumbnails. */
export function LayersPanel({ open, layers, docSrc, strokes, marks, onToggle, onClear, onClose }: Props) {
  if (!open) return null;
  const order: LayerId[] = ["marks", "ink", "document"];
  const counts: Record<LayerId, number | null> = { marks: marks.length, ink: strokes.length, document: null };

  return (
    <div className="layers" role="dialog" aria-label="Layers">
      <div className="layers-head">
        <span className="panel-title">Layers</span>
        <button className="icon-btn" title="Close" aria-label="Close layers" onClick={onClose}>
          ✕
        </button>
      </div>
      {order.map((id) => {
        const visible = layers[id].visible;
        const count = counts[id];
        return (
          <div key={id} className={`layer-row ${visible ? "" : "hidden-layer"}`}>
            <div className="thumb" aria-hidden>
              {id === "document" && docSrc && <img src={docSrc} alt="" draggable={false} />}
              {id === "ink" && (
                <svg viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
                  {strokes.map((s) => (
                    <path
                      key={s.id}
                      d={strokePath(s.points)}
                      stroke={s.color}
                      strokeWidth={s.width * 3}
                      opacity={s.highlighter ? 0.5 : 1}
                    />
                  ))}
                </svg>
              )}
              {id === "marks" && (
                <svg
                  viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
                  fill="none"
                  stroke={RED_PEN}
                  strokeWidth={10}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {marks.map((m, i) => <g key={i}>{renderMark(m)}</g>)}
                </svg>
              )}
            </div>
            <div className="layer-meta">
              <div className="layer-name">{LABELS[id]}</div>
              {count !== null && (
                <div className="layer-hint">
                  {count} {count === 1 ? "item" : "items"}
                </div>
              )}
            </div>
            {id !== "document" && (
              <button
                className="icon-btn"
                title={`Clear ${LABELS[id].toLowerCase()}`}
                aria-label={`Clear ${LABELS[id]}`}
                disabled={count === 0}
                onClick={() => onClear(id)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />
                </svg>
              </button>
            )}
            <button
              className="icon-btn eye"
              title={visible ? "Hide layer" : "Show layer"}
              aria-pressed={visible}
              onClick={() => onToggle(id)}
            >
              {visible ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

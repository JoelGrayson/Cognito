/** Shared between the React client and the API server. */

/** Page size in CSS pixels (US letter at 96 dpi). All ink lives in this space. */
export const PAGE_W = 816;
export const PAGE_H = 1056;

/** The model places its marks on a 0..1000 grid in both axes; the client scales to the page. */
export const MARK_GRID = 1000;

export type Verdict = "correct" | "partial" | "incorrect" | "unclear";

export type Mark =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "underline"; x1: number; x2: number; y: number }
  | { kind: "cross"; x: number; y: number; size: number }
  | { kind: "check"; x: number; y: number; size: number }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "text"; x: number; y: number; text: string };

export interface CheckRequest {
  /** PNG data URL of the document with the learner's ink composited on top. */
  image: string;
  /** Optional plain-text statement of the question, when known. */
  question?: string;
}

export interface CheckResponse {
  verdict: Verdict;
  /** Short markdown-free feedback, a few sentences. */
  feedback: string;
  /** Concrete issues, one per line item. Empty when correct. */
  issues: string[];
  marks: Mark[];
}

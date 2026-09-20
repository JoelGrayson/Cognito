import type { GradedPage } from "@/lib/schema";
import type { GradePageInput } from "../functions/gradePage";
import { mockDelay } from "./delay";

/**
 * Deterministic graded page for MOCK_AI=true: three problems, the second marked partial,
 * with a red circle and a note where the slip would be. MOCK_AI_FAIL_GRADE=true throws.
 */
export async function mockGradePage(input: GradePageInput): Promise<GradedPage> {
  await mockDelay();
  if (process.env.MOCK_AI_FAIL_GRADE === "true") throw new Error("Mock grading failure (forced)");
  const x = Math.round(input.width * 0.55);
  const y = Math.round(input.height * 0.45);
  return {
    studentName: "",
    problems: [
      { label: "1", status: "correct", note: "" },
      { label: "2", status: "partial", note: "Sign error in the last step" },
      { label: "3", status: "correct", note: "" },
    ],
    feedback: "Clear working throughout. Check the sign when moving terms across the equals sign.",
    marks: [
      { type: "circle", id: "m1", cx: x, cy: y, r: Math.round(input.width * 0.06), fill: false, color: "red" },
      { type: "text", id: "m2", x: x + Math.round(input.width * 0.08), y, text: "sign?", size: "medium", color: "red" },
    ],
  };
}

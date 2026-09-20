import { GRADE_PAGE_SYSTEM_PROMPT, gradePagePrompt } from "@/lib/prompt";
import type { Provider, ProviderContext } from "@/lib/providers/types";
import { GradedPageSchema, type GradedPage } from "@/lib/schema";

export interface GradePageInput {
  /** Data URL of the page picture. */
  image: string;
  width: number;
  height: number;
  answerKey?: string;
}

export interface GradePageResult {
  page: GradedPage;
  model: string;
}

/** Grade one page of one student's worksheet with a provider that reads pictures. */
export async function gradePage(
  input: GradePageInput,
  provider: Provider,
  model?: string,
  ctx?: ProviderContext,
): Promise<GradePageResult> {
  const result = await provider.structured(
    {
      name: "graded_page",
      schema: GradedPageSchema,
      system: GRADE_PAGE_SYSTEM_PROMPT,
      user: gradePagePrompt({ width: input.width, height: input.height, answerKey: input.answerKey }),
      image: input.image,
      effort: "low",
    },
    model,
    ctx,
  );
  return { page: result.output, model: result.model };
}

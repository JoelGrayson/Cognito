import { PAGE_H, PAGE_W } from "../../shared/types";

export interface Doc {
  id: string;
  title: string;
  /** Plain-text statement of the question, sent to the grader alongside the image. */
  question: string;
  /** Rendered image of the page. */
  src: string;
}

export const SAMPLE_QUESTIONS: { title: string; question: string }[] = [
  {
    title: "Linear equation",
    question: "Solve for x:\n\n3x − 7 = 2x + 5\n\nShow each step of your work.",
  },
  {
    title: "Derivative",
    question: "Find f′(x) for\n\nf(x) = x³ · sin(x)\n\nUse the product rule and simplify.",
  },
  {
    title: "Quadratic",
    question: "Solve by factoring:\n\nx² − 5x + 6 = 0",
  },
  {
    title: "Word problem",
    question:
      "A train travels 180 miles in 2.5 hours.\nAt the same speed, how far does it travel in 4 hours?\n\nShow your reasoning.",
  },
  {
    title: "Geometry",
    question:
      "A right triangle has legs of length 6 and 8.\nFind the length of the hypotenuse and the area of the triangle.",
  },
];

/** Render a lined worksheet page with the question printed at the top. */
export function renderQuestionPage(title: string, question: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  ctx.fillStyle = "#6b7280";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillText(title.toUpperCase(), 56, 60);
  ctx.fillStyle = "#111827";
  ctx.font = "22px Georgia, 'Times New Roman', serif";
  let y = 100;
  for (const line of question.split("\n")) {
    for (const wrapped of wrap(ctx, line, PAGE_W - 112)) {
      ctx.fillText(wrapped, 56, y);
      y += 32;
    }
  }
  y += 8;
  ctx.fillStyle = "#9ca3af";
  ctx.font = "italic 14px system-ui, sans-serif";
  ctx.fillText("Show your work below.", 56, y);
  y += 14;

  // ruled lines
  ctx.strokeStyle = "#dbe4f3";
  ctx.lineWidth = 1;
  for (let ly = y + 20; ly < PAGE_H - 40; ly += 32) {
    ctx.beginPath();
    ctx.moveTo(56, ly + 0.5);
    ctx.lineTo(PAGE_W - 56, ly + 0.5);
    ctx.stroke();
  }
  // margin
  ctx.strokeStyle = "#f1b8b8";
  ctx.beginPath();
  ctx.moveTo(96.5, y);
  ctx.lineTo(96.5, PAGE_H - 40);
  ctx.stroke();
  return canvas.toDataURL("image/png");
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  lines.push(cur);
  return lines;
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("could not read file"));
    r.readAsDataURL(file);
  });
}

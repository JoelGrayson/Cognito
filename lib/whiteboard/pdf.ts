/**
 * Worksheet file -> page images. Browser only.
 *
 * A PDF is rasterised here, in the browser, rather than uploaded: the canvas needs an
 * image to draw on and the OCR needs an image to read, and one render serves both.
 * pdf.js is imported lazily because it is large and most sessions never upload.
 */
export interface PageImage {
  /** JPEG data URL. */
  src: string;
  /** Pixel size of `src`. */
  w: number;
  h: number;
}

/** Worksheets are a page or two. The cap is against a textbook dropped in by mistake:
 *  every page is an OCR call and a multi-megabyte image on the canvas. */
export const MAX_PAGES = 8;
/** Long edge of a rendered page. Enough for Mathpix to read small print, small enough
 *  that a page stays a few hundred KB. */
const TARGET_LONG_EDGE = 2000;

function toJpeg(canvas: HTMLCanvasElement): PageImage {
  return { src: canvas.toDataURL("image/jpeg", 0.85), w: canvas.width, h: canvas.height };
}

function blankCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't get a drawing surface for the worksheet.");
  // JPEG has no alpha; an unpainted canvas would come out black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function pagesOfPdf(file: File): Promise<PageImage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const doc = await task.promise;
    const out: PageImage[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: TARGET_LONG_EDGE / Math.max(base.width, base.height) });
      const { canvas, ctx } = blankCanvas(viewport.width, viewport.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      out.push(toJpeg(canvas));
    }
    return out;
  } finally {
    await task.destroy();
  }
}

async function pageOfImage(file: File): Promise<PageImage[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, TARGET_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const { canvas, ctx } = blankCanvas(bitmap.width * scale, bitmap.height * scale);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return [toJpeg(canvas)];
}

/** A PDF, or a photo / screenshot of a problem. */
export function pagesOf(file: File): Promise<PageImage[]> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return pagesOfPdf(file);
  if (file.type.startsWith("image/")) return pageOfImage(file);
  return Promise.reject(new Error("Upload a PDF or an image."));
}

"use client";
/**
 * Reads the text layer of a PDF in the browser with pdf.js. The file never
 * leaves the device. Scanned PDFs (images only) have no text layer.
 */
type TextItem = { str: string; transform: number[] };

export async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 50); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = (content.items as TextItem[]).filter((i) => typeof i.str === "string" && i.str.trim());
      // Rebuild lines: group by baseline (y), then order left to right (x).
      const lines: { y: number; parts: { x: number; s: string }[] }[] = [];
      for (const item of items) {
        const x = item.transform[4];
        const y = item.transform[5];
        let line = lines.find((l) => Math.abs(l.y - y) <= 2.5);
        if (!line) { line = { y, parts: [] }; lines.push(line); }
        line.parts.push({ x, s: item.str });
      }
      lines.sort((a, b) => b.y - a.y);
      pages.push(lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).join(" ")).join("\n"));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages.join("\n\n");
}

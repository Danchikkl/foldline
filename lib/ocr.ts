import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createSignedDocumentDownload } from "@/lib/storage";

type ConversionResult = {
  format: "markdown" | "text" | "error";
  data?: string;
  error?: string;
};

type MarkdownAI = {
  toMarkdown(input: { name: string; blob: Blob }): Promise<ConversionResult | ConversionResult[]>;
};

/** Checks the file signature so an HTML or script file cannot travel as "application/pdf". */
export function matchesDeclaredType(head: Uint8Array, contentType: string) {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  if (contentType === "application/pdf") return starts(0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
  if (contentType === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (contentType === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (contentType === "image/webp") return starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
  return false;
}

export async function extractDocumentMarkdown(document: {
  storage_key: string;
  original_filename: string;
  content_type: string;
}) {
  const signedUrl = await createSignedDocumentDownload(document.storage_key, 120);
  const fileResponse = await fetch(signedUrl, { cache: "no-store" });

  if (!fileResponse.ok) {
    throw new Error("Could not download the stored document for OCR.");
  }

  const buffer = await fileResponse.arrayBuffer();
  if (!matchesDeclaredType(new Uint8Array(buffer.slice(0, 16)), document.content_type)) {
    throw new Error("File content does not match its declared type.");
  }
  const { env } = getCloudflareContext();
  const ai = (env as CloudflareEnv & { AI: MarkdownAI }).AI;

  if (!ai) {
    throw new Error("Cloudflare AI binding is not available.");
  }

  const result = await ai.toMarkdown({
    name: document.original_filename,
    blob: new Blob([buffer], {
      type: document.content_type || "application/octet-stream",
    }),
  });

  const converted = Array.isArray(result) ? result[0] : result;
  if (!converted) {
    throw new Error("Cloudflare document conversion returned no result.");
  }
  if (converted.format === "error") {
    throw new Error(converted.error || "Cloudflare document conversion failed.");
  }

  const markdown = converted.data?.trim();
  if (!markdown) {
    throw new Error("Cloudflare document conversion returned empty text.");
  }

  return markdown;
}

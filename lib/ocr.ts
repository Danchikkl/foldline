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

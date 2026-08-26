import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSignedDocumentDownload } from "@/lib/storage";
import { jsonError } from "@/lib/http";

type MarkdownAI = {
  toMarkdown(input: { name: string; blob: Blob }): Promise<unknown>;
};

export async function GET(request: Request) {
  const user = await requireAdmin();
  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId || !/^[0-9a-f-]{36}$/i.test(documentId)) return jsonError("Valid documentId is required.", 400);

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id,owner_id,original_filename,storage_key,content_type,size_bytes")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc || doc.owner_id !== user.id) return jsonError("Document not found.", 404);
  if (!doc.storage_key) return jsonError("Document has no stored file.", 409);

  try {
    const signedUrl = await createSignedDocumentDownload(doc.storage_key, 120);
    const fileResponse = await fetch(signedUrl, { cache: "no-store" });
    if (!fileResponse.ok) return jsonError("Could not download the stored document.", 502);

    const buffer = await fileResponse.arrayBuffer();
    const { env } = getCloudflareContext();
    const ai = (env as CloudflareEnv & { AI: MarkdownAI }).AI;
    const result = await ai.toMarkdown({
      name: doc.original_filename,
      blob: new Blob([buffer], { type: doc.content_type || "application/octet-stream" }),
    });

    return Response.json(
      { ok: true, documentId: doc.id, filename: doc.original_filename, bytes: buffer.byteLength, result },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloudflare document conversion failed.";
    return jsonError(message, 502);
  }
}

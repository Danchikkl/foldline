import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { extractDocumentMarkdown } from "@/lib/ocr";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { data: doc } = await supabase
    .from("documents")
    .select("id,storage_key,original_filename,content_type,status")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return jsonError("Not found", 404);
  if (["queued", "processing"].includes(doc.status)) return jsonError("Document is already being processed.", 409);
  if (doc.status === "uploading") return jsonError("Upload has not been verified yet.", 409);
  if (doc.status !== "failed") return jsonError("Only failed documents can be retried.", 409);

  const admin = createAdminClient();
  const { count: attemptCount } = await admin
    .from("processing_jobs")
    .select("id", { count: "exact", head: true })
    .eq("document_id", id);
  if ((attemptCount ?? 0) >= 3) return jsonError("Retry limit reached. Contact support before processing again.", 429);

  await admin
    .from("documents")
    .update({ status: "queued", error_message: null })
    .eq("id", id)
    .eq("owner_id", user.id);

  const { data: job, error: jobError } = await admin
    .from("processing_jobs")
    .insert({ document_id: id, status: "queued" })
    .select("id")
    .single();
  if (jobError || !job) return jsonError("Could not queue processing.", 500);

  try {
    await admin
      .from("documents")
      .update({ status: "processing", error_message: null })
      .eq("id", id)
      .eq("owner_id", user.id);
    await admin
      .from("processing_jobs")
      .update({ status: "processing" })
      .eq("id", job.id);

    const markdown = await extractDocumentMarkdown(doc);
    const processedAt = new Date().toISOString();

    const { error: documentUpdateError } = await admin
      .from("documents")
      .update({
        status: "ready",
        raw_ocr_text: markdown,
        error_message: null,
        processed_at: processedAt,
      })
      .eq("id", id)
      .eq("owner_id", user.id);

    if (documentUpdateError) throw new Error("Could not save extracted document text.");

    await admin
      .from("processing_jobs")
      .update({ status: "completed", finished_at: processedAt })
      .eq("id", job.id);

    return Response.json({ ok: true, status: "ready", extractedCharacters: markdown.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document conversion failed.";
    console.error("Cloudflare OCR retry failed", { documentId: id, error: message });

    await admin
      .from("processing_jobs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", job.id);
    await admin
      .from("documents")
      .update({ status: "failed", error_message: "Document conversion failed. Please try again." })
      .eq("id", id)
      .eq("owner_id", user.id);

    return jsonError(message, 502);
  }
}

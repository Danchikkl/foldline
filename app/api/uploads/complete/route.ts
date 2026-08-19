import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { deleteDocumentObject, getDocumentInfo } from "@/lib/storage";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { dispatchOcr } from "@/lib/ocr";

const schema = z.object({ documentId: z.string().uuid() });

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid document id.");
  const { data: doc } = await supabase
    .from("documents")
    .select("id,storage_key,original_filename,content_type,size_bytes,status")
    .eq("id", parsed.data.documentId)
    .maybeSingle();
  if (!doc) return jsonError("Document not found.", 404);
  if (doc.status !== "uploading") {
    if (["queued", "processing", "ready", "reviewed"].includes(doc.status)) return Response.json({ ok: true, status: doc.status });
    return jsonError("This upload cannot be completed in its current state.", 409);
  }

  const admin = createAdminClient();
  try {
    const info = await getDocumentInfo(doc.storage_key);
    const actual = Number(info.size || 0);
    const actualType = String(info.contentType || "");

    if (actual <= 0 || actual > MAX_UPLOAD_BYTES || actual !== Number(doc.size_bytes)) {
      await deleteDocumentObject(doc.storage_key);
      await admin.from("documents").update({ status: "failed", error_message: "Upload size verification failed." }).eq("id", doc.id).eq("owner_id", user.id);
      return jsonError("Uploaded object failed integrity checks.", 400);
    }
    if (actualType && actualType !== doc.content_type) {
      await deleteDocumentObject(doc.storage_key);
      await admin.from("documents").update({ status: "failed", error_message: "Content type mismatch." }).eq("id", doc.id).eq("owner_id", user.id);
      return jsonError("Content type mismatch.", 400);
    }

    await admin.from("documents").update({ status: "queued", error_message: null }).eq("id", doc.id).eq("owner_id", user.id);
    const { data: job, error: jobError } = await admin.from("processing_jobs").insert({ document_id: doc.id, status: "queued" }).select("id").single();
    if (jobError || !job) throw new Error("Could not create processing job.");

    // Storage is now complete even if OCR is not configured yet.
    try {
      await dispatchOcr(doc);
      await admin.from("processing_jobs").update({ status: "processing" }).eq("id", job.id);
    } catch (error) {
      await admin.from("processing_jobs").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", job.id);
      console.warn("OCR dispatch is not available yet", error);
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("upload-complete failed", e);
    return jsonError("Could not verify this upload.", 502);
  }
}

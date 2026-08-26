import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { deleteDocumentObject, getDocumentInfo } from "@/lib/storage";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { extractDocumentMarkdown } from "@/lib/ocr";
import { analyzeInvoice } from "@/lib/invoice-engine";
import { validateInvoiceForDocument } from "@/lib/invoice-history";

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
    .select("id,storage_key,original_filename,content_type,size_bytes,status,organization_id")
    .eq("id", parsed.data.documentId)
    .maybeSingle();

  if (!doc) return jsonError("Document not found.", 404);
  if (doc.status !== "uploading") {
    if (["queued", "processing", "ready", "reviewed", "failed"].includes(doc.status)) {
      return Response.json({ ok: true, status: doc.status });
    }
    return jsonError("This upload cannot be completed in its current state.", 409);
  }

  const admin = createAdminClient();

  try {
    const info = await getDocumentInfo(doc.storage_key);
    const actual = Number(info.size || 0);
    const actualType = String(info.contentType || "");

    if (actual <= 0 || actual > MAX_UPLOAD_BYTES || actual !== Number(doc.size_bytes)) {
      await deleteDocumentObject(doc.storage_key);
      await admin
        .from("documents")
        .update({ status: "failed", error_message: "Upload size verification failed." })
        .eq("id", doc.id)
        .eq("owner_id", user.id);
      return jsonError("Uploaded object failed integrity checks.", 400);
    }

    if (actualType && actualType !== doc.content_type) {
      await deleteDocumentObject(doc.storage_key);
      await admin
        .from("documents")
        .update({ status: "failed", error_message: "Content type mismatch." })
        .eq("id", doc.id)
        .eq("owner_id", user.id);
      return jsonError("Content type mismatch.", 400);
    }

    await admin
      .from("documents")
      .update({ status: "queued", error_message: null })
      .eq("id", doc.id)
      .eq("owner_id", user.id);

    const { data: job, error: jobError } = await admin
      .from("processing_jobs")
      .insert({ document_id: doc.id, status: "queued" })
      .select("id")
      .single();

    if (jobError || !job) throw new Error("Could not create processing job.");

    try {
      await admin
        .from("documents")
        .update({ status: "processing", error_message: null })
        .eq("id", doc.id)
        .eq("owner_id", user.id);
      await admin
        .from("processing_jobs")
        .update({ status: "processing" })
        .eq("id", job.id);

      const markdown = await extractDocumentMarkdown(doc);
      const analysis = analyzeInvoice(markdown);
      const validation = await validateInvoiceForDocument({
        documentId: doc.id,
        organizationId: doc.organization_id,
        data: analysis.data,
        extraction: analysis.extraction,
      });
      const processedAt = new Date().toISOString();

      const { error: documentUpdateError } = await admin
        .from("documents")
        .update({
          status: "ready",
          raw_ocr_text: markdown,
          extracted_data: analysis.data,
          validation_data: validation,
          error_message: null,
          processed_at: processedAt,
        })
        .eq("id", doc.id)
        .eq("owner_id", user.id);

      if (documentUpdateError) throw new Error("Could not save extracted document data.");

      await admin
        .from("processing_jobs")
        .update({ status: "completed", finished_at: processedAt })
        .eq("id", job.id);

      return Response.json({
        ok: true,
        status: "ready",
        extractedCharacters: markdown.length,
        extractionStatus: validation.extraction.status,
        riskLevel: validation.risk_level,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document conversion failed.";
      console.error("Document analysis failed", { documentId: doc.id, error: message });

      await admin
        .from("processing_jobs")
        .update({ status: "failed", finished_at: new Date().toISOString() })
        .eq("id", job.id);
      await admin
        .from("documents")
        .update({
          status: "failed",
          error_message: "Document processing failed. Please try again.",
        })
        .eq("id", doc.id)
        .eq("owner_id", user.id);

      return Response.json({ ok: false, status: "failed", error: message }, { status: 502 });
    }
  } catch (e) {
    console.error("upload-complete failed", e);
    return jsonError("Could not verify this upload.", 502);
  }
}

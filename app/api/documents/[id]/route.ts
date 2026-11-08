import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { documentPatchSchema } from "@/lib/schemas";
import { validateInvoiceForDocument } from "@/lib/invoice-history";
import { deleteAndVerify } from "@/lib/retention";

const STALE_PROCESSING_MS = 2 * 60 * 1000;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { data: doc } = await supabase
    .from("documents")
    .select("id,status,error_message,updated_at,created_at")
    .eq("id", id)
    .maybeSingle();

  if (!doc) return jsonError("Not found.", 404);

  const isInFlight = ["uploading", "queued", "processing"].includes(doc.status);
  const lastTouched = new Date(doc.updated_at || doc.created_at).getTime();
  const isStale = Number.isFinite(lastTouched) && Date.now() - lastTouched > STALE_PROCESSING_MS;

  if (isInFlight && isStale) {
    const admin = createAdminClient();
    const message = "Document processing timed out. Retry processing or upload the document again.";

    await admin
      .from("documents")
      .update({
        status: "failed",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_id", user.id);

    await admin
      .from("processing_jobs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("document_id", id)
      .in("status", ["queued", "processing"]);

    return Response.json(
      { ...doc, status: "failed", error_message: message },
      { headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(doc, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { data: owned } = await supabase
    .from("documents")
    .select("id,status,organization_id,shipment_id")
    .eq("id", id)
    .maybeSingle();
  if (!owned) return jsonError("Not found.", 404);
  if (!["ready", "reviewed"].includes(owned.status)) return jsonError("Document is not ready for review.", 409);

  const parsed = documentPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid document data.");

  const humanConfirmed = parsed.data.action === "approve";
  const validation = await validateInvoiceForDocument({
    documentId: id,
    organizationId: owned.organization_id,
    shipmentId: owned.shipment_id,
    data: parsed.data.extracted,
    humanConfirmed,
  });

  const update: Record<string, unknown> = {
    extracted_data: parsed.data.extracted,
    validation_data: validation,
    updated_at: new Date().toISOString(),
  };
  if (humanConfirmed) {
    update.status = "reviewed";
    update.reviewed_at = new Date().toISOString();
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("documents")
    .update(update)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return jsonError("Not found or not permitted.", 404);

  await admin.from("audit_events").insert({
    user_id: user.id,
    document_id: id,
    event_type: humanConfirmed ? "document.approved" : "document.edited",
    metadata: {
      risk_score: validation.risk_score,
      risk_level: validation.risk_level,
      extraction_status: validation.extraction.status,
      engine_version: validation.engine_version,
    },
  });

  return Response.json({ ok: true, validation });
}

/**
 * Deletes a document for real: the stored original is removed and verified
 * gone from active storage, then the row (fields, text, checks) is deleted.
 * Access goes through the user's own RLS-scoped client, so only members of the
 * document's organization can delete it.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { data: doc } = await supabase
    .from("documents")
    .select("id,storage_key,organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return jsonError("Not found.", 404);

  const removed = await deleteAndVerify(doc.storage_key);
  if (!removed) return jsonError("Could not delete the original file. Nothing was removed; try again.", 502);

  const admin = createAdminClient();
  const { error } = await admin.from("documents").delete().eq("id", id).eq("organization_id", doc.organization_id);
  if (error) return jsonError("The original file was deleted, but the record could not be. Try again.", 500);

  await admin.from("audit_events").insert({
    user_id: user.id,
    document_id: null,
    event_type: "document.deleted",
    metadata: { document_id: id, original_deleted: true },
  });

  return Response.json({ ok: true, deleted: id, originalDeleted: true });
}

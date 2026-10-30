import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { documentPatchSchema } from "@/lib/schemas";
import { outcomeOf, type InvoiceData } from "@/lib/invoice";
import { buildValidation, recheckLaterInvoices } from "@/lib/revalidate";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { data: owned } = await supabase.from("documents").select("id,status,owner_id,created_at").eq("id", id).maybeSingle();
  if (!owned) return jsonError("Not found.", 404);
  if (!["ready", "reviewed"].includes(owned.status)) return jsonError("Document is not ready for review.", 409);

  const parsed = documentPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid document data.");
  const extracted = parsed.data.extracted as InvoiceData;

  const admin = createAdminClient();
  let validation;
  try {
    validation = await buildValidation(admin, { id, owner_id: user.id, created_at: owned.created_at }, extracted);
  } catch (e) {
    console.error("validation failed", e);
    return jsonError("Could not run checks. Try again.", 500);
  }

  const update: Record<string, unknown> = {
    extracted_data: extracted,
    validation_data: validation,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.action === "approve") {
    update.status = "reviewed";
    update.reviewed_at = new Date().toISOString();
  }

  const { data, error } = await admin.from("documents").update(update).eq("id", id).eq("owner_id", user.id).select("id").maybeSingle();
  if (error || !data) return jsonError("Not found or not permitted.", 404);
  await admin.from("audit_events").insert({
    user_id: user.id,
    document_id: id,
    event_type: parsed.data.action === "approve" ? "document.approved" : "document.edited",
    metadata: {
      outcome: outcomeOf(validation),
      risk_score: validation.risk_score,
      // Approving despite a flag is a decision worth keeping on record.
      open_exceptions: validation.checks.filter((c) => ["issue", "possible", "unverified"].includes(c.status)).map((c) => c.id),
    },
  });

  try { await recheckLaterInvoices(admin, { id, owner_id: user.id, created_at: owned.created_at }, extracted); } catch (e) { console.error("recheck-later failed", e); }

  return Response.json({ ok: true, validation });
}

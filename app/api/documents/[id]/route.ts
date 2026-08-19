import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { documentPatchSchema } from "@/lib/schemas";
import { validateInvoice } from "@/lib/invoice";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { data: doc } = await supabase
    .from("documents")
    .select("id,status,error_message,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (!doc) return jsonError("Not found.", 404);
  return Response.json(doc, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { data: owned } = await supabase.from("documents").select("id,status").eq("id", id).maybeSingle();
  if (!owned) return jsonError("Not found.", 404);
  if (!["ready", "reviewed"].includes(owned.status)) return jsonError("Document is not ready for review.", 409);

  const parsed = documentPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid document data.");
  const validation = validateInvoice(parsed.data.extracted);
  const update: Record<string, unknown> = {
    extracted_data: parsed.data.extracted,
    validation_data: validation,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.action === "approve") {
    update.status = "reviewed";
    update.reviewed_at = new Date().toISOString();
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("documents").update(update).eq("id", id).eq("owner_id", user.id).select("id").maybeSingle();
  if (error || !data) return jsonError("Not found or not permitted.", 404);
  await admin.from("audit_events").insert({
    user_id: user.id,
    document_id: id,
    event_type: parsed.data.action === "approve" ? "document.approved" : "document.edited",
    metadata: { risk_score: validation.risk_score },
  });
  return Response.json({ ok: true, validation });
}

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadRequestSchema } from "@/lib/schemas";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { createSignedDocumentUpload } from "@/lib/storage";
import { PLAN_LIMITS } from "@/lib/constants";

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const parsed = uploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid file metadata.");
  const { filename, contentType, size, shipmentId } = parsed.data;

  const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
  const plan = sub?.plan === "pro" ? "pro" : "free";
  const start = new Date();
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase.from("documents").select("id", { count: "exact", head: true }).gte("created_at", start.toISOString());
  if ((count ?? 0) >= PLAN_LIMITS[plan]) return jsonError("Monthly document limit reached. Upgrade or wait for the next cycle.", 402);

  const admin = createAdminClient();
  let organizationId: string | null = null;

  if (shipmentId) {
    const { data: shipment } = await admin
      .from("shipments")
      .select("id,organization_id")
      .eq("id", shipmentId)
      .maybeSingle();
    if (!shipment) return jsonError("Shipment not found.", 404);

    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", shipment.organization_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return jsonError("Shipment not found.", 404);
    organizationId = shipment.organization_id;
  } else {
    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    organizationId = membership?.organization_id ?? null;
  }

  if (!organizationId) return jsonError("No workspace is available for this account.", 409);

  const ext = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const id = crypto.randomUUID();
  const key = `organizations/${organizationId}/${new Date().toISOString().slice(0, 7)}/${id}.${ext}`;

  const { error } = await admin.from("documents").insert({
    id,
    owner_id: user.id,
    organization_id: organizationId,
    shipment_id: shipmentId ?? null,
    original_filename: filename,
    storage_key: key,
    content_type: contentType,
    size_bytes: size,
    status: "uploading",
  });
  if (error) return jsonError("Could not create document record.", 500);

  try {
    const signed = await createSignedDocumentUpload(key);
    return Response.json({ documentId: id, uploadPath: signed.path, uploadToken: signed.token });
  } catch {
    await admin.from("documents").delete().eq("id", id).eq("owner_id", user.id);
    return jsonError("Could not prepare secure upload.", 502);
  }
}

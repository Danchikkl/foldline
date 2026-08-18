import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shipmentCreateSchema } from "@/lib/schemas";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const parsed = shipmentCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid shipment details.");

  const admin = createAdminClient();
  let organizationId = parsed.data.organizationId;

  if (organizationId) {
    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return jsonError("Workspace not found.", 404);
  } else {
    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id,role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    organizationId = membership?.organization_id;
  }

  if (!organizationId) return jsonError("No workspace is available for this account.", 409);

  const id = crypto.randomUUID();
  const { data: shipment, error } = await admin
    .from("shipments")
    .insert({
      id,
      organization_id: organizationId,
      created_by: user.id,
      reference: parsed.data.reference,
      origin: parsed.data.origin || null,
      destination: parsed.data.destination || null,
      status: "draft",
      risk_score: 0,
    })
    .select("id,reference,origin,destination,status,risk_score,created_at")
    .single();

  if (error || !shipment) return jsonError("Could not create shipment.", 500);

  await admin.from("usage_events").insert({
    organization_id: organizationId,
    user_id: user.id,
    shipment_id: shipment.id,
    event_type: "shipment_created",
    units: 1,
  });

  await admin.from("audit_events").insert({
    user_id: user.id,
    organization_id: organizationId,
    shipment_id: shipment.id,
    event_type: "shipment_created",
    metadata: { reference: shipment.reference },
  });

  return Response.json({ shipment }, { status: 201 });
}

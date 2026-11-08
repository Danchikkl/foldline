import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { userOrganizationId, vaultRecordSchema } from "@/lib/vault/server";

const noStore = { headers: { "cache-control": "no-store" } };

/** All encrypted records of the workspace. The server cannot read them. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const organizationId = await userOrganizationId(createAdminClient(), user);
  if (!organizationId) return jsonError("No workspace is available for this account.", 409);
  const { data, error } = await supabase
    .from("vault_records")
    .select("id,iv,ciphertext,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) return jsonError("Could not load records.", 500);
  return Response.json({ organizationId, records: data ?? [] }, noStore);
}

/** Saves (or replaces) one encrypted record. */
export async function PUT(request: Request) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const parsed = vaultRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid record.");

  const admin = createAdminClient();
  const organizationId = await userOrganizationId(admin, user);
  if (!organizationId) return jsonError("No workspace is available for this account.", 409);

  // An existing id must belong to this workspace; never move a record across workspaces.
  const { data: existing } = await admin.from("vault_records").select("organization_id").eq("id", parsed.data.id).maybeSingle();
  if (existing && existing.organization_id !== organizationId) return jsonError("Not found.", 404);

  const now = new Date().toISOString();
  const { error } = await admin.from("vault_records").upsert({
    id: parsed.data.id,
    organization_id: organizationId,
    created_by: user.id,
    iv: parsed.data.iv,
    ciphertext: parsed.data.ciphertext,
    updated_at: now,
  });
  if (error) return jsonError("Could not save the record.", 500);
  return Response.json({ ok: true }, noStore);
}

/** Deletes one record for good. */
export async function DELETE(request: Request) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Invalid id.");

  const admin = createAdminClient();
  const organizationId = await userOrganizationId(admin, user);
  if (!organizationId) return jsonError("No workspace is available for this account.", 409);
  const { error, count } = await admin.from("vault_records").delete({ count: "exact" }).eq("id", id).eq("organization_id", organizationId);
  if (error) return jsonError("Could not delete the record.", 500);
  if (!count) return jsonError("Not found.", 404);
  return Response.json({ ok: true }, noStore);
}

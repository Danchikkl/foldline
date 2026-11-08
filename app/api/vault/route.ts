import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { userOrganizationId, vaultHeaderSchema } from "@/lib/vault/server";

const noStore = { headers: { "cache-control": "no-store" } };

/** The workspace's vault header (salt, KDF parameters, wrapped key). Never a usable key. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const organizationId = await userOrganizationId(createAdminClient(), user);
  if (!organizationId) return jsonError("No workspace is available for this account.", 409);
  const { data } = await supabase.from("organization_vaults").select("header").eq("organization_id", organizationId).maybeSingle();
  return Response.json({ organizationId, header: data?.header ?? null }, noStore);
}

/** Creates the vault once. The header is generated in the browser. */
export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const parsed = vaultHeaderSchema.safeParse((await request.json().catch(() => null))?.header);
  if (!parsed.success) return jsonError("Invalid vault header.");

  const admin = createAdminClient();
  const organizationId = await userOrganizationId(admin, user);
  if (!organizationId) return jsonError("No workspace is available for this account.", 409);

  const { error } = await admin.from("organization_vaults").insert({ organization_id: organizationId, created_by: user.id, header: parsed.data });
  if (error) return jsonError(error.code === "23505" ? "This workspace already has a vault." : "Could not create the vault.", error.code === "23505" ? 409 : 500);
  await admin.from("audit_events").insert({ user_id: user.id, event_type: "vault.created", metadata: { organization_id: organizationId } });
  return Response.json({ ok: true, organizationId }, noStore);
}

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { TRIAL_TERMS_VERSION } from "@/lib/trial";

/**
 * Records that the signed-in user accepted the current trial terms.
 * Stored server-side in app_metadata (not writable by the browser), with the
 * terms version and timestamp, so acceptance can be shown later if needed.
 */
export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null) as { version?: string } | null;
  if (body?.version !== TRIAL_TERMS_VERSION) return jsonError("These terms have changed. Reload the page and review them again.", 409);

  const acceptance = { version: TRIAL_TERMS_VERSION, accepted_at: new Date().toISOString() };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), trial_terms: acceptance },
  });
  if (error) return jsonError("Could not record your acceptance. Try again.", 500);

  await admin.from("audit_events").insert({
    user_id: user.id,
    event_type: "trial_terms.accepted",
    metadata: acceptance,
  });

  return Response.json({ ok: true, ...acceptance });
}

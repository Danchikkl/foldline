import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

function shapeError(error: any) {
  if (!error) return null;
  return {
    name: error.name || null,
    code: error.code || null,
    status: error.status || null,
    message: error.message || String(error),
  };
}

export async function GET() {
  const user = await requireAdmin();

  try {
    const admin = createAdminClient();
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);

    const [shipments, subscription, documents] = await Promise.all([
      admin
        .from("shipments")
        .select("id", { count: "exact", head: true })
        .eq("created_by", user.id),
      admin
        .from("subscriptions")
        .select("plan,status")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .gte("created_at", start.toISOString()),
    ]);

    return Response.json({
      ok: !shipments.error && !subscription.error && !documents.error,
      queries: {
        shipments: { ok: !shipments.error, count: shipments.count ?? 0, error: shapeError(shipments.error) },
        subscription: { ok: !subscription.error, hasRow: Boolean(subscription.data), error: shapeError(subscription.error) },
        documents: { ok: !documents.error, count: documents.count ?? 0, error: shapeError(documents.error) },
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, step: "exception", error: shapeError(error) }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

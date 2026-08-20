import { createClient } from "@/lib/supabase/server";

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
  try {
    const supabase = await createClient();
    const auth = await supabase.auth.getUser();
    const user = auth.data.user;

    if (!user) {
      return Response.json({
        ok: false,
        step: "auth",
        authenticated: false,
        authError: shapeError(auth.error),
      }, { headers: { "cache-control": "no-store" } });
    }

    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);

    const [shipments, subscription, documents] = await Promise.all([
      supabase
        .from("shipments")
        .select("id,reference,origin,destination,status,risk_score,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("subscriptions")
        .select("plan,status")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .gte("created_at", start.toISOString()),
    ]);

    return Response.json({
      ok: !shipments.error && !subscription.error && !documents.error,
      authenticated: true,
      queries: {
        shipments: {
          ok: !shipments.error,
          count: shipments.data?.length ?? 0,
          error: shapeError(shipments.error),
        },
        subscription: {
          ok: !subscription.error,
          hasRow: Boolean(subscription.data),
          error: shapeError(subscription.error),
        },
        documents: {
          ok: !documents.error,
          count: documents.count ?? 0,
          error: shapeError(documents.error),
        },
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({
      ok: false,
      step: "exception",
      error: shapeError(error),
    }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

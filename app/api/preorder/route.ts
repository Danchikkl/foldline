import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (response) {
    if (response instanceof Response) return response;
    return jsonError("Forbidden", 403);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return jsonError("Unauthorized", 401);
  if (!user.email) return jsonError("Your account does not have an email address.", 400);

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("preorders").upsert(
    {
      user_id: user.id,
      email: user.email,
      status: "reserved",
    },
    { onConflict: "user_id" },
  );

  if (insertError) return jsonError("Could not reserve your place. Please try again later.", 503);

  return Response.json({ ok: true });
}

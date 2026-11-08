import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/http";
import { hmacHex, timingSafeEqualHex } from "@/lib/security";
import { runRetention } from "@/lib/retention";

/**
 * Daily retention job, called by .github/workflows/retention.yml.
 * Protected by RETENTION_SECRET (Cloudflare secret + GitHub Actions secret).
 */
export async function POST(request: Request) {
  const secret = process.env.RETENTION_SECRET;
  if (!secret) return jsonError("Retention is not configured.", 503);
  const provided = request.headers.get("x-retention-secret") || "";
  // Compare HMACs so the check takes the same time whatever was sent.
  const [a, b] = await Promise.all([hmacHex(secret, provided), hmacHex(secret, secret)]);
  if (!timingSafeEqualHex(a, b)) return jsonError("Forbidden", 403);

  try {
    const result = await runRetention(createAdminClient());
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("retention failed", { error: error instanceof Error ? error.message : "unknown" });
    return jsonError("Retention run failed.", 500);
  }
}

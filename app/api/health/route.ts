import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  let aiBound = false;

  try {
    const { env } = getCloudflareContext();
    aiBound = Boolean((env as CloudflareEnv & { AI?: unknown }).AI);
  } catch {
    aiBound = false;
  }

  return Response.json(
    {
      ok: true,
      runtime: "cloudflare",
      env: {
        appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
        supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        supabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
        supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      bindings: {
        ai: aiBound,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

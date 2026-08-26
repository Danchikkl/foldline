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
    { ok: aiBound, service: "foldline" },
    {
      status: aiBound ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}

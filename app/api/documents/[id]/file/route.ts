import { createClient } from "@/lib/supabase/server";
import { createSignedDocumentDownload } from "@/lib/storage";
import { jsonError } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Unauthorized", 401);

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_key")
    .eq("id", id)
    .maybeSingle();

  if (!doc?.storage_key) return jsonError("Not found", 404);

  try {
    const url = await createSignedDocumentDownload(doc.storage_key, 300);
    return Response.json({ url }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Could not generate document preview.", 502);
  }
}

import { createClient } from "@/lib/supabase/server";
import { invoiceDataSchema } from "@/lib/schemas";
import { invoiceCsv } from "@/lib/csv";
import { jsonError } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);

  const { data: doc } = await supabase
    .from("documents")
    .select("extracted_data,original_filename")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return jsonError("Not found", 404);

  const parsed = invoiceDataSchema.safeParse(doc.extracted_data);
  if (!parsed.success) return jsonError("Document has no exportable data.", 409);

  const csv = invoiceCsv(parsed.data);
  const base = doc.original_filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80) || "document";

  return new Response("\uFEFF" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${base}.csv"`,
      "cache-control": "no-store",
    },
  });
}

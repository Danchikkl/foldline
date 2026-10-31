import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { hmacHex, timingSafeEqualHex } from "@/lib/security";
import { extractInvoice } from "@/lib/invoice";
import { buildValidation, recheckLaterInvoices } from "@/lib/revalidate";
import { jsonError } from "@/lib/http";

type Callback = { document_id: string; status: "completed" | "failed"; raw_text?: string; error?: string };

export async function POST(request: Request) {
  const body = await request.text();
  const timestamp = request.headers.get("x-foldline-timestamp") || "";
  const signature = request.headers.get("x-foldline-signature") || "";
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return jsonError("Stale callback.", 401);
  const expected = await hmacHex(env.ocrCallbackSecret(), `${timestamp}.${body}`);
  if (!timingSafeEqualHex(expected, signature)) return jsonError("Invalid signature.", 401);

  let payload: Callback;
  try { payload = JSON.parse(body); } catch { return jsonError("Invalid JSON."); }
  if (!/^[0-9a-f-]{36}$/i.test(payload.document_id)) return jsonError("Invalid document id.");

  const admin = createAdminClient();
  const finishedAt = new Date().toISOString();

  if (payload.status === "failed") {
    await admin.from("documents").update({ status: "failed", error_message: String(payload.error || "OCR failed").slice(0, 500) }).eq("id", payload.document_id);
    await admin.from("processing_jobs").update({ status: "failed", finished_at: finishedAt }).eq("document_id", payload.document_id).in("status", ["queued", "processing"]);
    return Response.json({ ok: true });
  }

  const { data: doc } = await admin.from("documents").select("id,owner_id,created_at").eq("id", payload.document_id).maybeSingle();
  if (!doc) return jsonError("Unknown document.", 404);

  const raw = (payload.raw_text || "").slice(0, 250_000);
  const extracted = extractInvoice(raw);
  const validation = await buildValidation(admin, doc, extracted);

  await admin.from("documents").update({
    status: "ready",
    raw_ocr_text: raw,
    extracted_data: extracted,
    validation_data: validation,
    processed_at: finishedAt,
    error_message: null,
  }).eq("id", doc.id);
  await admin.from("processing_jobs").update({ status: "completed", finished_at: finishedAt }).eq("document_id", doc.id).in("status", ["queued", "processing"]);

  // Batch uploads finish out of order: give later invoices a chance to see this one.
  try { await recheckLaterInvoices(admin, doc, extracted); } catch (e) { console.error("recheck-later failed", e); }

  return Response.json({ ok: true });
}

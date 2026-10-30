import type { SupabaseClient } from "@supabase/supabase-js";
import { canCheckDuplicates, compareInvoices, findDuplicates, fingerprintFromData, type InvoiceFingerprint, type PeerDocument } from "@/lib/duplicates";
import { validateInvoice, type InvoiceData, type ValidationResult } from "@/lib/invoice";
import { invoiceDataSchema } from "@/lib/schemas";

/** Only the fields duplicate matching needs, pulled straight out of the JSON column. */
const PEER_SELECT = [
  "id",
  "original_filename",
  "created_at",
  "status",
  "bin:extracted_data->supplier_bin->>value",
  "name:extracted_data->supplier_name->>value",
  "ref:extracted_data->invoice_number->>value",
  "date:extracted_data->invoice_date->>value",
  "total:extracted_data->total->>value",
  "currency:extracted_data->currency->>value",
].join(",");

const HISTORY_LIMIT = 2000;
const LATER_RECHECK_LIMIT = 25;

type PeerRow = {
  id: string; original_filename: string; created_at: string; status: string;
  bin: string | null; name: string | null; ref: string | null; date: string | null; total: string | null; currency: string | null;
};

function toPeer(r: PeerRow): PeerDocument {
  const total = r.total === null || r.total === "" ? null : Number(r.total);
  const fp: InvoiceFingerprint = {
    supplier_bin: r.bin, supplier_name: r.name, invoice_number: r.ref, invoice_date: r.date,
    total: total !== null && Number.isFinite(total) ? total : null, currency: r.currency,
  };
  return { id: r.id, filename: r.original_filename, created_at: r.created_at, status: r.status, fp };
}

type DocRef = { id: string; owner_id: string; created_at: string };

/** Invoices uploaded before this one, in the same workspace. */
async function loadEarlier(admin: SupabaseClient, doc: DocRef): Promise<PeerDocument[]> {
  const { data, error } = await admin
    .from("documents")
    .select(PEER_SELECT)
    .eq("owner_id", doc.owner_id)
    .neq("id", doc.id)
    .lt("created_at", doc.created_at)
    .in("status", ["ready", "reviewed"])
    .not("extracted_data", "is", null)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(`history query failed: ${error.message}`);
  return ((data ?? []) as unknown as PeerRow[]).map(toPeer);
}

/** Runs every check, including duplicates against earlier invoices. */
export async function buildValidation(admin: SupabaseClient, doc: DocRef, data: InvoiceData): Promise<ValidationResult> {
  const fp = fingerprintFromData(data);
  const possible = canCheckDuplicates(fp);
  if (!possible.ok) return validateInvoice(data, { duplicateCheckMissing: possible.missing });
  const earlier = await loadEarlier(admin, doc);
  return validateInvoice(data, { duplicates: findDuplicates(fp, earlier), compared: earlier.length });
}

/**
 * When invoice X finishes (or is corrected), invoices uploaded AFTER it that
 * were already processed never saw X. Re-check the ones X could match.
 * Approved ("reviewed") invoices are left untouched.
 */
export async function recheckLaterInvoices(admin: SupabaseClient, doc: DocRef, data: InvoiceData): Promise<number> {
  const fp = fingerprintFromData(data);
  if (!canCheckDuplicates(fp).ok) return 0;
  const self: PeerDocument = { id: doc.id, filename: "", created_at: doc.created_at, status: "ready", fp };

  const { data: rows, error } = await admin
    .from("documents")
    .select(PEER_SELECT)
    .eq("owner_id", doc.owner_id)
    .neq("id", doc.id)
    .gt("created_at", doc.created_at)
    .eq("status", "ready")
    .not("extracted_data", "is", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`later-invoices query failed: ${error.message}`);

  const affected = ((rows ?? []) as unknown as PeerRow[])
    .map(toPeer)
    .filter((later) => compareInvoices(later.fp, self) !== null)
    .slice(0, LATER_RECHECK_LIMIT);

  for (const later of affected) {
    const { data: full } = await admin.from("documents").select("id,owner_id,created_at,extracted_data").eq("id", later.id).maybeSingle();
    const parsed = invoiceDataSchema.safeParse(full?.extracted_data);
    if (!full || !parsed.success) continue;
    const validation = await buildValidation(admin, full as DocRef, parsed.data as InvoiceData);
    await admin.from("documents").update({ validation_data: validation, updated_at: new Date().toISOString() }).eq("id", later.id).eq("status", "ready");
  }
  return affected.length;
}

/**
 * Runs every invoice check on the user's device against the decrypted history
 * of the workspace. Nothing here touches the network.
 */
import type { InvoiceData } from "@/lib/invoice";
import { analyzeInvoice, validateInvoiceBusiness, type ValidationResult } from "@/lib/invoice-reliability";
import { findStrongestDuplicate, type DuplicateHit } from "@/lib/invoice-duplicates";

export type VaultRecord = {
  filename: string;
  addedAt: string;
  data: InvoiceData;
  validation: ValidationResult;
  duplicate?: DuplicateHit | null;
  reviewedAt?: string | null;
};

export type HistoryItem = { id: string; record: VaultRecord };

export function checkInvoiceLocally(text: string, filename: string, history: HistoryItem[]): VaultRecord {
  const analysis = analyzeInvoice(text);
  const duplicateInvoice = findStrongestDuplicate(
    analysis.data,
    history.map((h) => ({ id: h.id, filename: h.record.filename, data: h.record.data })),
  );
  const validation = validateInvoiceBusiness(analysis.data, { duplicateInvoice, extraction: analysis.extraction });
  return { filename, addedAt: new Date().toISOString(), data: analysis.data, validation, duplicate: duplicateInvoice };
}

/** Plain-language outcome, same buckets as the rest of the app. */
export function outcomeOf(v: ValidationResult): "checked" | "issue" | "review" | "not_invoice" {
  const status = v.extraction?.status;
  if (status === "unsupported") return "not_invoice";
  if (v.risk_level === "high" || v.risk_level === "medium") return "issue";
  if (status === "needs_review" || v.risk_level === "not_calculated") return "review";
  return "checked";
}

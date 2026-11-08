import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteDocumentObject, getDocumentInfo } from "@/lib/storage";

/**
 * Data minimization. Original files and the full extracted text are only
 * needed while an invoice is being checked and reviewed. After RETENTION_DAYS
 * they are removed; the extracted fields (supplier, number, date, amounts,
 * lines) and check results stay, because duplicate checks and the audit trail
 * need them. Those fields are still confidential business data.
 */
export const RETENTION_DAYS = 30;

const PURGED_PREFIX = "purged/";

export function isPurged(storageKey: string | null | undefined) {
  return !storageKey || storageKey.startsWith(PURGED_PREFIX);
}

async function objectExists(path: string) {
  try {
    await getDocumentInfo(path);
    return true;
  } catch {
    return false;
  }
}

/** Deletes a stored object and confirms it is gone from active storage. */
export async function deleteAndVerify(path: string) {
  if (isPurged(path)) return true;
  try {
    await deleteDocumentObject(path);
  } catch {
    // Already missing is fine; verification below decides.
  }
  return !(await objectExists(path));
}

/** Removes the original file and full text of one document, keeping its fields and checks. */
export async function purgeOriginal(admin: SupabaseClient, doc: { id: string; storage_key: string }) {
  const removed = await deleteAndVerify(doc.storage_key);
  if (!removed) return false;
  const { error } = await admin
    .from("documents")
    .update({ storage_key: `${PURGED_PREFIX}${doc.id}`, raw_ocr_text: null, updated_at: new Date().toISOString() })
    .eq("id", doc.id);
  return !error;
}

/** Purges originals older than the retention window. Idempotent; safe to run daily. */
export async function runRetention(admin: SupabaseClient, limit = 200) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("documents")
    .select("id,storage_key")
    .lt("created_at", cutoff)
    .not("storage_key", "like", `${PURGED_PREFIX}%`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  let purged = 0;
  let failed = 0;
  for (const doc of data ?? []) {
    if (await purgeOriginal(admin, doc as { id: string; storage_key: string })) purged += 1;
    else failed += 1;
  }
  return { cutoff, checked: data?.length ?? 0, purged, failed };
}

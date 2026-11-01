import type { User } from "@supabase/supabase-js";

/**
 * Trial terms (clickwrap). Bump the version whenever the trial terms text on
 * /legal/terms#trial changes in a meaningful way: users will be asked to accept
 * again before their next upload.
 */
export const TRIAL_TERMS_VERSION = "trial-2026-11-01";

export type TrialTermsAcceptance = { version: string; accepted_at: string };

/** Acceptance is stored in Supabase Auth app_metadata, which only the server (service role) can write. */
export function trialTermsAcceptance(user: Pick<User, "app_metadata"> | null | undefined): TrialTermsAcceptance | null {
  const value = (user?.app_metadata as Record<string, unknown> | undefined)?.trial_terms as TrialTermsAcceptance | undefined;
  return value && typeof value.version === "string" ? value : null;
}

export function hasAcceptedTrialTerms(user: Pick<User, "app_metadata"> | null | undefined) {
  return trialTermsAcceptance(user)?.version === TRIAL_TERMS_VERSION;
}

/**
 * Fictional sample invoices served from /public/samples. They let a visitor see
 * the checks without uploading any real document, and they do not count toward
 * the monthly document limit. An upload only qualifies as a sample when the
 * filename and size match at presign time and the SHA-256 matches after upload.
 */
export const SAMPLE_PREFIX = "foldline-sample-";

export const SAMPLE_INVOICES = [
  { filename: "foldline-sample-01_original_INV-10234.pdf", size: 2242, sha256: "b482d32f084c9b34627dea81fc7111eacba42f6ae442724f78ce34df5c1c1123" },
  { filename: "foldline-sample-02_exact-duplicate_INV10234.pdf", size: 2242, sha256: "1419ac08c59ca44e6700a45dac6f0453abdc5149bf4b95799eebc5cd297e1b07" },
  { filename: "foldline-sample-03_near-duplicate_INV-10234A.pdf", size: 2245, sha256: "fda3ca6b96cec7b18114f1a9eb0ae196ce6fce640858960dda7345af0939f142" },
  { filename: "foldline-sample-04_same-amount-and-date_77-XY.pdf", size: 2180, sha256: "07fee57efc128f0afecfe46a1206728da6d8f4464aaea5eb863007b21bda3e0c" },
  { filename: "foldline-sample-05_revised_INV-10234_different-total.pdf", size: 2229, sha256: "1b9f354a43b718607c239dea6295b48d152bcbae627797c66a743806ecd6bb1a" },
  { filename: "foldline-sample-06_recurring-next-month_INV-10235.pdf", size: 2243, sha256: "34b87ce2a0c2104fb3541bbb5a03ea6a5bad021301ebeb42313b4893a721cad7" },
  { filename: "foldline-sample-07_missing-invoice-date.pdf", size: 2143, sha256: "6a7ef3f615f011a9185f29711e2ea96ae71e1f081bb1bb747ab0724c7c3d8ee0" },
  { filename: "foldline-sample-08_totals-dont-add-up.pdf", size: 2162, sha256: "8f2bb7af8d5f590411eacf4fd0ba9f33846e9be3a18be0fcb45545c5be636a9b" },
  { filename: "foldline-sample-09_clean-other-supplier.pdf", size: 2212, sha256: "97960fbe2a0bf5a49c75aed0740cbaa6571e3a3753084d25fb2f205f3f3833d5" },
  { filename: "foldline-sample-10_not-an-invoice_meeting-notes.pdf", size: 1822, sha256: "b6e5a9ff06de04fe000900e14e127e82737a8498f8da7ec6cfe06b403e1a8c10" },
] as const;

export function findSample(filename: string, size?: number) {
  return SAMPLE_INVOICES.find((sample) => sample.filename === filename && (size === undefined || sample.size === size)) ?? null;
}

export function looksLikeSampleName(filename: string) {
  return filename.startsWith(SAMPLE_PREFIX);
}

export async function sha256Hex(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

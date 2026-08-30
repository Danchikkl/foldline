export const PRODUCT_NAME = "Foldline";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

// null means no monthly document cap. For now Pro changes only the invoice/document
// allowance; it does not unlock a separate feature set.
export const PLAN_LIMITS = {
  free: 10,
  pro: null,
} as const;

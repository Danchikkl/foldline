export const PRODUCT_NAME = "Foldline";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const PLAN_LIMITS = {
  free: 10,
  pro: 500,
} as const;

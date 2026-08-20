import { publicEnv } from "@/lib/public-env";

function get(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  appUrl: () => (process.env.NEXT_PUBLIC_APP_URL || "https://foldline.d-a-zhakupov.workers.dev").replace(/\/$/, ""),
  supabaseUrl: () => publicEnv.supabaseUrl(),
  supabasePublishableKey: () => publicEnv.supabasePublishableKey(),
  supabaseServiceRoleKey: () => get("SUPABASE_SERVICE_ROLE_KEY"),
  r2AccountId: () => get("R2_ACCOUNT_ID"),
  r2AccessKeyId: () => get("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: () => get("R2_SECRET_ACCESS_KEY"),
  r2BucketName: () => get("R2_BUCKET_NAME"),
  ocrGatewayUrl: () => get("OCR_GATEWAY_URL").replace(/\/$/, ""),
  ocrGatewayToken: () => get("OCR_GATEWAY_TOKEN"),
  ocrCallbackSecret: () => get("OCR_CALLBACK_SECRET"),
  stripeSecretKey: () => get("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => get("STRIPE_WEBHOOK_SECRET"),
  stripePriceProMonthly: () => get("STRIPE_PRICE_PRO_MONTHLY"),
};

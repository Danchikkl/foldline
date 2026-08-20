import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

function makeCsp(nonce: string) {
  const isProd = process.env.NODE_ENV === "production";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com https://www.google-analytics.com https://*.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com",
    "frame-src 'self' blob: https://*.supabase.co",
    "worker-src 'self' blob:",
    isProd ? "upgrade-insecure-requests" : "",
  ].filter(Boolean).join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const csp = makeCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

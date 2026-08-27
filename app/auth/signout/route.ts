import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertNotCrossSite } from "@/lib/http";

export async function POST(request: Request) {
  try { assertNotCrossSite(request); } catch (r) { return r as Response; }

  const supabase = await createClient();
  await supabase.auth.signOut();

  // Redirect back to the same public origin that received the sign-out request.
  // This keeps logout working across workers.dev, previews, and future custom domains
  // without depending on NEXT_PUBLIC_APP_URL or a hard-coded hostname.
  return NextResponse.redirect(new URL("/", request.url), 303);
}

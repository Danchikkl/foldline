import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { assertNotCrossSite } from "@/lib/http";

export async function POST(request: Request) {
  try { assertNotCrossSite(request); } catch (r) { return r as Response; }

  const supabase = await createClient();
  await supabase.auth.signOut();

  // POST -> 303 -> GET avoids preserving the POST method on redirect.
  return NextResponse.redirect(`${env.appUrl()}/`, 303);
}

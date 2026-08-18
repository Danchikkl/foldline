import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  try { assertSameOrigin(request); } catch (r) { return r as Response; }
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${env.appUrl()}/`);
}

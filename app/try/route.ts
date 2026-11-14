import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Short link for outreach: straight into the private workspace, signing up first if needed.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.redirect(new URL(user ? "/vault" : "/signup?next=/vault", request.url));
}

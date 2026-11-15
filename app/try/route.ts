import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Short link for outreach: straight to the paid-twice audit (no passphrase,
// result in a minute), signing up first if needed.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.redirect(new URL(user ? "/vault/audit" : "/signup?next=/vault/audit", request.url));
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const jar = await cookies();
      const remembered = jar.get("fl_next")?.value;
      const res = NextResponse.redirect(new URL(safeNext(url.searchParams.get("next") ?? (remembered ? decodeURIComponent(remembered) : null)), request.url));
      res.cookies.delete("fl_next");
      return res;
    }
  }

  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}

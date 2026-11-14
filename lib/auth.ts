import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser(next?: string) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return { user, supabase };
}

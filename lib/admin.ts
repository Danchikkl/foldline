import "server-only";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function configuredAdminUserId() {
  return process.env.FOLDLINE_ADMIN_USER_ID?.trim() || "";
}

export async function requireAdmin() {
  const adminUserId = configuredAdminUserId();
  if (!adminUserId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || user.id !== adminUserId) notFound();

  return user;
}

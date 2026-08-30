"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function setUserPlan(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") || "").trim();
  const requestedPlan = String(formData.get("plan") || "").trim();
  const plan = requestedPlan === "pro" ? "pro" : requestedPlan === "free" ? "free" : null;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || !plan) {
    throw new Error("Invalid user or plan.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .upsert({
      user_id: userId,
      plan,
      status: plan === "pro" ? "active" : "inactive",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (error) throw new Error("Could not update the user's plan.");

  revalidatePath("/admin");
}

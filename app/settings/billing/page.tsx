import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { PreorderButton } from "@/components/preorder-button";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Billing() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: preorder } = await admin
    .from("preorders")
    .select("id,status,created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <DashboardShell email={user.email || "account"}>
      <div className="settingsPage">
        <span className="eyebrow">Early access</span>
        <h1>Reserve a Foldline preorder</h1>
        <div className="billingCard">
          <div>
            <b>{preorder ? "Reserved" : "Preorder"}</b>
            <p>
              Join the early preorder list while pricing and the first production workflow are still being validated.
              Reserving a place does not charge your card or create a paid subscription.
            </p>
            {preorder?.created_at && (
              <small>Reserved on {new Date(preorder.created_at).toLocaleDateString()}.</small>
            )}
          </div>
          <PreorderButton joined={Boolean(preorder && preorder.status !== "cancelled")} />
        </div>
        <p className="settingsHint">
          No payment is collected here. You will be contacted before any paid plan is activated.
        </p>
      </div>
    </DashboardShell>
  );
}

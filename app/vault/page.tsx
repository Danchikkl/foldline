import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { VaultWorkspace } from "@/components/vault-workspace";
import { VaultGuard } from "@/components/vault-guard";

export const metadata: Metadata = { title: "Private workspace", robots: { index: false, follow: false } };

export default async function VaultPage() {
  const { user } = await requireUser("/vault");
  return <DashboardShell email={user.email || "account"} hardNav><VaultGuard><VaultWorkspace /></VaultGuard></DashboardShell>;
}

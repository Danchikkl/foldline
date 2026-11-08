import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { VaultWorkspace } from "@/components/vault-workspace";

export const metadata: Metadata = { title: "Private workspace", robots: { index: false, follow: false } };

export default async function VaultPage() {
  const { user } = await requireUser();
  return <DashboardShell email={user.email || "account"}><VaultWorkspace /></DashboardShell>;
}

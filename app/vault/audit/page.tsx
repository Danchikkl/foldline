import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { VaultGuard } from "@/components/vault-guard";
import { LedgerAudit } from "@/components/ledger-audit";

export const metadata: Metadata = { title: "Paid-twice audit", robots: { index: false, follow: false } };

export default async function LedgerAuditPage() {
  const { user } = await requireUser("/vault/audit");
  return <DashboardShell email={user.email || "account"} hardNav><VaultGuard><LedgerAudit /></VaultGuard></DashboardShell>;
}

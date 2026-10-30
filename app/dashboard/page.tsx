import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, CopyX, FileText, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { UploadDropzone } from "@/components/upload-dropzone";
import { AutoRefresh } from "@/components/auto-refresh";
import { PLAN_LIMITS } from "@/lib/constants";
import { outcomeOf, OUTCOME_LABELS, type ValidationResult } from "@/lib/invoice";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const VIEWS = [
  { key: "all", label: "All" },
  { key: "issue", label: "Issues" },
  { key: "review", label: "Needs review" },
  { key: "checked", label: "Checked" },
] as const;
type View = (typeof VIEWS)[number]["key"];

type Row = { id: string; original_filename: string; status: string; created_at: string; validation_data: ValidationResult | null };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: rawView } = await searchParams;
  const view: View = VIEWS.some((v) => v.key === rawView) ? (rawView as View) : "all";
  const { user, supabase } = await requireUser();

  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const countOutcome = (o: string) => supabase.from("documents").select("id", { count: "exact", head: true }).eq("validation_data->>outcome", o).neq("status", "reviewed");

  let list = supabase.from("documents").select("id,original_filename,status,validation_data,created_at").order("created_at", { ascending: false }).limit(100);
  if (view !== "all") list = list.eq("validation_data->>outcome", view);
  // The queue is about open work: once approved, an invoice leaves Issues / Needs review.
  if (view === "issue" || view === "review") list = list.neq("status", "reviewed");

  const [{ data: documents }, { data: subscription }, { count: monthCount }, issues, reviews] = await Promise.all([
    list,
    supabase.from("subscriptions").select("plan,status").eq("user_id", user.id).maybeSingle(),
    supabase.from("documents").select("id", { count: "exact", head: true }).gte("created_at", start.toISOString()),
    countOutcome("issue"),
    countOutcome("review"),
  ]);
  const plan = (subscription?.plan === "pro" ? "pro" : "free") as "free" | "pro";
  const limit = PLAN_LIMITS[plan];
  const rows = (documents ?? []) as Row[];
  const processing = rows.some((d) => ["uploading", "queued", "processing"].includes(d.status));
  const openIssues = issues.count ?? 0;
  const openReviews = reviews.count ?? 0;

  return <DashboardShell email={user.email || "account"}>
    <AutoRefresh active={processing} />
    <div className="dashboard">
      <header className="dashHeader"><div><span className="eyebrow">AP exception queue</span><h1>{openIssues ? `${openIssues} invoice${openIssues === 1 ? "" : "s"} to resolve before payment.` : "Nothing blocking payment right now."}</h1></div><Link href="/settings/billing" className="planBadge">{plan === "pro" ? "Pro" : "Free"} · {monthCount ?? 0}/{limit} this month</Link></header>
      <div className="dashGrid"><UploadDropzone />
        <div className="insightCard"><span className="eyebrow">What gets checked</span><h3>Every invoice is compared with every earlier one.</h3><p>Exact duplicates, changed invoice numbers (INV-10234 → INV-10234A), same supplier + amount + date, missing core fields and totals that don't add up.</p><div className="insightStat"><CopyX /><div><b>{openIssues} open issue{openIssues === 1 ? "" : "s"} · {openReviews} to review</b><span>Approved invoices leave the queue.</span></div></div><div className="insightStat"><ShieldCheck /><div><b>Private by default</b><span>Signed URLs expire in minutes.</span></div></div></div>
      </div>
      <section id="documents" className="documentsSection">
        <div className="sectionHeader"><h2>Invoices</h2><nav className="queueTabs" aria-label="Filter invoices">{VIEWS.map((v) => <Link key={v.key} href={v.key === "all" ? "/dashboard#documents" : `/dashboard?view=${v.key}#documents`} className={view === v.key ? "active" : ""} aria-current={view === v.key ? "page" : undefined}>{v.label}{v.key === "issue" && openIssues ? <i>{openIssues}</i> : v.key === "review" && openReviews ? <i>{openReviews}</i> : null}</Link>)}</nav></div>
        <div className="documentList">{rows.length ? rows.map((d) => {
          const outcome = outcomeOf(d.validation_data);
          const approved = d.status === "reviewed";
          const busy = ["uploading", "queued", "processing"].includes(d.status);
          return <Link href={`/documents/${d.id}`} className="documentRow" key={d.id}>
            <div className="docIcon"><FileText /></div>
            <div className="docName"><b>{d.original_filename}</b><span><Clock3 size={13} />{new Date(d.created_at).toLocaleDateString()}{outcome && outcome !== "checked" && d.validation_data?.summary ? ` · ${d.validation_data.summary}` : ""}</span></div>
            <span className={`outcomePill ${busy ? "outcome-busy" : d.status === "failed" ? "outcome-failed" : outcome ? `outcome-${outcome}` : ""}`}>{busy ? "Reading…" : d.status === "failed" ? "Failed" : outcome ? OUTCOME_LABELS[outcome] : "—"}</span>
            <span className="riskText">{approved ? "approved" : ""}</span>
          </Link>;
        }) : <div className="emptyList">{view === "all" ? "Upload a batch of supplier invoices to see which ones need attention." : "Nothing in this view."}</div>}</div>
      </section>
    </div>
  </DashboardShell>;
}

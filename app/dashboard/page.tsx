import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, FileText, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { UploadDropzone } from "@/components/upload-dropzone";
import { PLAN_LIMITS } from "@/lib/constants";

export const metadata: Metadata = { robots: { index: false, follow: false } };


export default async function Dashboard(){
  const { user, supabase } = await requireUser();
  const [{ data: documents }, { data: subscription }] = await Promise.all([
    supabase.from("documents").select("id,original_filename,status,content_type,validation_data,created_at").order("created_at",{ascending:false}).limit(50),
    supabase.from("subscriptions").select("plan,status").eq("user_id",user.id).maybeSingle(),
  ]);
  const start=new Date(); start.setUTCDate(1); start.setUTCHours(0,0,0,0);
  const { count } = await supabase.from("documents").select("id",{count:"exact",head:true}).gte("created_at",start.toISOString());
  const plan=(subscription?.plan === "pro" ? "pro":"free") as "free"|"pro"; const limit=PLAN_LIMITS[plan];
  return <DashboardShell email={user.email || "account"}><div className="dashboard"><header className="dashHeader"><div><span className="eyebrow">Workspace</span><h1>Turn paperwork into reviewed data.</h1></div><Link href="/settings/billing" className="planBadge">{plan === "pro" ? "Pro" : "Free"} · {count ?? 0}/{limit} this month</Link></header><div className="dashGrid"><UploadDropzone/><div className="insightCard"><span className="eyebrow">Proofline</span><h3>Review effort, not OCR accuracy.</h3><p>Foldline automatically checks totals and pushes only risky fields into your queue.</p><div className="insightStat"><ShieldCheck/><div><b>Private by default</b><span>Signed URLs expire in minutes.</span></div></div></div></div><section id="documents" className="documentsSection"><div className="sectionHeader"><h2>Recent documents</h2><span>{documents?.length ?? 0} total shown</span></div><div className="documentList">{documents?.length ? documents.map((d:any)=>{const risk=d.validation_data?.risk_score;return <Link href={`/documents/${d.id}`} className="documentRow" key={d.id}><div className="docIcon"><FileText/></div><div className="docName"><b>{d.original_filename}</b><span><Clock3 size={13}/>{new Date(d.created_at).toLocaleDateString()}</span></div><span className={`status status-${d.status}`}>{d.status}</span><span className="riskText">{typeof risk === "number" ? `${risk}% risk` : "—"}</span></Link>}) : <div className="emptyList">Your first processed document will appear here.</div>}</div></section></div></DashboardShell>
}

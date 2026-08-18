import type { Metadata } from "next";
import { LockKeyhole, ShieldCheck, FileLock2, KeyRound, Eye, Database } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Security",
  description: "How Foldline protects uploaded documents, account access and processing workflows.",
  alternates: { canonical: "/security" },
};

const controls = [
  [FileLock2, "Private document storage", "Original files live in a private object bucket. Browser access is granted with short-lived signed URLs rather than public file links."],
  [ShieldCheck, "Row-level data isolation", "Supabase Row Level Security limits users to records they own. Sensitive mutations are routed through authenticated server endpoints."],
  [KeyRound, "Server-only secrets", "Storage credentials, Stripe keys, service-role credentials and OCR secrets are never exposed through NEXT_PUBLIC variables."],
  [Eye, "Human approval before export", "OCR output is treated as untrusted machine output. Proofline highlights uncertainty and reconciliation failures before approval."],
  [LockKeyhole, "Signed OCR callbacks", "OCR completion callbacks use HMAC verification and replay windows so arbitrary third parties cannot mark processing jobs complete."],
  [Database, "Audit-ready workflow", "Approval and workflow events are designed to be recorded server-side rather than trusting the browser to author authoritative logs."],
] as const;

export default function SecurityPage() {
  return <><SiteHeader/><main className="contentPage"><div className="container narrowContent"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Security"}]}/><span className="eyebrow">Security by architecture</span><h1>Documents are sensitive. We design around that assumption.</h1><p className="lede">Foldline uses private storage, short-lived access, database isolation and explicit human approval. No OCR output is trusted simply because a model produced it.</p><div className="securityGrid">{controls.map(([Icon,title,body]) => <article className="securityCard" key={title}><Icon size={21}/><h2>{title}</h2><p>{body}</p></article>)}</div><div className="disclosureCard"><strong>Security contact</strong><p>Before public launch, configure a monitored security email and a responsible-disclosure process. Do not publish a placeholder inbox that nobody monitors.</p></div></div></main></>;
}

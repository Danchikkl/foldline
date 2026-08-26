import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole, ShieldCheck, FileLock2, KeyRound, Eye, Database } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Security",
  description: "How Foldline protects uploaded documents, account access and processing workflows.",
  alternates: { canonical: "/security" },
};

const controls = [
  [FileLock2, "Private document storage", "Original files are stored in a private Supabase Storage bucket. Browser access uses short-lived signed URLs rather than permanent public links."],
  [ShieldCheck, "Database isolation", "Supabase Row Level Security and authenticated server routes restrict access to account and workspace records."],
  [KeyRound, "Server-only credentials", "Service-role and other privileged credentials stay on the server and are not exposed through public environment variables."],
  [Eye, "Human review", "Extracted values and checks are treated as review aids, not as automatically trustworthy decisions."],
  [LockKeyhole, "Bounded file access", "Document processing uses short-lived access to retrieve private files instead of making customer documents publicly addressable."],
  [Database, "Private pilot inbox", "Pilot requests are stored in a table with no anon or authenticated client access. The founder admin view reads them only after a server-side user-ID allowlist check."],
] as const;

export default function SecurityPage() {
  return <><SiteHeader/><main className="contentPage"><div className="container narrowContent"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Security"}]}/><span className="eyebrow">Security by architecture</span><h1>Documents are sensitive. The product is designed around that assumption.</h1><p className="lede">Foldline uses private storage, short-lived access, authenticated server logic and explicit human review. Security controls will continue to be hardened as the MVP moves toward broader production use.</p><div className="securityGrid">{controls.map(([Icon,title,body]) => <article className="securityCard" key={title}><Icon size={21}/><h2>{title}</h2><p>{body}</p></article>)}</div><div className="disclosureCard"><strong>Security contact</strong><p>For now, security concerns can be submitted through the <Link href="/contact">contact page</Link>. A dedicated monitored security mailbox and responsible-disclosure process will be added before broader production use.</p></div></div></main></>;
}

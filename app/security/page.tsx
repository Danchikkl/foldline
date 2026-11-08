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

const zk = [
  ["Read on your device", "In the private workspace, PDFs are read by your browser. The invoice file is never uploaded to Foldline."],
  ["Checked on your device", "Duplicate and arithmetic checks run in your browser against your decrypted invoice history."],
  ["Encrypted before it is saved", "Each result is encrypted with AES-256-GCM before it leaves the browser. The key comes from a workspace passphrase (PBKDF2-SHA256, 600,000 iterations) that is never sent to us."],
  ["Unreadable on our side", "Foldline's database holds only ciphertext. A leaked database, a curious employee or a subpoena gets data we cannot decrypt."],
] as const;

const limits = [
  "If you lose the passphrase, the data cannot be recovered. There is no reset, by design.",
  "Scanned, image-only PDFs are not supported in the private workspace yet.",
  "You still rely on the code our site serves. We protect our hosting and code accounts with two-factor authentication and lock the page down with a strict Content Security Policy, but this is the honest limit of any browser-based encryption.",
];

const controls = [
  [FileLock2, "Private document storage", "Original files are stored in a private Supabase Storage bucket. Browser access uses short-lived signed URLs rather than permanent public links."],
  [ShieldCheck, "Database isolation", "Supabase Row Level Security and authenticated server routes restrict access to account and workspace records."],
  [KeyRound, "Server-only credentials", "Service-role and other privileged credentials stay on the server and are not exposed through public environment variables."],
  [Eye, "Human review", "Extracted values and checks are treated as review aids, not as automatically trustworthy decisions."],
  [LockKeyhole, "Bounded file access", "Document processing uses short-lived access to retrieve private files instead of making customer documents publicly addressable."],
  [Database, "Private pilot inbox", "Pilot requests are stored in a table with no anon or authenticated client access. The founder admin view reads them only after a server-side user-ID allowlist check."],
] as const;

export default function SecurityPage() {
  return <><SiteHeader/><main className="contentPage"><div className="container narrowContent"><Breadcrumbs items={[{label:"Home",href:"/"},{label:"Security"}]}/><span className="eyebrow">Security by architecture</span><h1>Documents are sensitive. The product is designed around that assumption.</h1><p className="lede">Foldline has two modes. The private workspace is zero-knowledge: invoices are read and checked on your device and we store only data we cannot read. The standard workspace processes documents on our servers with private storage, short-lived access and automatic deletion.</p><section className="zkBlock"><span className="eyebrow"><LockKeyhole size={13}/> Private workspace · zero-knowledge</span><h2>Your invoices never reach our servers.</h2><ol className="zkSteps">{zk.map(([title, body], i) => <li key={title}><b>{String(i + 1).padStart(2, "0")}</b><div><strong>{title}</strong><p>{body}</p></div></li>)}</ol><div className="zkLimits"><strong>What zero-knowledge does not cover</strong><ul>{limits.map((l) => <li key={l}>{l}</li>)}</ul></div><Link className="button buttonDark" href="/vault">Open the private workspace</Link></section><h2 className="securitySubhead">Standard workspace</h2><div className="securityGrid">{controls.map(([Icon,title,body]) => <article className="securityCard" key={title}><Icon size={21}/><h2>{title}</h2><p>{body}</p></article>)}</div><div className="disclosureCard"><strong>Security contact</strong><p>For now, security concerns can be submitted through the <Link href="/contact">contact page</Link>. A dedicated monitored security mailbox and responsible-disclosure process will be added before broader production use.</p></div></div></main></>;
}

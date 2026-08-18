import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

export default async function ShipmentPage({ params }: Props) {
  const { id } = await params;
  const { user, supabase } = await requireUser();

  const { data: shipment } = await supabase
    .from("shipments")
    .select("id,reference,origin,destination,status,risk_score,created_at,organization_id")
    .eq("id", id)
    .maybeSingle();

  if (!shipment) notFound();

  const [{ data: documents }, { data: discrepancies }] = await Promise.all([
    supabase
      .from("documents")
      .select("id,original_filename,status,document_type,created_at")
      .eq("shipment_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("discrepancies")
      .select("id,title,message,severity,status,field_key,created_at")
      .eq("shipment_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const openDiscrepancies = (discrepancies ?? []).filter((d: any) => d.status === "open");
  const route = [shipment.origin, shipment.destination].filter(Boolean).join(" → ") || "Route not set";

  return (
    <DashboardShell email={user.email || "account"}>
      <div className="dashboard">
        <header className="dashHeader">
          <div>
            <Link href="/dashboard" className="iconText"><ArrowLeft size={15}/> Back to shipments</Link>
            <span className="eyebrow">Shipment packet</span>
            <h1>{shipment.reference}</h1>
            <p>{route}</p>
          </div>
          <span className={`status status-${shipment.status}`}>{shipment.status}</span>
        </header>

        <div className="dashGrid">
          <section className="insightCard">
            <span className="eyebrow">Documents</span>
            <h3>{documents?.length ?? 0} files in this shipment</h3>
            <p>Invoice, Packing List, PO and transport documents will be grouped here and compared against each other.</p>
            <div className="insightStat"><FileText/><div><b>Next step</b><span>Multi-file shipment upload is being wired to this page.</span></div></div>
          </section>

          <section className="insightCard">
            <span className="eyebrow">Checks</span>
            <h3>{openDiscrepancies.length ? `${openDiscrepancies.length} exception${openDiscrepancies.length === 1 ? "" : "s"}` : "No open exceptions"}</h3>
            <p>Once documents are processed, Foldline will surface quantity, price, weight, currency and reference mismatches here.</p>
            <div className="insightStat">{openDiscrepancies.length ? <ShieldAlert/> : <ShieldCheck/>}<div><b>Risk score</b><span>{shipment.risk_score ?? 0}%</span></div></div>
          </section>
        </div>

        <section className="documentsSection">
          <div className="sectionHeader"><h2>Shipment documents</h2><span>{documents?.length ?? 0} total</span></div>
          <div className="documentList">
            {documents?.length ? documents.map((d: any) => (
              <Link href={`/documents/${d.id}`} className="documentRow" key={d.id}>
                <div className="docIcon"><FileText/></div>
                <div className="docName"><b>{d.original_filename}</b><span>{d.document_type ? d.document_type.replaceAll("_", " ") : "Unclassified"}</span></div>
                <span className={`status status-${d.status}`}>{d.status}</span>
              </Link>
            )) : <div className="emptyList">No documents yet. The next step is connecting multi-file upload to this shipment.</div>}
          </div>
        </section>

        <section className="documentsSection">
          <div className="sectionHeader"><h2>Exceptions</h2><span>{openDiscrepancies.length} open</span></div>
          <div className="documentList">
            {openDiscrepancies.length ? openDiscrepancies.map((d: any) => (
              <div className="documentRow" key={d.id}>
                <div className="docIcon"><ShieldAlert/></div>
                <div className="docName"><b>{d.title}</b><span>{d.message}</span></div>
                <span className={`status status-${d.severity}`}>{d.severity}</span>
              </div>
            )) : <div className="emptyList">No exceptions yet.</div>}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

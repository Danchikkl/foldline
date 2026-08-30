import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { ShipmentUploadDropzone } from "@/components/shipment-upload-dropzone";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

type DocumentValidation = {
  extraction?: { status?: string };
  risk_level?: string;
};

function documentOutcome(document: { status: string; validation_data?: unknown }) {
  if (["uploading", "queued", "processing"].includes(document.status)) {
    return { label: "Processing", className: "status-processing" };
  }
  if (document.status === "failed") {
    return { label: "Processing failed", className: "status-failed" };
  }

  const validation = document.validation_data as DocumentValidation | null | undefined;
  const extractionStatus = validation?.extraction?.status;
  const riskLevel = validation?.risk_level;

  if (extractionStatus === "unsupported") {
    return { label: "Not an invoice", className: "" };
  }
  if (riskLevel === "high" || riskLevel === "medium") {
    return { label: "Issue found", className: "status-failed" };
  }
  if (extractionStatus === "needs_review" || riskLevel === "not_calculated") {
    return { label: "Requires review", className: "status-processing" };
  }
  if (extractionStatus === "reliable" && riskLevel === "low") {
    return { label: "Checked", className: "status-ready" };
  }

  // A document that finished processing but has no usable validation result
  // should never look "green" merely because its storage status is ready.
  return { label: "Requires review", className: "status-processing" };
}

export default async function ShipmentPage({ params }: Props) {
  const { id } = await params;
  const { user, supabase } = await requireUser();

  const { data: shipment } = await supabase
    .from("shipments")
    .select("id,reference,origin,destination,status,created_at,organization_id")
    .eq("id", id)
    .maybeSingle();

  if (!shipment) notFound();

  const [{ data: documents }, { data: discrepancies }] = await Promise.all([
    supabase
      .from("documents")
      .select("id,original_filename,status,document_type,validation_data,created_at")
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
            <Link href="/dashboard" className="iconText"><ArrowLeft size={15}/> Back to reviews</Link>
            <span className="eyebrow">Review packet</span>
            <h1>{shipment.reference}</h1>
            <p>{route}</p>
          </div>
          <span className={`status status-${shipment.status}`}>{shipment.status}</span>
        </header>

        <div className="dashGrid">
          <ShipmentUploadDropzone shipmentId={shipment.id} />

          <section className="insightCard">
            <span className="eyebrow">Verified exceptions</span>
            <h3>{openDiscrepancies.length ? `${openDiscrepancies.length} exception${openDiscrepancies.length === 1 ? "" : "s"}` : "No verified packet exceptions"}</h3>
            <p>Foldline does not show a packet risk percentage until cross-document checks are backed by reliable extraction. The current MVP verifies invoices individually first.</p>
            <div className="insightStat">{openDiscrepancies.length ? <ShieldAlert/> : <ShieldCheck/>}<div><b>Reliability gate</b><span>{openDiscrepancies.length ? "Review verified exceptions below." : "No packet-level claim is made yet."}</span></div></div>
          </section>
        </div>

        <section className="documentsSection">
          <div className="sectionHeader"><h2>Documents</h2><span>{documents?.length ?? 0} total</span></div>
          <div className="documentList">
            {documents?.length ? documents.map((d: any) => {
              const outcome = documentOutcome(d);
              return (
                <Link href={`/documents/${d.id}`} className="documentRow" key={d.id}>
                  <div className="docIcon"><FileText/></div>
                  <div className="docName"><b>{d.original_filename}</b><span>{d.document_type ? d.document_type.replaceAll("_", " ") : "Type not verified"}</span></div>
                  <span className={`status ${outcome.className}`.trim()}>{outcome.label}</span>
                </Link>
              );
            }) : <div className="emptyList">No documents yet. The reliable review workflow currently starts with an invoice.</div>}
          </div>
        </section>

        <section className="documentsSection">
          <div className="sectionHeader"><h2>Packet exceptions</h2><span>{openDiscrepancies.length} verified</span></div>
          <div className="documentList">
            {openDiscrepancies.length ? openDiscrepancies.map((d: any) => (
              <div className="documentRow" key={d.id}>
                <div className="docIcon"><ShieldAlert/></div>
                <div className="docName"><b>{d.title}</b><span>{d.message}</span></div>
                <span className={`status status-${d.severity}`}>{d.severity}</span>
              </div>
            )) : <div className="emptyList">No verified packet-level exceptions yet.</div>}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

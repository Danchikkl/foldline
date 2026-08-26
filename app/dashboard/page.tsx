import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, PackageCheck, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { NewShipmentForm } from "@/components/new-shipment-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Dashboard() {
  const { user, supabase } = await requireUser();

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id,reference,origin,destination,status,risk_score,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <DashboardShell email={user.email || "account"}>
      <div className="dashboard">
        <header className="dashHeader">
          <div>
            <span className="eyebrow">Document review</span>
            <h1>Review an invoice before a small error becomes a real problem.</h1>
          </div>
          <Link href="/settings/billing" className="planBadge">
            Reserve early access
          </Link>
        </header>

        <div className="dashGrid">
          <div className="insightCard">
            <span className="eyebrow">New review</span>
            <h3>Start with one invoice or a related document set.</h3>
            <p>Give the review a reference. Route details are optional. After creation you’ll go straight to the upload screen.</p>
            <NewShipmentForm />
          </div>

          <div className="insightCard">
            <span className="eyebrow">What the MVP checks today</span>
            <h3>Extract. Verify. Review exceptions.</h3>
            <p>Foldline extracts invoice fields, checks totals and references, and keeps source evidence next to fields that need a person to review.</p>
            <div className="insightStat">
              <ShieldCheck />
              <div>
                <b>Evidence attached</b>
                <span>Review results point back to the source document instead of asking you to trust extracted values blindly.</span>
              </div>
            </div>
          </div>
        </div>

        <section id="shipments" className="documentsSection">
          <div className="sectionHeader">
            <h2>Reviews</h2>
            <span>{shipments?.length ?? 0} shown</span>
          </div>

          <div className="documentList">
            {shipments?.length ? (
              shipments.map((shipment: any) => {
                const needsAttention = shipment.status === "attention" || shipment.risk_score >= 50;
                const route = [shipment.origin, shipment.destination].filter(Boolean).join(" → ");

                return (
                  <Link href={`/shipments/${shipment.id}`} className="documentRow" key={shipment.id}>
                    <div className="docIcon">
                      {needsAttention ? <AlertTriangle /> : <PackageCheck />}
                    </div>
                    <div className="docName">
                      <b>{shipment.reference}</b>
                      <span>
                        <Clock3 size={13} />
                        {route || "No route set"} · {new Date(shipment.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <span className={`status status-${shipment.status}`}>{shipment.status}</span>
                    <span className="riskText">{shipment.risk_score}% risk</span>
                    <ArrowRight size={16} />
                  </Link>
                );
              })
            ) : (
              <div className="emptyList">Start your first review above.</div>
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

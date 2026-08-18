import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, PackageCheck, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { NewShipmentForm } from "@/components/new-shipment-form";
import { PLAN_LIMITS } from "@/lib/constants";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Dashboard() {
  const { user, supabase } = await requireUser();

  const [{ data: shipments }, { data: subscription }] = await Promise.all([
    supabase
      .from("shipments")
      .select("id,reference,origin,destination,status,risk_score,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("subscriptions")
      .select("plan,status")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start.toISOString());

  const plan = (subscription?.plan === "pro" ? "pro" : "free") as "free" | "pro";
  const limit = PLAN_LIMITS[plan];

  return (
    <DashboardShell email={user.email || "account"}>
      <div className="dashboard">
        <header className="dashHeader">
          <div>
            <span className="eyebrow">Shipment control</span>
            <h1>Check a shipment before an error becomes a problem.</h1>
          </div>
          <Link href="/settings/billing" className="planBadge">
            {plan === "pro" ? "Pro" : "Free"} · {count ?? 0}/{limit} documents this month
          </Link>
        </header>

        <div className="dashGrid">
          <div className="insightCard">
            <span className="eyebrow">New shipment</span>
            <h3>Create one packet for all related documents.</h3>
            <p>Add the reference and route now. Invoice, Packing List, PO and transport documents will live inside this shipment.</p>
            <NewShipmentForm />
          </div>

          <div className="insightCard">
            <span className="eyebrow">How Foldline works</span>
            <h3>Documents in. Exceptions out.</h3>
            <p>Foldline will compare values across the shipment packet and surface only what needs a person to check.</p>
            <div className="insightStat">
              <ShieldCheck />
              <div>
                <b>Evidence attached</b>
                <span>Every discrepancy points back to the source document.</span>
              </div>
            </div>
          </div>
        </div>

        <section id="shipments" className="documentsSection">
          <div className="sectionHeader">
            <h2>Shipments</h2>
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
                        {route || "Route not set"} · {new Date(shipment.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <span className={`status status-${shipment.status}`}>{shipment.status}</span>
                    <span className="riskText">{shipment.risk_score}% risk</span>
                    <ArrowRight size={16} />
                  </Link>
                );
              })
            ) : (
              <div className="emptyList">Create your first shipment above. Its document packet will appear here.</div>
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

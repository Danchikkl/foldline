import type { Metadata } from "next";
import { AlertTriangle, Building2, ClipboardCheck, Clock3, Mail, ShieldCheck, UserRound } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { runInvoiceReliabilityFixtures } from "@/lib/invoice-reliability-fixtures";
import { setUserPlan } from "@/app/admin/actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PilotRequest = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  message: string;
  status: "new" | "contacted" | "closed";
};

type Preorder = {
  id: string;
  created_at: string;
  user_id: string;
  email: string;
  status: "reserved" | "contacted" | "converted" | "cancelled";
};

type Subscription = {
  user_id: string;
  plan: "free" | "pro";
  status: string;
  updated_at: string;
};

export default async function AdminPage() {
  await requireAdmin();

  const reliability = runInvoiceReliabilityFixtures();
  const reliabilityPassed = reliability.filter((fixture) => fixture.passed).length;

  // Service-role access happens only after the authenticated user passed the exact ID allowlist.
  const admin = createAdminClient();
  const [
    { data: requests, error: requestsError },
    { data: preorderRows, error: preordersError },
    { data: subscriptionRows, error: subscriptionsError },
    usersResult,
  ] = await Promise.all([
    admin
      .from("pilot_requests")
      .select("id,created_at,name,email,company,role,message,status")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("preorders")
      .select("id,created_at,user_id,email,status")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("subscriptions")
      .select("user_id,plan,status,updated_at")
      .limit(500),
    admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
  ]);

  const users = usersResult.data?.users ?? [];
  const leads = (requests ?? []) as PilotRequest[];
  const preorders = (preorderRows ?? []) as Preorder[];
  const subscriptions = (subscriptionRows ?? []) as Subscription[];
  const plansByUser = new Map(subscriptions.map((subscription) => [subscription.user_id, subscription]));
  const newCount = leads.filter((lead) => lead.status === "new").length;
  const reservedCount = preorders.filter((preorder) => preorder.status === "reserved").length;
  const proCount = subscriptions.filter((subscription) => subscription.plan === "pro").length;

  return (
    <main className="contentPage">
      <div className="container">
        <span className="eyebrow">Founder only</span>
        <h1>Foldline admin</h1>
        <p className="lede">Private view of signups, plans, pilot requests, preorder reservations and parser reliability checks. This route is not linked from the public product.</p>

        <div className="dashGrid">
          <section className="insightCard">
            <span className="eyebrow">Pilot inbox</span>
            <h3>{leads.length} request{leads.length === 1 ? "" : "s"}</h3>
            <p>{newCount} currently marked new.</p>
          </section>
          <section className="insightCard">
            <span className="eyebrow">Pro access</span>
            <h3>{proCount} Pro user{proCount === 1 ? "" : "s"}</h3>
            <p>Pro currently means unlimited invoice uploads only.</p>
          </section>
          <section className="insightCard">
            <span className="eyebrow">Reliability fixtures</span>
            <h3>{reliabilityPassed}/{reliability.length} passing</h3>
            <p>Clean, mismatch, unsupported and polluted-extraction regression cases run server-side on this page.</p>
          </section>
        </div>

        <section className="documentsSection">
          <div className="sectionHeader"><h2>Reliability self-test</h2><span>{reliabilityPassed === reliability.length ? "all passing" : "attention required"}</span></div>
          <div className="documentList">
            {reliability.map((fixture) => (
              <article className="documentRow" key={fixture.name}>
                <div className="docIcon">{fixture.passed ? <ShieldCheck/> : <AlertTriangle/>}</div>
                <div className="docName"><b>{fixture.name}</b><span>{fixture.details}</span><span>Extraction: {fixture.extractionStatus} · Risk: {fixture.riskLevel}</span></div>
                <span className={`status ${fixture.passed ? "status-ready" : "status-failed"}`}>{fixture.passed ? "pass" : "fail"}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="documentsSection">
          <div className="sectionHeader"><h2>Registered users & plans</h2><span>{users.length} shown</span></div>
          {subscriptionsError ? <div className="legalNotice">Subscription plans could not be loaded.</div> : null}
          <div className="documentList">
            {users.length ? users.map((user) => {
              const subscription = plansByUser.get(user.id);
              const plan = subscription?.plan === "pro" ? "pro" : "free";
              return (
                <article className="documentRow" key={user.id}>
                  <div className="docIcon"><UserRound /></div>
                  <div className="docName">
                    <b>{user.email || "No email"}</b>
                    <span><Building2 size={13} /> User ID: {user.id}</span>
                    <span>Created {new Date(user.created_at).toLocaleString()}</span>
                    <span>Plan: {plan === "pro" ? "Pro · unlimited invoices" : "Free · 10 invoices/month"}</span>
                  </div>
                  <span className={`status ${plan === "pro" ? "status-ready" : "status-reserved"}`}>{plan}</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {plan !== "pro" ? (
                      <form action={setUserPlan}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="plan" value="pro" />
                        <button className="button buttonAccent" type="submit">Set Pro</button>
                      </form>
                    ) : (
                      <form action={setUserPlan}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="plan" value="free" />
                        <button className="button buttonGhost" type="submit">Set Free</button>
                      </form>
                    )}
                  </div>
                </article>
              );
            }) : <div className="emptyList">No registered users.</div>}
          </div>
        </section>

        <section className="documentsSection">
          <div className="sectionHeader"><h2>Preorders</h2><span>{preorders.length} shown</span></div>
          {preordersError ? (
            <div className="legalNotice">Preorders are unavailable until migration 007_preorders.sql is applied.</div>
          ) : preorders.length ? (
            <div className="documentList">
              {preorders.map((preorder) => (
                <article className="documentRow" key={preorder.id}>
                  <div className="docIcon"><ClipboardCheck /></div>
                  <div className="docName"><b>{preorder.email}</b><span>User ID: {preorder.user_id}</span><span>Reserved {new Date(preorder.created_at).toLocaleString()}</span></div>
                  <span className={`status status-${preorder.status}`}>{preorder.status}</span>
                </article>
              ))}
            </div>
          ) : <div className="emptyList">No preorder reservations yet.</div>}
        </section>

        <section className="documentsSection">
          <div className="sectionHeader"><h2>Pilot requests</h2><span>{leads.length} shown</span></div>
          {requestsError ? (
            <div className="legalNotice">Pilot inbox is unavailable until migration 006_pilot_requests.sql is applied.</div>
          ) : leads.length ? (
            <div className="documentList">
              {leads.map((lead) => (
                <article className="documentRow" key={lead.id}>
                  <div className="docIcon"><Mail /></div>
                  <div className="docName"><b>{lead.name}</b><span>{lead.email}</span><span>{[lead.role, lead.company].filter(Boolean).join(" · ") || "No company/role provided"}</span><p>{lead.message}</p></div>
                  <span className={`status status-${lead.status}`}>{lead.status}</span>
                  <span className="riskText"><Clock3 size={13} /> {new Date(lead.created_at).toLocaleString()}</span>
                </article>
              ))}
            </div>
          ) : <div className="emptyList">No pilot requests yet.</div>}
        </section>
      </div>
    </main>
  );
}

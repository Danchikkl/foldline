import type { Metadata } from "next";
import { Mail, UserRound, Building2, Clock3, ClipboardCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

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

export default async function AdminPage() {
  await requireAdmin();

  // Service-role access happens only after the authenticated user passed the exact ID allowlist.
  const admin = createAdminClient();
  const [{ data: requests, error: requestsError }, { data: preorderRows, error: preordersError }, usersResult] = await Promise.all([
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
    admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
  ]);

  const users = usersResult.data?.users ?? [];
  const leads = (requests ?? []) as PilotRequest[];
  const preorders = (preorderRows ?? []) as Preorder[];
  const newCount = leads.filter((lead) => lead.status === "new").length;
  const reservedCount = preorders.filter((preorder) => preorder.status === "reserved").length;

  return (
    <main className="contentPage">
      <div className="container">
        <span className="eyebrow">Founder only</span>
        <h1>Foldline admin</h1>
        <p className="lede">Private view of signups, pilot requests and preorder reservations. This route is not linked from the public product.</p>

        <div className="dashGrid">
          <section className="insightCard">
            <span className="eyebrow">Pilot inbox</span>
            <h3>{leads.length} request{leads.length === 1 ? "" : "s"}</h3>
            <p>{newCount} currently marked new.</p>
          </section>
          <section className="insightCard">
            <span className="eyebrow">Preorders</span>
            <h3>{preorders.length} reservation{preorders.length === 1 ? "" : "s"}</h3>
            <p>{reservedCount} currently reserved.</p>
          </section>
          <section className="insightCard">
            <span className="eyebrow">Auth signups</span>
            <h3>{users.length} user{users.length === 1 ? "" : "s"}</h3>
            <p>First 100 Supabase Auth users, newest data loaded server-side.</p>
          </section>
        </div>

        <section className="documentsSection">
          <div className="sectionHeader">
            <h2>Preorders</h2>
            <span>{preorders.length} shown</span>
          </div>
          {preordersError ? (
            <div className="legalNotice">Preorders are unavailable until migration 007_preorders.sql is applied.</div>
          ) : preorders.length ? (
            <div className="documentList">
              {preorders.map((preorder) => (
                <article className="documentRow" key={preorder.id}>
                  <div className="docIcon"><ClipboardCheck /></div>
                  <div className="docName">
                    <b>{preorder.email}</b>
                    <span>User ID: {preorder.user_id}</span>
                    <span>Reserved {new Date(preorder.created_at).toLocaleString()}</span>
                  </div>
                  <span className={`status status-${preorder.status}`}>{preorder.status}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="emptyList">No preorder reservations yet.</div>
          )}
        </section>

        <section className="documentsSection">
          <div className="sectionHeader">
            <h2>Pilot requests</h2>
            <span>{leads.length} shown</span>
          </div>
          {requestsError ? (
            <div className="legalNotice">Pilot inbox is unavailable until migration 006_pilot_requests.sql is applied.</div>
          ) : leads.length ? (
            <div className="documentList">
              {leads.map((lead) => (
                <article className="documentRow" key={lead.id}>
                  <div className="docIcon"><Mail /></div>
                  <div className="docName">
                    <b>{lead.name}</b>
                    <span>{lead.email}</span>
                    <span>{[lead.role, lead.company].filter(Boolean).join(" · ") || "No company/role provided"}</span>
                    <p>{lead.message}</p>
                  </div>
                  <span className={`status status-${lead.status}`}>{lead.status}</span>
                  <span className="riskText"><Clock3 size={13} /> {new Date(lead.created_at).toLocaleString()}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="emptyList">No pilot requests yet.</div>
          )}
        </section>

        <section className="documentsSection">
          <div className="sectionHeader">
            <h2>Registered users</h2>
            <span>{users.length} shown</span>
          </div>
          <div className="documentList">
            {users.length ? users.map((user) => (
              <article className="documentRow" key={user.id}>
                <div className="docIcon"><UserRound /></div>
                <div className="docName">
                  <b>{user.email || "No email"}</b>
                  <span><Building2 size={13} /> User ID: {user.id}</span>
                  <span>Created {new Date(user.created_at).toLocaleString()}</span>
                </div>
                <span className="status status-ready">{user.email_confirmed_at ? "confirmed" : "unconfirmed"}</span>
              </article>
            )) : <div className="emptyList">No registered users.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}

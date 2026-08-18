import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { BillingButtons } from "@/components/billing-buttons";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Billing(){const {user,supabase}=await requireUser();const {data:sub}=await supabase.from("subscriptions").select("plan,status,current_period_end,stripe_customer_id").eq("user_id",user.id).maybeSingle();return <DashboardShell email={user.email||"account"}><div className="settingsPage"><span className="eyebrow">Billing</span><h1>Your plan</h1><div className="billingCard"><div><b>{sub?.plan === "pro" ? "Pro" : "Free"}</b><p>{sub?.plan === "pro" ? "Up to 500 documents per month." : "10 documents per month. No card required."}</p>{sub?.current_period_end && <small>Current period ends {new Date(sub.current_period_end).toLocaleDateString()}.</small>}</div><BillingButtons hasCustomer={Boolean(sub?.stripe_customer_id)} isPro={sub?.plan === "pro"}/></div><p className="settingsHint">Payments use Stripe-hosted Checkout; Foldline never receives raw card numbers.</p></div></DashboardShell>}

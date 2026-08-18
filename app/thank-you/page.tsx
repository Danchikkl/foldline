import type { Metadata } from "next";
import Link from "next/link";
import { Check, MailCheck, ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Thank you",
  description: "Your Foldline next step.",
  robots: { index: false, follow: false },
};

export default async function ThankYou({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const signup = type !== "billing";
  return <main className="thankYouPage"><div className="thankYouBrand"><Logo/></div><section className="thankYouCard"><div className="successIcon">{signup ? <MailCheck/> : <Check/>}</div><span className="eyebrow">{signup ? "One more step" : "Payment received"}</span><h1>{signup ? "Check your inbox." : "You’re on Pro."}</h1><p>{signup ? "We sent an email verification link. After confirmation, you can open the workspace and process your first document." : "Your Stripe subscription will sync to Foldline through the signed webhook. Open billing to verify the current plan."}</p><div className="heroActions">{signup ? <Link href="/login" className="button buttonDark">I confirmed my email <ArrowRight size={16}/></Link> : <Link href="/settings/billing" className="button buttonDark">Open billing <ArrowRight size={16}/></Link>}<Link href="/" className="button buttonGhost">Back home</Link></div></section></main>;
}

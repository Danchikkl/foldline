import Link from "next/link";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <header className="siteHeader"><div className="container headerInner"><Logo /><nav className="navLinks" aria-label="Primary"><Link href="/#how-it-works">How it works</Link><Link href="/#proof">Proofline</Link><Link href="/use-cases">Use cases</Link><Link href="/security">Security</Link><Link href="/pricing">Pricing</Link></nav><div className="headerActions">{user ? <Link className="button buttonDark buttonSmall" href="/dashboard">Open workspace</Link> : <><Link className="textButton" href="/login">Log in</Link><Link className="button buttonAccent buttonSmall" href="/signup">Start free</Link></>}</div></div></header>;
}

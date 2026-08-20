import Link from "next/link";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  let signedIn = false;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    // Public pages should still render even if auth/session refresh is unavailable.
    signedIn = false;
  }

  return (
    <header className="siteHeader">
      <div className="container headerInner">
        <Logo />
        <nav className="navLinks" aria-label="Primary">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#proof">Proofline</Link>
          <Link href="/use-cases">Use cases</Link>
          <Link href="/security">Security</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <div className="headerActions">
          {signedIn ? (
            <Link className="button buttonDark buttonSmall" href="/dashboard">Open workspace</Link>
          ) : (
            <>
              <Link className="textButton" href="/login">Log in</Link>
              <Link className="button buttonAccent buttonSmall" href="/signup">Start free</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

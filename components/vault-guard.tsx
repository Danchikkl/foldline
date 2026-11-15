"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

/**
 * The private workspace relies on its Content-Security-Policy, which the
 * browser only applies when the page itself is loaded from /vault. Arriving by
 * an in-app link keeps the previous page's (looser) policy, so this guard
 * reloads the page in that case, and in production refuses to show anything if
 * the policy is not actually in force.
 */
export function VaultGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "unprotected">("checking");

  useEffect(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    let loadedPath = "";
    try { loadedPath = entry ? new URL(entry.name).pathname : ""; } catch { loadedPath = ""; }
    if (!loadedPath.startsWith("/vault")) {
      window.location.replace(window.location.pathname + window.location.search);
      return;
    }
    if (process.env.NODE_ENV === "production") {
      // The vault policy forbids eval. If eval works, the policy is missing.
      let evalWorks = true;
      try { new Function("return 1")(); } catch { evalWorks = false; }
      if (evalWorks) { setState("unprotected"); return; }
    }
    setState("ok");
  }, []);

  if (state === "checking") return <div className="dashboard"><p className="vaultMuted">Loading private workspace…</p></div>;
  if (state === "unprotected") {
    return <div className="dashboard"><div className="vaultGate">
      <div className="dropIcon"><ShieldAlert size={24}/></div>
      <h1>This page loaded without its security policy.</h1>
      <p className="vaultMuted">The private workspace only opens when the browser enforces its protection against data leaving the page. Reload the page. If you see this again, do not enter your passphrase and contact Foldline.</p>
      <button className="button buttonDark" onClick={() => window.location.reload()}>Reload</button>
    </div></div>;
  }
  return <>{children}</>;
}

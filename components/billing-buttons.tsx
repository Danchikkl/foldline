"use client";

import { useState } from "react";

type BillingResponse = {
  url?: string;
  error?: string;
};

export function BillingButtons({ hasCustomer, isPro }: { hasCustomer: boolean; isPro: boolean }) {
  const [busy, setBusy] = useState(false);

  async function go(path: string) {
    setBusy(true);
    const r = await fetch(path, { method: "POST" });
    const j = (await r.json()) as BillingResponse;
    if (r.ok && j.url) {
      location.href = j.url;
    } else {
      alert(j.error || "Billing request failed.");
      setBusy(false);
    }
  }

  return (
    <div className="billingActions">
      {!isPro && (
        <button disabled={busy} className="button buttonAccent" onClick={() => void go("/api/billing/checkout")}>
          Upgrade to Pro
        </button>
      )}
      {hasCustomer && (
        <button disabled={busy} className="button buttonGhost" onClick={() => void go("/api/billing/portal")}>
          Manage billing
        </button>
      )}
    </div>
  );
}

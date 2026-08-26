"use client";

import { useState } from "react";

export function PreorderButton({ joined }: { joined: boolean }) {
  const [reserved, setReserved] = useState(joined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reserve() {
    if (busy || reserved) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/preorder", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not reserve your place.");
      setReserved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reserve your place.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="billingActions">
      <button
        type="button"
        className="button buttonAccent"
        disabled={busy || reserved}
        onClick={() => void reserve()}
      >
        {reserved ? "Preorder reserved" : busy ? "Reserving…" : "Reserve preorder"}
      </button>
      {reserved && <span className="settingsHint">No payment has been taken. I’ll contact you before any paid plan starts.</span>}
      {error && <div className="formError" role="alert">{error}</div>}
    </div>
  );
}

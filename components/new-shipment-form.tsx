"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ShipmentCreateResponse = {
  error?: string;
  shipment?: { id: string };
};

export function NewShipmentForm() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/shipments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference, origin: "", destination: "" }),
      });

      const data = (await response.json()) as ShipmentCreateResponse;
      if (!response.ok) throw new Error(data.error || "Could not create review.");
      if (!data.shipment?.id) throw new Error("Review was created but could not be opened.");

      router.push(`/shipments/${data.shipment.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create review.");
      setBusy(false);
    }
  }

  return (
    <form className="authForm" onSubmit={submit}>
      <label>
        Review reference
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="October AP batch or INV-2048"
          maxLength={120}
          required
        />
      </label>
      {error && <div className="formError" role="alert">{error}</div>}
      <button className="button buttonAccent buttonWide" disabled={busy}>
        {busy ? "Opening…" : "Start review"}
      </button>
    </form>
  );
}

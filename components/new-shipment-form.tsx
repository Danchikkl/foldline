"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewShipmentForm() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
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
        body: JSON.stringify({ reference, origin, destination }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create shipment.");

      setReference("");
      setOrigin("");
      setDestination("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create shipment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="authForm" onSubmit={submit}>
      <label>
        Shipment reference
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="KZ-00482"
          maxLength={120}
          required
        />
      </label>
      <label>
        Origin
        <input
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="Shenzhen, China"
          maxLength={120}
        />
      </label>
      <label>
        Destination
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Astana, Kazakhstan"
          maxLength={120}
        />
      </label>
      {error && <div className="formError" role="alert">{error}</div>}
      <button className="button buttonAccent buttonWide" disabled={busy}>
        {busy ? "Creating…" : "+ New shipment"}
      </button>
    </form>
  );
}

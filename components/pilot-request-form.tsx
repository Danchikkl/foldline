"use client";

import Link from "next/link";
import { useState } from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";

export function PilotRequestForm() {
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;

    setState("submitting");
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      company: String(formData.get("company") || ""),
      role: String(formData.get("role") || ""),
      message: String(formData.get("message") || ""),
      website: String(formData.get("website") || ""),
    };

    try {
      const response = await fetch("/api/pilot-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not send your request.");

      form.reset();
      setState("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your request.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="legalNotice" role="status">
        Thanks. Your request was saved. I’ll reply to the email you provided.
      </div>
    );
  }

  return (
    <form className="authForm" onSubmit={submit}>
      <label>
        Name
        <input name="name" maxLength={120} autoComplete="name" required />
      </label>
      <label>
        Work email
        <input name="email" type="email" maxLength={254} autoComplete="email" required />
      </label>
      <label>
        Company <span aria-hidden="true">(optional)</span>
        <input name="company" maxLength={160} autoComplete="organization" />
      </label>
      <label>
        Role <span aria-hidden="true">(optional)</span>
        <input name="role" maxLength={160} autoComplete="organization-title" />
      </label>
      <label>
        What would you like to test?
        <textarea
          name="message"
          maxLength={2000}
          rows={5}
          placeholder="For example: comparing supplier invoices and packing lists before customs clearance."
          required
        />
      </label>

      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <p className="formHint">
        By submitting, you agree that Foldline may use these details to reply to your request. See the <Link href="/legal/privacy">Privacy notice</Link>.
      </p>

      {error && <div className="formError" role="alert">{error}</div>}

      <button className="button buttonAccent buttonWide" disabled={state === "submitting"}>
        {state === "submitting" ? "Sending…" : "Request a pilot"}
      </button>
    </form>
  );
}

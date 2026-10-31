"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, CopyX, Download, Eye, EyeOff, FileQuestion, Save, ShieldCheck, Sparkles } from "lucide-react";
import { displayStatus, outcomeOf, OUTCOME_LABELS, type InvoiceData, type Outcome, type ValidationResult } from "@/lib/invoice";
import { DUPLICATE_LABELS, fingerprintFromData, type InvoiceFingerprint } from "@/lib/duplicates";

type Doc = { id: string; original_filename: string; content_type: string; status: string; extracted_data: InvoiceData | null; validation_data: ValidationResult | null; error_message: string | null; updated_at: string };
const labels: Record<string, string> = { supplier_name: "Supplier", supplier_bin: "BIN / IIN", invoice_number: "Invoice #", invoice_date: "Date", po_number: "PO reference", currency: "Currency", subtotal: "Subtotal", vat: "VAT", total: "Total" };
const topFields = Object.keys(labels);
const numericFields = ["subtotal", "vat", "total"];

const OUTCOME_COPY: Record<Outcome, string> = {
  issue: "Don't pay this yet. At least one check found a problem a person needs to resolve.",
  review: "Foldline couldn't verify everything reliably. Check the highlighted fields against the original.",
  checked: "Every check passed. Nothing here needs your attention.",
  not_invoice: "This file doesn't look like a supplier invoice, so no checks were run.",
};

function OutcomeIcon({ outcome }: { outcome: Outcome }) {
  if (outcome === "issue") return <CopyX size={20} />;
  if (outcome === "review") return <AlertTriangle size={20} />;
  if (outcome === "not_invoice") return <FileQuestion size={20} />;
  return <Check size={20} />;
}

function money(v: number | null, currency: string | null) {
  if (v === null) return "—";
  return `${currency ? currency + " " : ""}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CompareRow({ label, a, b, same: sameOverride }: { label: string; a: string; b: string; same?: boolean }) {
  const same = sameOverride ?? (a.trim().toLowerCase() === b.trim().toLowerCase() && a !== "—");
  return <div className={`dupRow ${same ? "dupSame" : ""}`}><span>{label}</span><b>{a}</b><b>{b}</b></div>;
}

export function DocumentReview({ document: doc }: { document: Doc }) {
  const [data, setData] = useState<InvoiceData | null>(doc.extracted_data);
  const [validation, setValidation] = useState<ValidationResult | null>(doc.validation_data);
  const [fileUrl, setFileUrl] = useState<string>("");
  const [proof, setProof] = useState(true);
  const [exceptionsOnly, setExceptionsOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { fetch(`/api/documents/${doc.id}/file`).then((r) => r.ok ? r.json() : Promise.reject()).then((x) => setFileUrl(x.url)).catch(() => {}); }, [doc.id]);
  useEffect(() => {
    if (["queued", "processing", "uploading"].includes(doc.status)) {
      const t = setInterval(() => window.location.reload(), 3500); return () => clearInterval(t);
    }
  }, [doc.status]);

  const outcome = outcomeOf(validation);
  const duplicates = validation?.duplicates ?? [];
  const current: InvoiceFingerprint | null = data ? fingerprintFromData(data) : null;
  const visibleFields = useMemo(
    () => topFields.filter((key) => data && key in data && (!exceptionsOnly || !validation || validation.needs_review.includes(key))),
    [exceptionsOnly, validation, data],
  );

  function editField(key: string, value: string) {
    if (!data) return;
    const old = (data[key as keyof InvoiceData] as { value: unknown; confidence: number; evidence: string } | undefined) ?? { value: null, confidence: 0, evidence: "" };
    const parsed = numericFields.includes(key) ? (value === "" ? null : Number(value)) : value;
    // A human-entered value is trusted: it passes the reliability gate on save.
    setData({ ...data, [key]: { ...old, value: parsed, confidence: 1, evidence: old.evidence || "Entered by reviewer" } });
    setDirty(true);
  }
  function editLine(i: number, patch: Partial<InvoiceData["line_items"][number]>) {
    if (!data) return;
    const a = [...data.line_items]; a[i] = { ...a[i], ...patch, confidence: 1 };
    setData({ ...data, line_items: a }); setDirty(true);
  }
  async function save(action: "save" | "approve") {
    if (!data) return; setSaving(true); setMessage("");
    const r = await fetch(`/api/documents/${doc.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ extracted: data, action }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      setValidation(j.validation); setDirty(false);
      setMessage(action === "approve" ? "Approved and recorded in the audit log." : "Saved — all checks re-ran against your invoice history.");
    } else setMessage(j.error || "Could not save.");
    setSaving(false);
  }

  if (["uploading", "queued", "processing"].includes(doc.status)) return <div className="processingPage"><div className="processingOrb" /><span className="eyebrow">Invoice check</span><h1>Reading {doc.original_filename}</h1><p>We read the invoice, compare it with your earlier invoices and run the exception checks. This page refreshes automatically.</p><div className="pipeline"><span className="done">Uploaded</span><i /><span className={doc.status !== "uploading" ? "done" : ""}>Verified</span><i /><span className={doc.status === "processing" ? "active" : ""}>Reading</span><i /><span>Checks</span></div></div>;
  if (doc.status === "failed") return <div className="emptyState"><AlertTriangle /><h2>Processing failed</h2><p>{doc.error_message || "The document could not be processed."}</p><button className="button buttonDark" onClick={() => fetch(`/api/documents/${doc.id}/process`, { method: "POST" }).then(() => location.reload())}>Retry safely</button></div>;
  if (!data) return <div className="emptyState"><AlertTriangle /><h2>No extracted data yet</h2></div>;

  const openExceptions = validation?.checks.filter((c) => ["issue", "possible"].includes(displayStatus(c.status))).length ?? 0;

  return <div className="reviewPage">
    <header className="reviewHeader"><div><span className="eyebrow">Invoice exception check</span><h1>{doc.original_filename}</h1></div><div className="reviewActions"><button className="button buttonGhost" onClick={() => setProof(!proof)}>{proof ? <EyeOff size={16} /> : <Eye size={16} />} {proof ? "Hide evidence" : "Show evidence"}</button><a className="button buttonGhost" href={`/api/documents/${doc.id}/export`}><Download size={16} />CSV</a><button className="button buttonDark" disabled={saving} onClick={() => void save("save")}><Save size={16} />{dirty ? "Save & re-check" : "Re-check"}</button><button className="button buttonAccent" disabled={saving} onClick={() => void save("approve")}><Check size={16} />{openExceptions ? "Approve anyway" : "Approve"}</button></div></header>
    {message && <div className="inlineNotice">{message}</div>}
    <div className="reviewGrid"><section className="previewPanel"><div className="panelTitle"><span>Original</span><span className="secureTag"><ShieldCheck size={14} />private signed URL</span></div>{fileUrl ? (doc.content_type === "application/pdf" ? <iframe title="Original document" src={fileUrl} /> : <img src={fileUrl} alt="Original document" />) : <div className="previewLoading">Generating secure preview…</div>}</section>
      <section className="dataPanel">
        {outcome && <div className={`outcomeBanner outcome-${outcome}`}><OutcomeIcon outcome={outcome} /><div><strong>{OUTCOME_LABELS[outcome]}{validation?.summary && outcome !== "checked" ? ` — ${validation.summary}` : ""}</strong><p>{OUTCOME_COPY[outcome]}</p></div></div>}

        {duplicates.length > 0 && current && <div className="dupList">{duplicates.map((d) => <article key={d.document_id} className={`dupCard dup-${d.severity}`}>
          <div className="dupHead"><b>{DUPLICATE_LABELS[d.kind]}</b><span>{d.status === "reviewed" ? "matched invoice already approved" : "matched invoice not yet approved"}</span></div>
          <ul>{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <div className="dupTable"><div className="dupRow dupTableHead"><span /><span>This invoice</span><span>{d.filename}</span></div>
            <CompareRow label="Supplier" a={current.supplier_name ?? current.supplier_bin ?? "—"} b={d.other.supplier_name ?? d.other.supplier_bin ?? "—"} />
            <CompareRow label="Invoice #" a={current.invoice_number ?? "—"} b={d.other.invoice_number ?? "—"} />
            <CompareRow label="Date" a={current.invoice_date ?? "—"} b={d.other.invoice_date ?? "—"} />
            <CompareRow label="Total" a={money(current.total, current.currency)} b={money(d.other.total, d.other.currency)} same={current.total !== null && d.other.total !== null && Math.abs(current.total - d.other.total) < 0.01} />
          </div>
          <Link className="inlineLink" href={`/documents/${d.document_id}`}>Open matched invoice <ArrowRight size={14} /></Link>
        </article>)}</div>}

        <div className="proofToolbar"><div><span className="eyebrow"><Sparkles size={13} /> Review by exception</span><h2>{validation?.compared_count !== undefined ? `Compared with ${validation.compared_count} earlier invoice${validation.compared_count === 1 ? "" : "s"}` : "Checks"}</h2></div><label className="switchLabel"><input type="checkbox" checked={exceptionsOnly} onChange={(e) => setExceptionsOnly(e.target.checked)} /><span />Only show exceptions</label></div>
        {validation && <div className="checks">{validation.checks.map((c) => <div key={c.id} className={`check check-${displayStatus(c.status)}`}><span className="checkDot" /><div><strong>{c.label}</strong><p>{c.message}</p></div></div>)}</div>}
        <div className="fieldStack">{visibleFields.length === 0 && <div className="allClear"><Check size={20} /><div><strong>No fields need attention.</strong><p>Turn off “Only show exceptions” to inspect every extracted field.</p></div></div>}{visibleFields.map((key) => { const field = data[key as keyof InvoiceData] as { value: string | number | null; confidence: number; evidence: string }; return <div className="proofField" key={key}><div className="fieldLabel"><label htmlFor={key}>{labels[key]}</label><span className={`confidence ${field.confidence >= .85 ? "high" : field.confidence >= .7 ? "mid" : "low"}`}>{field.confidence >= 1 ? "edited" : `${Math.round(field.confidence * 100)}%`}</span></div><input id={key} inputMode={numericFields.includes(key) ? "decimal" : undefined} value={field.value ?? ""} onChange={(e) => editField(key, e.target.value)} />{proof && field.evidence && <div className="evidence"><span>Evidence</span>{field.evidence}</div>}</div>; })}</div>
        <div className="lineItemsHeader"><h3>Line items</h3><span>{data.line_items.length} detected</span></div><div className="lineTable"><div className="lineRow lineHead"><span>Description</span><span>Qty</span><span>Unit</span><span>Amount</span></div>{data.line_items.map((item, i) => <div className="lineRow" key={i}><input value={item.description} onChange={(e) => editLine(i, { description: e.target.value })} /><input inputMode="decimal" value={item.quantity ?? ""} onChange={(e) => editLine(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })} /><input inputMode="decimal" value={item.unit_price ?? ""} onChange={(e) => editLine(i, { unit_price: e.target.value === "" ? null : Number(e.target.value) })} /><input inputMode="decimal" value={item.amount ?? ""} onChange={(e) => editLine(i, { amount: e.target.value === "" ? null : Number(e.target.value) })} /></div>)}</div>
      </section></div>
  </div>;
}

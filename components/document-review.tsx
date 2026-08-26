"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Download, Eye, EyeOff, Plus, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import type { InvoiceData } from "@/lib/invoice";
import type { CheckStatus, ValidationResult } from "@/lib/invoice-reliability";

type Doc = {
  id: string;
  original_filename: string;
  content_type: string;
  status: string;
  extracted_data: InvoiceData | null;
  validation_data: ValidationResult | null;
  error_message: string | null;
  updated_at: string;
};
type FileResponse = { url?: string };
type StatusResponse = { status: string; error_message?: string | null };
type SaveResponse = { validation?: ValidationResult; error?: string };
type RetryResponse = { error?: string };

const labels: Record<string, string> = {
  supplier_name: "Supplier",
  supplier_bin: "BIN / IIN",
  invoice_number: "Invoice #",
  po_number: "PO #",
  invoice_date: "Date",
  currency: "Currency",
  subtotal: "Subtotal",
  vat: "VAT",
  total: "Total",
};
const topFields = Object.keys(labels);

async function readJsonSafely<T extends { error?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  try { return JSON.parse(text) as T; }
  catch { return { error: text || `Request failed with status ${response.status}.` } as T; }
}

function riskTitle(validation: ValidationResult | null) {
  if (!validation) return "Review pending";
  if (validation.extraction.status === "unsupported") return "Unsupported document";
  if (validation.risk_level === "not_calculated") return "Needs review before risk is calculated";
  if (validation.risk_level === "high") return "High risk";
  if (validation.risk_level === "medium") return "Needs attention";
  return "Low risk";
}

function checkDot(status: CheckStatus) {
  if (status === "fail") return "var(--danger)";
  if (status === "skipped") return "#9aa0a8";
  if (status === "info") return "#6c7785";
  return "var(--good)";
}

function numberOrNull(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function DocumentReview({ document: doc }: { document: Doc }) {
  const [data, setData] = useState<InvoiceData | null>(doc.extracted_data);
  const [validation, setValidation] = useState<ValidationResult | null>(doc.validation_data);
  const [fileUrl, setFileUrl] = useState("");
  const [status, setStatus] = useState(doc.status);
  const [statusError, setStatusError] = useState(doc.error_message || "");
  const [proof, setProof] = useState(true);
  const [exceptionsOnly, setExceptionsOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/documents/${doc.id}/file`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((x) => setFileUrl(((x as FileResponse).url) || ""))
      .catch(() => {});
  }, [doc.id]);

  useEffect(() => {
    if (!["queued", "processing", "uploading"].includes(status)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const poll = async () => {
      if (stopped) return;
      attempts += 1;
      try {
        const response = await fetch(`/api/documents/${doc.id}`, { cache: "no-store" });
        if (response.ok) {
          const current = (await response.json()) as StatusResponse;
          if (stopped) return;
          if (current.status !== status) {
            setStatus(current.status);
            setStatusError(current.error_message || "");
            if (["ready", "reviewed"].includes(current.status)) {
              window.location.reload();
              return;
            }
          }
        }
      } catch {}

      if (!stopped && attempts < 40 && ["queued", "processing", "uploading"].includes(status)) {
        timer = setTimeout(poll, 5000);
      }
    };

    timer = setTimeout(poll, 2500);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [doc.id, status]);

  const visibleFields = useMemo(() => {
    if (!exceptionsOnly || !validation) return topFields;
    if (validation.extraction.status !== "reliable") {
      return validation.needs_review.length ? topFields.filter((key) => validation.needs_review.includes(key)) : topFields;
    }
    return topFields.filter((key) => validation.needs_review.includes(key));
  }, [exceptionsOnly, validation]);

  function editField(key: string, value: string) {
    if (!data) return;
    const old = data[key as keyof InvoiceData] as { value: unknown; confidence: number; evidence: string };
    const numeric = ["subtotal", "vat", "total"].includes(key);
    setData({ ...data, [key]: { ...old, value: numeric ? numberOrNull(value) : value, confidence: 1 } });
  }

  function editLineItem(index: number, patch: Partial<InvoiceData["line_items"][number]>) {
    if (!data) return;
    const items = [...data.line_items];
    items[index] = { ...items[index], ...patch, confidence: 1 };
    setData({ ...data, line_items: items });
  }

  function addLineItem() {
    if (!data) return;
    setData({
      ...data,
      line_items: [...data.line_items, { description: "", quantity: null, unit_price: null, amount: null, confidence: 1, evidence: "Manually added during review" }],
    });
  }

  function removeLineItem(index: number) {
    if (!data) return;
    setData({ ...data, line_items: data.line_items.filter((_, i) => i !== index) });
  }

  async function save(action: "save" | "approve") {
    if (!data) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ extracted: data, action }),
      });
      const body = await readJsonSafely<SaveResponse>(response);
      if (response.ok) {
        if (body.validation) setValidation(body.validation);
        setMessage(action === "approve" ? "Approved after human review and audit-logged." : "Saved and rechecked.");
      } else setMessage(body.error || "Could not save.");
    } catch {
      setMessage("Could not save. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function retry() {
    setRetrying(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${doc.id}/process`, { method: "POST" });
      const body = await readJsonSafely<RetryResponse>(response);
      if (!response.ok) {
        setMessage(body.error || "Could not retry processing.");
        return;
      }
      window.location.reload();
    } catch {
      setMessage("Could not retry processing. Check the connection and try again.");
    } finally {
      setRetrying(false);
    }
  }

  if (["uploading", "queued", "processing"].includes(status)) {
    return <div className="processingPage"><div className="processingOrb"/><span className="eyebrow">Document pipeline</span><h1>Reading {doc.original_filename}</h1><p>We verify the upload, extract the document and run business checks only when the extraction is reliable enough.</p><div className="pipeline"><span className="done">Uploaded</span><i/><span className={status !== "uploading" ? "done" : ""}>Verified</span><i/><span className={status === "processing" ? "active" : ""}>Extraction</span><i/><span>Checks</span></div></div>;
  }

  if (status === "failed") {
    return <div className="emptyState"><AlertTriangle/><h2>Processing unavailable</h2><p>{statusError || "The document could not be processed."}</p>{message && <div className="formError">{message}</div>}<button className="button buttonDark" disabled={retrying} onClick={() => void retry()}>{retrying ? "Retrying…" : "Retry processing"}</button></div>;
  }
  if (!data) return <div className="emptyState"><AlertTriangle/><h2>No extracted data yet</h2></div>;

  const extractionNeedsReview = validation?.extraction.status === "needs_review";
  const unsupported = validation?.extraction.status === "unsupported";
  const qualityStyle = unsupported
    ? { border: "1px solid #e3aaa6", background: "#fff0ef", color: "#7f2f2b", borderRadius: 10, padding: 12, margin: "14px 0" }
    : { border: "1px solid #e3cf91", background: "#fff8e6", color: "#6f5516", borderRadius: 10, padding: 12, margin: "14px 0" };

  return <div className="reviewPage">
    <header className="reviewHeader"><div><span className="eyebrow">Proofline review</span><h1>{doc.original_filename}</h1></div><div className="reviewActions"><button className="button buttonGhost" onClick={() => setProof(!proof)}>{proof ? <EyeOff size={16}/> : <Eye size={16}/>} {proof ? "Hide proof" : "Show proof"}</button><a className="button buttonGhost" href={`/api/documents/${doc.id}/export`}><Download size={16}/>CSV</a><button className="button buttonDark" disabled={saving} onClick={() => void save("save")}><Save size={16}/>Save</button><button className="button buttonAccent" disabled={saving || unsupported} onClick={() => void save("approve")}><Check size={16}/>Approve after review</button></div></header>
    {message && <div className="inlineNotice">{message}</div>}
    <div className="reviewGrid"><section className="previewPanel"><div className="panelTitle"><span>Original</span><span className="secureTag"><ShieldCheck size={14}/>private signed URL</span></div>{fileUrl ? (doc.content_type === "application/pdf" ? <iframe title="Original document" src={fileUrl}/> : <img src={fileUrl} alt="Original document"/>) : <div className="previewLoading">Generating secure preview…</div>}</section>
    <section className="dataPanel">
      <div className="proofToolbar"><div><span className="eyebrow"><Sparkles size={13}/> Review by exception</span><h2>{riskTitle(validation)}</h2>{validation && <p style={{ margin: "5px 0 0", fontSize: 10, color: "#737985" }}>{validation.summary}</p>}</div><label className="switchLabel"><input type="checkbox" checked={exceptionsOnly} onChange={(e)=>setExceptionsOnly(e.target.checked)}/><span/>Only show exceptions</label></div>

      {validation && validation.extraction.status !== "reliable" && <div style={qualityStyle}><strong>{unsupported ? "Current invoice workflow cannot verify this document." : "Risk is intentionally not calculated yet."}</strong><p style={{ fontSize: 10, lineHeight: 1.5 }}>{unsupported ? "Foldline will not invent invoice results for an unsupported file." : "The extraction did not pass the reliability gate. Compare the fields with the source, correct anything necessary, then approve after review."}</p>{validation.extraction.issues.length > 0 && <ul style={{ marginBottom: 0, paddingLeft: 18, fontSize: 9, lineHeight: 1.6 }}>{validation.extraction.issues.map((issue, index)=><li key={`${issue}-${index}`}>{issue}</li>)}</ul>}</div>}

      {validation && <div className="checks">{validation.checks.map((c)=><div key={c.id} className={`check check-${c.status}`}><span className="checkDot" style={{ background: checkDot(c.status) }}/><div><strong>{c.label}</strong><p>{c.message}</p></div></div>)}</div>}

      <div className="fieldStack">{visibleFields.length === 0 && <div className="allClear"><Check size={20}/><div><strong>{validation?.risk_level === "low" ? "Verified checks passed." : "No flagged fields."}</strong><p>Turn off “Only show exceptions” to inspect every extracted field.</p></div></div>}{visibleFields.map((key)=>{ const field=data[key as keyof InvoiceData] as { value: string | number | null; confidence: number; evidence: string }; return <div className="proofField" key={key}><div className="fieldLabel"><label htmlFor={key}>{labels[key]}</label><span className={`confidence ${field.confidence >= .85 ? "high" : field.confidence >= .7 ? "mid" : "low"}`}>{Math.round(field.confidence*100)}% extraction</span></div><input id={key} value={field.value ?? ""} onChange={(e)=>editField(key,e.target.value)}/>{proof && field.evidence && <div className="evidence"><span>Evidence</span>{field.evidence}</div>}</div>})}</div>

      <div className="lineItemsHeader"><h3>Line items</h3><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span>{data.line_items.length} row{data.line_items.length === 1 ? "" : "s"}</span><button className="button buttonGhost" style={{ padding: "6px 8px", fontSize: 9 }} onClick={addLineItem}><Plus size={12}/>Add row</button></div></div>
      <div className="lineTable"><div className="lineRow lineHead"><span>Description</span><span>Qty</span><span>Unit</span><span>Amount</span></div>{data.line_items.map((item,i)=><div style={{ position: "relative" }} key={i}><div className="lineRow"><input value={item.description} onChange={(e)=>editLineItem(i,{description:e.target.value})}/><input inputMode="decimal" value={item.quantity ?? ""} onChange={(e)=>editLineItem(i,{quantity:numberOrNull(e.target.value)})}/><input inputMode="decimal" value={item.unit_price ?? ""} onChange={(e)=>editLineItem(i,{unit_price:numberOrNull(e.target.value)})}/><input inputMode="decimal" value={item.amount ?? ""} onChange={(e)=>editLineItem(i,{amount:numberOrNull(e.target.value)})}/></div><button type="button" aria-label={`Remove line item ${i + 1}`} title="Remove row" onClick={()=>removeLineItem(i)} style={{ position:"absolute", right:4, top:4, border:0, background:"transparent", cursor:"pointer", padding:2, opacity:.55 }}><Trash2 size={11}/></button></div>)}</div>
      {extractionNeedsReview && <div style={{ marginTop: 14, padding: 11, borderRadius: 9, background: "#f0eee7", fontSize: 10 }}><strong>Why no percentage?</strong><p style={{ marginBottom: 0 }}>Extraction uncertainty is not business risk. Foldline withholds the risk result until enough fields are reliable or a person confirms the document.</p></div>}
    </section></div>
  </div>;
}

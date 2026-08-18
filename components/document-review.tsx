"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Download, Eye, EyeOff, Save, ShieldCheck, Sparkles } from "lucide-react";
import type { InvoiceData, ValidationResult } from "@/lib/invoice";

type Doc = { id: string; original_filename: string; content_type: string; status: string; extracted_data: InvoiceData | null; validation_data: ValidationResult | null; error_message: string | null; updated_at: string };
const labels: Record<string,string> = { supplier_name:"Supplier", supplier_bin:"BIN / IIN", invoice_number:"Invoice #", invoice_date:"Date", currency:"Currency", subtotal:"Subtotal", vat:"VAT", total:"Total" };
const topFields = Object.keys(labels);

export function DocumentReview({ document: doc }: { document: Doc }) {
  const [data, setData] = useState<InvoiceData | null>(doc.extracted_data);
  const [validation, setValidation] = useState<ValidationResult | null>(doc.validation_data);
  const [fileUrl, setFileUrl] = useState<string>("");
  const [proof, setProof] = useState(true);
  const [exceptionsOnly, setExceptionsOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { fetch(`/api/documents/${doc.id}/file`).then((r) => r.ok ? r.json() : Promise.reject()).then((x) => setFileUrl(x.url)).catch(() => {}); }, [doc.id]);
  useEffect(() => {
    if (["queued","processing","uploading"].includes(doc.status)) {
      const t = setInterval(() => window.location.reload(), 3500); return () => clearInterval(t);
    }
  }, [doc.status]);

  const visibleFields = useMemo(() => topFields.filter((key) => !exceptionsOnly || !validation || validation.needs_review.includes(key)), [exceptionsOnly, validation]);
  function editField(key: string, value: string) {
    if (!data) return;
    const old = data[key as keyof InvoiceData] as { value: unknown; confidence: number; evidence: string };
    const numeric = ["subtotal","vat","total"].includes(key);
    setData({ ...data, [key]: { ...old, value: numeric ? (value === "" ? null : Number(value)) : value } });
  }
  async function save(action: "save"|"approve") {
    if (!data) return; setSaving(true); setMessage("");
    const r = await fetch(`/api/documents/${doc.id}`, { method:"PATCH", headers:{"content-type":"application/json"}, body: JSON.stringify({ extracted:data, action }) });
    const j = await r.json();
    if (r.ok) { setValidation(j.validation); setMessage(action === "approve" ? "Approved and audit-logged." : "Saved."); } else setMessage(j.error || "Could not save.");
    setSaving(false);
  }

  if (["uploading","queued","processing"].includes(doc.status)) return <div className="processingPage"><div className="processingOrb"/><span className="eyebrow">Document pipeline</span><h1>Reading {doc.original_filename}</h1><p>We verify the upload, parse the layout and build Proof Mode. This page refreshes automatically.</p><div className="pipeline"><span className="done">Uploaded</span><i/><span className={doc.status !== "uploading" ? "done":""}>Verified</span><i/><span className={doc.status === "processing" ? "active":""}>OCR</span><i/><span>Proof Mode</span></div></div>;
  if (doc.status === "failed") return <div className="emptyState"><AlertTriangle/><h2>Processing failed</h2><p>{doc.error_message || "The document could not be processed."}</p><button className="button buttonDark" onClick={() => fetch(`/api/documents/${doc.id}/process`, {method:"POST"}).then(()=>location.reload())}>Retry safely</button></div>;
  if (!data) return <div className="emptyState"><AlertTriangle/><h2>No extracted data yet</h2></div>;

  return <div className="reviewPage">
    <header className="reviewHeader"><div><span className="eyebrow">Proofline review</span><h1>{doc.original_filename}</h1></div><div className="reviewActions"><button className="button buttonGhost" onClick={() => setProof(!proof)}>{proof ? <EyeOff size={16}/> : <Eye size={16}/>} {proof ? "Hide proof" : "Show proof"}</button><a className="button buttonGhost" href={`/api/documents/${doc.id}/export`}><Download size={16}/>CSV</a><button className="button buttonDark" disabled={saving} onClick={() => void save("save")}><Save size={16}/>Save</button><button className="button buttonAccent" disabled={saving} onClick={() => void save("approve")}><Check size={16}/>Approve</button></div></header>
    {message && <div className="inlineNotice">{message}</div>}
    <div className="reviewGrid"><section className="previewPanel"><div className="panelTitle"><span>Original</span><span className="secureTag"><ShieldCheck size={14}/>private signed URL</span></div>{fileUrl ? (doc.content_type === "application/pdf" ? <iframe title="Original document" src={fileUrl}/> : <img src={fileUrl} alt="Original document"/>) : <div className="previewLoading">Generating secure preview…</div>}</section>
    <section className="dataPanel">
      <div className="proofToolbar"><div><span className="eyebrow"><Sparkles size={13}/> Review by exception</span><h2>{validation?.risk_score ?? 0}% risk score</h2></div><label className="switchLabel"><input type="checkbox" checked={exceptionsOnly} onChange={(e)=>setExceptionsOnly(e.target.checked)}/><span/>Only show exceptions</label></div>
      {validation && <div className="checks">{validation.checks.map((c)=><div key={c.id} className={`check check-${c.status}`}><span className="checkDot"/><div><strong>{c.label}</strong><p>{c.message}</p></div></div>)}</div>}
      <div className="fieldStack">{visibleFields.length === 0 && <div className="allClear"><Check size={20}/><div><strong>Nothing suspicious here.</strong><p>Turn off “Only show exceptions” to inspect every extracted field.</p></div></div>}{visibleFields.map((key)=>{ const field=data[key as keyof InvoiceData] as any; return <div className="proofField" key={key}><div className="fieldLabel"><label htmlFor={key}>{labels[key]}</label><span className={`confidence ${field.confidence >= .85 ? "high" : field.confidence >= .7 ? "mid":"low"}`}>{Math.round(field.confidence*100)}%</span></div><input id={key} value={field.value ?? ""} onChange={(e)=>editField(key,e.target.value)}/>{proof && field.evidence && <div className="evidence"><span>Evidence</span>{field.evidence}</div>}</div>})}</div>
      <div className="lineItemsHeader"><h3>Line items</h3><span>{data.line_items.length} detected</span></div><div className="lineTable"><div className="lineRow lineHead"><span>Description</span><span>Qty</span><span>Unit</span><span>Amount</span></div>{data.line_items.map((item,i)=><div className="lineRow" key={i}><input value={item.description} onChange={(e)=>{const a=[...data.line_items];a[i]={...a[i],description:e.target.value};setData({...data,line_items:a})}}/><input inputMode="decimal" value={item.quantity ?? ""} onChange={(e)=>{const a=[...data.line_items];a[i]={...a[i],quantity:e.target.value===""?null:Number(e.target.value)};setData({...data,line_items:a})}}/><input inputMode="decimal" value={item.unit_price ?? ""} onChange={(e)=>{const a=[...data.line_items];a[i]={...a[i],unit_price:e.target.value===""?null:Number(e.target.value)};setData({...data,line_items:a})}}/><input inputMode="decimal" value={item.amount ?? ""} onChange={(e)=>{const a=[...data.line_items];a[i]={...a[i],amount:e.target.value===""?null:Number(e.target.value)};setData({...data,line_items:a})}}/></div>)}</div>
    </section></div>
  </div>;
}

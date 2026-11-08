"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, FlaskConical, Lock, LockKeyhole, ShieldCheck, Trash2, Check } from "lucide-react";
import { createVault, openJson, passphraseProblems, recordContext, sealJson, unlockVault, WrongPassphraseError, type VaultHeader } from "@/lib/vault/crypto";
import { checkInvoiceLocally, outcomeOf, type HistoryItem, type VaultRecord } from "@/lib/vault/local-check";
import { SAMPLE_INVOICES } from "@/lib/trial";

type Phase = "loading" | "setup" | "locked" | "open" | "error";
type Row = HistoryItem & { error?: string };

const AUTO_LOCK_MS = 30 * 60 * 1000;
const OUTCOME_LABEL = { checked: "Checked", issue: "Issue found", review: "Requires review", not_invoice: "Not an invoice" } as const;
const OUTCOME_CLASS = { checked: "status-reviewed", issue: "status-failed", review: "status-processing", not_invoice: "" } as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || `Request failed (${response.status}).`);
  return body as T;
}

const money = (v: unknown, currency: unknown) =>
  typeof v === "number" ? `${currency ? `${currency} ` : ""}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const text = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function VaultWorkspace() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [header, setHeader] = useState<VaultHeader | null>(null);
  const [orgId, setOrgId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const keyRef = useRef<CryptoKey | null>(null);
  const historyRef = useRef<HistoryItem[]>([]);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const lock = useCallback(() => {
    keyRef.current = null;
    historyRef.current = [];
    setRows([]);
    setSelected(null);
    setPass("");
    setPhase("locked");
  }, []);

  const touch = useCallback(() => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(lock, AUTO_LOCK_MS);
  }, [lock]);

  useEffect(() => {
    api<{ organizationId: string; header: VaultHeader | null }>("/api/vault")
      .then((r) => { setOrgId(r.organizationId); setHeader(r.header); setPhase(r.header ? "locked" : "setup"); })
      .catch((e) => { setError(e.message); setPhase("error"); });
    return () => { if (lockTimer.current) clearTimeout(lockTimer.current); keyRef.current = null; };
  }, []);

  async function loadRecords(key: CryptoKey, organizationId: string) {
    const { records } = await api<{ records: { id: string; iv: string; ciphertext: string }[] }>("/api/vault/records");
    const out: Row[] = [];
    for (const r of records) {
      try {
        out.push({ id: r.id, record: await openJson<VaultRecord>(key, { iv: r.iv, ct: r.ciphertext }, recordContext(organizationId, r.id)) });
      } catch {
        out.push({ id: r.id, record: { filename: "Unreadable record", addedAt: "", data: null as never, validation: null as never }, error: "Could not be decrypted (tampered or from another workspace)." });
      }
    }
    historyRef.current = out.filter((r) => !r.error);
    setRows(out);
  }

  async function create() {
    setError("");
    if (pass !== pass2) { setError("The two passphrases don't match."); return; }
    const problems = passphraseProblems(pass);
    if (problems.length) { setError(problems.join(" ")); return; }
    setBusy("Creating your vault… this takes a few seconds on purpose.");
    try {
      const vault = await createVault(pass);
      await api("/api/vault", { method: "POST", body: JSON.stringify({ header: vault.header }) });
      keyRef.current = vault.key;
      setHeader(vault.header);
      setPass(""); setPass2("");
      setPhase("open");
      touch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the vault.");
    } finally { setBusy(""); }
  }

  async function unlock() {
    if (!header) return;
    setError("");
    setBusy("Unlocking…");
    try {
      const key = await unlockVault(pass, header);
      keyRef.current = key;
      setPass("");
      await loadRecords(key, orgId);
      setPhase("open");
      touch();
    } catch (e) {
      setError(e instanceof WrongPassphraseError ? "Wrong passphrase." : e instanceof Error ? e.message : "Could not unlock.");
    } finally { setBusy(""); }
  }

  async function save(id: string, record: VaultRecord) {
    const key = keyRef.current;
    if (!key) throw new Error("Vault is locked.");
    const sealed = await sealJson(key, record, recordContext(orgId, id));
    await api("/api/vault/records", { method: "PUT", body: JSON.stringify({ id, iv: sealed.iv, ciphertext: sealed.ct }) });
  }

  async function processFiles(files: File[]) {
    if (!files.length || !keyRef.current) return;
    setError("");
    touch();
    const { pdfToText } = await import("@/lib/vault/pdf-text");
    const problems: string[] = [];
    // Sequential on purpose: each invoice is compared with the ones before it.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBusy(`Checking ${i + 1} of ${files.length} on this device…`);
      try {
        if (file.type !== "application/pdf") { problems.push(`${file.name}: only PDF files are supported in the private workspace.`); continue; }
        const raw = await pdfToText(file);
        if (raw.replace(/\s/g, "").length < 40) { problems.push(`${file.name}: no text layer (scanned image). Scans are not supported in the private workspace yet.`); continue; }
        const record = checkInvoiceLocally(raw, file.name, historyRef.current);
        const id = crypto.randomUUID();
        await save(id, record);
        historyRef.current = [...historyRef.current, { id, record }];
        setRows((prev) => [...prev, { id, record }]);
      } catch (e) {
        problems.push(`${file.name}: ${e instanceof Error ? e.message : "could not be checked."}`);
      }
    }
    setBusy("");
    if (problems.length) setError(problems.join("\n"));
    if (input.current) input.current.value = "";
  }

  async function trySamples() {
    try {
      const files = await Promise.all(SAMPLE_INVOICES.map(async (s) => {
        const r = await fetch(`/samples/${s.filename}`);
        if (!r.ok) throw new Error("Could not load the sample invoices.");
        return new File([await r.blob()], s.filename, { type: "application/pdf" });
      }));
      await processFiles(files);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the sample invoices."); }
  }

  async function markReviewed(row: Row) {
    touch();
    const record = { ...row.record, reviewedAt: new Date().toISOString() };
    try {
      await save(row.id, record);
      historyRef.current = historyRef.current.map((h) => (h.id === row.id ? { id: h.id, record } : h));
      setRows((prev) => prev.map((r) => (r.id === row.id ? { id: r.id, record } : r)));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
  }

  async function remove(row: Row) {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    touch();
    try {
      await api(`/api/vault/records?id=${row.id}`, { method: "DELETE" });
      historyRef.current = historyRef.current.filter((h) => h.id !== row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setSelected(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete."); }
    setConfirmDelete(false);
  }

  const promise = <div className="vaultPromise"><ShieldCheck size={16}/><span><b>Invoices never leave this device.</b> They are read and checked in your browser. Foldline stores only data encrypted with your workspace passphrase, which we never see.</span></div>;

  if (phase === "loading") return <div className="dashboard"><p className="vaultMuted">Loading private workspace…</p></div>;
  if (phase === "error") return <div className="dashboard"><div className="formError">{error}</div></div>;

  if (phase === "setup" || phase === "locked") {
    const creating = phase === "setup";
    return <div className="dashboard"><div className="vaultGate">
      <div className="dropIcon"><LockKeyhole size={24}/></div>
      <span className="eyebrow">Private workspace</span>
      <h1>{creating ? "Create your workspace passphrase" : "Unlock your private workspace"}</h1>
      {promise}
      {creating && <div className="vaultWarn"><b>Write this passphrase down and keep it safe.</b> It is the only key to your data. If it is lost, nobody, including Foldline, can recover the invoices in this workspace. Share it only with colleagues who should see them.</div>}
      <form className="authForm" onSubmit={(e) => { e.preventDefault(); void (creating ? create() : unlock()); }}>
        <label>Passphrase<input type="password" autoComplete={creating ? "new-password" : "current-password"} value={pass} onChange={(e) => setPass(e.target.value)} placeholder={creating ? "At least 14 characters, e.g. four unrelated words" : ""} required /></label>
        {creating && <label>Repeat passphrase<input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} required /></label>}
        {creating && <label className="trialAccept"><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} /><span>I understand that a lost passphrase cannot be recovered.</span></label>}
        {error && <div className="formError" role="alert">{error}</div>}
        <button className="button buttonDark" disabled={Boolean(busy) || (creating && !understood)}>{busy || (creating ? "Create private workspace" : "Unlock")}</button>
      </form>
    </div></div>;
  }

  const sel = rows.find((r) => r.id === selected && !r.error);
  const match = sel?.record.duplicate ? rows.find((r) => r.id === sel.record.duplicate?.documentId && !r.error) : undefined;
  const counts = rows.reduce((acc, r) => { if (!r.error) acc[outcomeOf(r.record.validation)] += 1; return acc; }, { checked: 0, issue: 0, review: 0, not_invoice: 0 });

  return <div className="dashboard" onClick={touch}>
    <header className="dashHeader"><div><span className="eyebrow"><LockKeyhole size={13}/> Private workspace</span><h1>{counts.issue ? `${counts.issue} invoice${counts.issue === 1 ? "" : "s"} to resolve before payment.` : "Nothing blocking payment."}</h1></div><button className="button buttonGhost" onClick={lock}><Lock size={15}/>Lock</button></header>
    {promise}
    <section className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void processFiles(Array.from(e.dataTransfer.files)); }}>
      <input ref={input} type="file" hidden multiple accept="application/pdf" onChange={(e) => void processFiles(Array.from(e.target.files ?? []))} />
      <div className="dropIcon"><FileUp size={25}/></div>
      <h3>{busy || "Drop supplier invoices (PDF)"}</h3>
      <p>Checked on this device against every earlier invoice in this workspace. Upload in the order received.</p>
      {!busy && <div className="dropActions"><button className="button buttonDark" onClick={() => input.current?.click()}>Choose invoices</button><button className="button buttonGhost" onClick={() => void trySamples()}><FlaskConical size={15}/> Try with sample invoices</button></div>}
    </section>
    {error && <div className="formError vaultErrors" role="alert">{error}</div>}

    <section className="documentsSection">
      <div className="sectionHeader"><h2>Invoices</h2><span>{rows.length} · {counts.issue} issues · {counts.review} to review</span></div>
      <div className="vaultGrid">
        <div className="documentList">{rows.length ? rows.map((r) => {
          if (r.error) return <div className="documentRow" key={r.id}><div className="docName"><b>{r.record.filename}</b><span>{r.error}</span></div></div>;
          const o = outcomeOf(r.record.validation);
          const reason = r.record.validation.checks.find((c) => c.status === "fail")?.label ?? r.record.validation.extraction?.issues?.[0] ?? "";
          return <button type="button" className={`documentRow vaultRow ${selected === r.id ? "vaultRowActive" : ""}`} key={r.id} onClick={() => { setSelected(r.id); setConfirmDelete(false); }}>
            <div className="docName"><b>{r.record.filename}</b><span>{reason}</span></div>
            <span className={`status ${OUTCOME_CLASS[o]}`}>{OUTCOME_LABEL[o]}</span>
            <span className="riskText">{r.record.reviewedAt ? "approved" : ""}</span>
          </button>;
        }) : <div className="emptyList">No invoices yet. Try the sample invoices to see how it works.</div>}</div>

        {sel && <aside className="vaultDetail">
          <h3>{sel.record.filename}</h3>
          <span className={`status ${OUTCOME_CLASS[outcomeOf(sel.record.validation)]}`}>{OUTCOME_LABEL[outcomeOf(sel.record.validation)]}</span>
          <table className="vaultTable"><tbody>
            <tr><th>Supplier</th><td>{text(sel.record.data.supplier_name?.value)}</td></tr>
            <tr><th>BIN / IIN</th><td>{text(sel.record.data.supplier_bin?.value)}</td></tr>
            <tr><th>Invoice #</th><td>{text(sel.record.data.invoice_number?.value)}</td></tr>
            <tr><th>Date</th><td>{text(sel.record.data.invoice_date?.value)}</td></tr>
            <tr><th>Total</th><td>{money(sel.record.data.total?.value, sel.record.data.currency?.value)}</td></tr>
          </tbody></table>
          {sel.record.validation.checks.filter((c) => c.status !== "pass").map((c) => <div className={`check check-${c.status}`} key={c.id}><span className="checkDot"/><div><strong>{c.label}</strong><p>{c.message}</p></div></div>)}
          {sel.record.validation.extraction?.issues?.map((issue) => <p className="vaultMuted" key={issue}>{issue}</p>)}
          {match && <div className="vaultCompare"><h4>Compared with {match.record.filename}</h4><table className="vaultTable"><thead><tr><th/><th>This invoice</th><th>Earlier</th></tr></thead><tbody>
            <tr><th>Supplier</th><td>{text(sel.record.data.supplier_name?.value)}</td><td>{text(match.record.data.supplier_name?.value)}</td></tr>
            <tr><th>Invoice #</th><td>{text(sel.record.data.invoice_number?.value)}</td><td>{text(match.record.data.invoice_number?.value)}</td></tr>
            <tr><th>Date</th><td>{text(sel.record.data.invoice_date?.value)}</td><td>{text(match.record.data.invoice_date?.value)}</td></tr>
            <tr><th>Total</th><td>{money(sel.record.data.total?.value, sel.record.data.currency?.value)}</td><td>{money(match.record.data.total?.value, match.record.data.currency?.value)}</td></tr>
          </tbody></table></div>}
          <div className="dropActions vaultActions">
            {!sel.record.reviewedAt && <button className="button buttonAccent" onClick={() => void markReviewed(sel)}><Check size={15}/>Approve after review</button>}
            <button className={`button ${confirmDelete ? "buttonDanger" : "buttonGhost"}`} onClick={() => void remove(sel)}><Trash2 size={15}/>{confirmDelete ? "Click again to delete" : "Delete"}</button>
          </div>
        </aside>}
      </div>
    </section>
  </div>;
}
